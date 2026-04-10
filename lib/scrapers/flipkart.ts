// lib/scrapers/flipkart.ts
//
// Flipkart anti-block strategy — 4 layers, tried in order:
//
//  1. Flipkart internal API    — intercepts the XHR Flipkart's own app makes
//  2. Flipkart mobile site     — m.flipkart.com has weaker bot detection
//  3. Puppeteer deep stealth   — full browser with network interception
//  4. Plain fetch + JSON parse — tries __INITIAL_STATE__ from raw HTML
//
// Flipkart's main protection is Cloudflare + TLS fingerprinting.
// The mobile site (m.flipkart.com) runs a different stack that bypasses
// most of this. Strategy 1 intercepts the actual price API call.

import * as cheerio from "cheerio";
import {
  launchBrowser, stealthPage, randomDelay, randomUserAgent, type ScrapeResult,
} from "./base";

// ── Price selectors (Flipkart changes class names frequently) ─
const PRICE_SELECTORS = [
  // 2024 layout — selling price
  "div.Nx9bqj.CxhGGd",
  "div._30jeq3._16Jk6d",
  "div._30jeq3",
  "._25b18cr ._30jeq3",
  "div.CEmiEU > div.Nx9bqj",
  // Older layout
  "div._16Jk6d",
  "div.dyC4hf",
  // Generic price container
  "[class*='price'] [class*='Nx9bqj']",
  "[class*='finalPrice']",
];

const NAME_SELECTORS = [
  "span.VU-ZEz",        // 2024 product title
  "span.B_NuCI",        // older
  "h1._9E25nV span",
  "h1.yhB1nd",
  "h1 span",
  ".pdp-e-i-head",
];

const IMAGE_SELECTORS = [
  "img._53J4C._2amPTt",
  "img._396cs4._2amPTt._3qGmMb",
  "img._396cs4",
  "div._3nMexc img",
  "div._2r_T1I img",
];

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s\u20B9]/g, "").split(".")[0].trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// Extract product ID / slug from Flipkart URL
function normaliseUrl(url: string): { desktop: string; mobile: string } {
  try {
    const parsed = new URL(url);
    // Ensure it's flipkart.com
    parsed.hostname = "www.flipkart.com";
    // Remove tracking params but keep pid/lid which affect product routing
    ["affid", "affExtParam1", "affExtParam2", "otracker", "otrackingid",
      "fm", "ssid", "sl", "srno", "query", "cmpid"].forEach(
      (p) => parsed.searchParams.delete(p)
    );
    const desktop = parsed.toString();
    const mobile  = desktop.replace("www.flipkart.com", "m.flipkart.com");
    return { desktop, mobile };
  } catch {
    return { desktop: url, mobile: url.replace("www.flipkart.com", "m.flipkart.com") };
  }
}

// ── Deep JSON extraction from script tags ─────────────────────
function extractFromScripts($: cheerio.CheerioAPI): { price: number | null; name: string | null } {
  let price: number | null = null;
  let name:  string | null  = null;

  $("script").each((_, el) => {
    if (price) return false; // already found

    const text = $(el).html() ?? "";

    // Look for window.__INITIAL_STATE__ or similar JSON blobs
    if (!text.includes("finalPrice") && !text.includes("sellingPrice") &&
        !text.includes("price") && !text.includes("mrp")) return;

    // Try multiple price keys in priority order
    const pricePatterns = [
      /"finalPrice"\s*:\s*\{[^}]*"value"\s*:\s*(\d+)/,
      /"sellingPrice"\s*:\s*\{[^}]*"value"\s*:\s*(\d+)/,
      /"finalPrice"\s*:\s*(\d+)/,
      /"sellingPrice"\s*:\s*(\d+)/,
      /"discountedPrice"\s*:\s*(\d+)/,
      /"price"\s*:\s*\{[^}]*"value"\s*:\s*(\d+)/,
      /"value"\s*:\s*(\d+).*?"currency"\s*:\s*"INR"/,
    ];

    for (const re of pricePatterns) {
      const m = text.match(re);
      if (m?.[1]) {
        const n = parseInt(m[1], 10);
        if (n > 100 && n < 10_000_000) { // sanity check
          price = n;
          break;
        }
      }
    }

    // Try to extract name from the same blob
    if (!name) {
      const nameMatch =
        text.match(/"title"\s*:\s*"([^"]{5,200})"/) ||
        text.match(/"productName"\s*:\s*"([^"]{5,200})"/) ||
        text.match(/"name"\s*:\s*"([^"]{5,200})"/);
      if (nameMatch?.[1]) name = nameMatch[1];
    }
  });

  return { price, name };
}

// ── Parse HTML — shared across strategies ─────────────────────
function parseFlipkartHtml(html: string): ScrapeResult | null {
  const $ = cheerio.load(html);

  // Bot wall detection
  const bodyText = $("body").text().toLowerCase();
  if (
    bodyText.includes("access denied") ||
    bodyText.includes("unusual traffic") ||
    bodyText.includes("verify you are human") ||
    bodyText.includes("please verify") ||
    $("title").text().toLowerCase().includes("access denied")
  ) {
    return null;
  }

  // ── JSON-LD first ────────────────────────────────────────
  let price: number | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (price) return;
    try {
      const data  = JSON.parse($(el).html() ?? "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const offer = item?.offers ?? item?.offer;
        const p     = offer?.price ?? offer?.lowPrice;
        if (p) {
          const n = parsePrice(String(p));
          if (n) { price = n; break; }
        }
      }
    } catch {}
  });

  // ── DOM selectors ────────────────────────────────────────
  if (!price) {
    for (const sel of PRICE_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw) { price = parsePrice(raw); if (price) break; }
    }
  }

  // ── Script JSON extraction ───────────────────────────────
  const { price: scriptPrice, name: scriptName } = extractFromScripts($);
  if (!price && scriptPrice) price = scriptPrice;
  if (!price) return null;

  // ── Name ────────────────────────────────────────────────
  let name: string | null = null;
  for (const sel of NAME_SELECTORS) {
    const raw = $(sel).first().text().trim();
    if (raw.length > 4) { name = raw.slice(0, 200); break; }
  }
  if (!name && scriptName) name = scriptName.slice(0, 200);

  // ── Image ────────────────────────────────────────────────
  let imageUrl: string | null = null;
  for (const sel of IMAGE_SELECTORS) {
    const src = $(sel).first().attr("src");
    if (src?.startsWith("http")) { imageUrl = src; break; }
  }

  // ── Availability ─────────────────────────────────────────
  const available =
    !bodyText.includes("sold out") &&
    !bodyText.includes("out of stock") &&
    !bodyText.includes("currently unavailable");

  return { price, name, imageUrl, available };
}

// ── Strategy 1: Intercept Flipkart's own price API call ───────
// Flipkart's React app calls an internal API to get price data.
// We use Puppeteer's request interception to capture that response
// before Cloudflare can fingerprint the browser session.
async function tryApiInterception(desktopUrl: string): Promise<ScrapeResult | null> {
  const browser = await launchBrowser();

  try {
    const page = await stealthPage(browser);
    let capturedPrice: number | null = null;
    let capturedName:  string | null = null;

    // Intercept all responses and look for the price API
    page.on("response", async (response) => {
      if (capturedPrice) return;
      const url = response.url();

      // Flipkart's product data APIs
      if (
        url.includes("flipkart.com/api/") ||
        url.includes("/product/") ||
        url.includes("pageDataV4") ||
        url.includes("pricingv3") ||
        (url.includes("flipkart") && url.includes("json"))
      ) {
        try {
          const ct = response.headers()["content-type"] ?? "";
          if (!ct.includes("json")) return;

          const json = await response.json().catch(() => null);
          if (!json) return;

          const text = JSON.stringify(json);

          // Look for price in the API response
          const pricePatterns = [
            /"finalPrice"\s*:\s*\{[^}]*"value"\s*:\s*(\d+)/,
            /"sellingPrice"\s*:\s*\{[^}]*"value"\s*:\s*(\d+)/,
            /"finalPrice"\s*:\s*(\d+)/,
            /"sellingPrice"\s*:\s*(\d+)/,
          ];

          for (const re of pricePatterns) {
            const m = text.match(re);
            if (m?.[1]) {
              const n = parseInt(m[1], 10);
              if (n > 100) { capturedPrice = n; break; }
            }
          }

          const nm = text.match(/"title"\s*:\s*"([^"]{5,200})"/);
          if (nm?.[1]) capturedName = nm[1];
        } catch {}
      }
    });

    await page.goto(desktopUrl, {
      waitUntil: "domcontentloaded",
      timeout: 25_000,
    });

    // Wait briefly for XHR calls to fire
    await randomDelay(2000, 3500);

    await browser.close();

    if (capturedPrice) {
      return { price: capturedPrice, name: capturedName, imageUrl: null, available: true };
    }
    return null;
  } catch {
    await browser.close().catch(() => {});
    return null;
  }
}

// ── Strategy 2: Mobile site (m.flipkart.com) ─────────────────
// The mobile site uses a different CDN + WAF config.
// It also renders prices server-side in many cases.
async function tryMobileSite(mobileUrl: string): Promise<ScrapeResult | null> {
  const mobileAgents = [
    // Android Chrome
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
    // iPhone Safari
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    // Samsung browser
    "Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/18.0 Chrome/107.0.5304.141 Mobile Safari/537.36",
  ];

  for (const ua of mobileAgents) {
    try {
      const res = await fetch(mobileUrl, {
        headers: {
          "User-Agent":      ua,
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-IN,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Referer":         "https://www.google.com/",
          "Cache-Control":   "no-cache",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) continue;

      const html   = await res.text();
      const result = parseFlipkartHtml(html);
      if (result?.price) return result;
    } catch {}
  }
  return null;
}

// ── Strategy 3: Puppeteer via mobile viewport ─────────────────
// Use Puppeteer but with a mobile user agent + viewport.
// Flipkart's mobile detection triggers a simpler page load
// that's less aggressive with bot checks.
async function tryPuppeteerMobile(mobileUrl: string): Promise<ScrapeResult | null> {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();

    const mobileUA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36";
    await page.setUserAgent(mobileUA);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    // Mask automation signals
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver",  { get: () => undefined });
      Object.defineProperty(navigator, "plugins",    { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, "languages",  { get: () => ["en-IN", "en"] });
      (window as any).chrome = { runtime: {} };
    });

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-IN,en;q=0.9",
      "Referer":         "https://www.google.com/",
    });

    // Block heavy resources
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const blocked = ["image", "media", "font"];
      blocked.includes(req.resourceType()) ? req.abort() : req.continue();
    });

    await page.goto(mobileUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Wait for price content
    await page.waitForSelector(
      "div.Nx9bqj, ._30jeq3, div.dyC4hf, [class*='price']",
      { timeout: 12_000 }
    ).catch(() => {});

    await randomDelay(800, 1800);

    const html   = await page.content();
    await browser.close();

    return parseFlipkartHtml(html);
  } catch {
    await browser.close().catch(() => {});
    return null;
  }
}

// ── Strategy 4: Raw fetch with varied headers ─────────────────
async function tryDirectFetch(desktopUrl: string): Promise<ScrapeResult | null> {
  const attempts = [
    // Googlebot — Flipkart often serves simpler pages to crawlers
    {
      ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      ref: "https://www.google.com/",
    },
    // Regular Chrome with Indian locale
    {
      ua: randomUserAgent(),
      ref: "https://www.google.co.in/",
    },
    // Bingbot
    {
      ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      ref: "https://www.bing.com/",
    },
  ];

  for (const { ua, ref } of attempts) {
    try {
      const res = await fetch(desktopUrl, {
        headers: {
          "User-Agent":      ua,
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-IN,en;q=0.9",
          "Referer":         ref,
          "Cache-Control":   "no-cache",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) continue;

      const html   = await res.text();
      const result = parseFlipkartHtml(html);
      if (result?.price) return result;
    } catch {}
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────
export async function scrapeFlipkart(url: string): Promise<ScrapeResult> {
  const { desktop, mobile } = normaliseUrl(url);

  console.log(`[flipkart] Scraping ${desktop}`);

  // ── Strategy 1: Intercept Flipkart's price API ───────────
  console.log("[flipkart] Trying API interception...");
  const apiResult = await tryApiInterception(desktop);
  if (apiResult?.price) {
    console.log(`[flipkart] API interception succeeded: ₹${apiResult.price}`);
    return apiResult;
  }

  // ── Strategy 2: Mobile site fetch ───────────────────────
  console.log("[flipkart] Trying mobile site...");
  const mobileResult = await tryMobileSite(mobile);
  if (mobileResult?.price) {
    console.log(`[flipkart] Mobile site succeeded: ₹${mobileResult.price}`);
    return mobileResult;
  }

  // ── Strategy 3: Puppeteer mobile viewport ───────────────
  console.log("[flipkart] Trying Puppeteer mobile...");
  await randomDelay(2000, 4000);
  const puppeteerResult = await tryPuppeteerMobile(mobile);
  if (puppeteerResult?.price) {
    console.log(`[flipkart] Puppeteer mobile succeeded: ₹${puppeteerResult.price}`);
    return puppeteerResult;
  }

  // ── Strategy 4: Direct fetch ─────────────────────────────
  console.log("[flipkart] Trying direct fetch...");
  const fetchResult = await tryDirectFetch(desktop);
  if (fetchResult?.price) {
    console.log(`[flipkart] Direct fetch succeeded: ₹${fetchResult.price}`);
    return fetchResult;
  }

  console.error(`[flipkart] All strategies failed for ${desktop}`);
  return {
    price:     null,
    name:      null,
    imageUrl:  null,
    available: false,
    error:     "All scraping strategies failed. Flipkart may be blocking this IP.",
  };
}