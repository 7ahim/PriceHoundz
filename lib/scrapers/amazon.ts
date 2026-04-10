// lib/scrapers/amazon.ts
//
// Anti-CAPTCHA strategy — 4 layers, tried in order:
//
//  1. Amazon India JSON endpoint  — no browser, no CAPTCHA risk at all
//  2. Puppeteer with full stealth — human-like browsing behaviour
//  3. Puppeteer via Google cache  — fetches through Google's cached copy
//  4. Plain fetch + Cheerio       — lightweight fallback on non-JS price pages
//
// If layer 1 works (it usually does for .in products), layers 2–4 never run.

import * as cheerio from "cheerio";
import {
  launchBrowser, stealthPage, randomDelay, randomUserAgent, type ScrapeResult,
} from "./base";

// ── Selectors — ordered by reliability ───────────────────────
const PRICE_SELECTORS = [
  ".priceToPay .a-price-whole",
  ".priceToPay span[aria-hidden='true']",
  "#corePriceDisplay_desktop_feature_div .a-price-whole",
  "#apex_desktop .a-price-whole",
  "#apex_desktop_newAccordionRow .a-price-whole",
  ".apexPriceToPay .a-price-whole",
  "#priceblock_ourprice",
  "#priceblock_dealprice",
  "#sns-base-price",
  ".a-price.reinventPricePriceToPayMargin .a-price-whole",
  "#corePrice_desktop .a-price-whole",
  "#corePrice_feature_div .a-price-whole",
  ".a-color-price",
];

const NAME_SELECTORS = [
  "#productTitle",
  "#title span",
  "h1.product-title-word-break",
];

const IMAGE_SELECTORS = [
  "#landingImage",
  "#imgBlkFront",
  "#ebooksImgBlkFront",
  ".a-dynamic-image[data-a-dynamic-image]",
];

function parsePrice(raw: string): number | null {
  // Handles "24,990", "₹24,990", "24,990.00", "24990"
  const cleaned = raw.replace(/[₹,\s\u20B9]/g, "").split(".")[0].trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// Extract ASIN from any Amazon URL format
function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/ASIN\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /([A-Z0-9]{10})(?:[/?]|$)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1].toUpperCase();
  }
  return null;
}

// Normalise to a clean amazon.in dp URL
function normaliseUrl(url: string): string {
  try {
    const asin = extractAsin(url);
    if (asin) return `https://www.amazon.in/dp/${asin}`;
    const parsed = new URL(url);
    parsed.hostname = "www.amazon.in";
    // Only strip tracking params — keep dp/ref that affect routing
    ["tag", "linkCode", "linkId", "psc", "smid", "th"].forEach(
      (p) => parsed.searchParams.delete(p)
    );
    return parsed.toString();
  } catch {
    return url;
  }
}

// ── Strategy 1: Amazon JSON / offers-display API ─────────────
// Amazon exposes a semi-public JSON endpoint for price data.
// No JS execution required, much harder to CAPTCHA.
async function tryJsonApi(asin: string): Promise<ScrapeResult | null> {
  // Attempt the offers-display endpoint
  const endpoints = [
    `https://www.amazon.in/gp/product/ajax/ref=dp_aod_unknown_mbc?asin=${asin}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp&experienceId=aodAjaxMain`,
    `https://www.amazon.in/dp/offers/${asin}?_encoding=UTF8&sr=`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          "User-Agent": randomUserAgent(),
          "Accept": "text/html,*/*",
          "Accept-Language": "en-IN,en;q=0.9",
          "Referer": `https://www.amazon.in/dp/${asin}`,
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) continue;

      const text = await res.text();
      const $    = cheerio.load(text);

      // Parse price from the offers panel
      let price: number | null = null;
      const priceSelectors = [
        ".a-price .a-offscreen",
        ".a-price-whole",
        ".a-color-price",
        "[data-aod-price-to-pay]",
      ];
      for (const sel of priceSelectors) {
        const raw = $(sel).first().text().trim();
        if (raw) { price = parsePrice(raw); if (price) break; }
      }

      if (price && price > 0) {
        return { price, name: null, imageUrl: null, available: true };
      }
    } catch {
      // Endpoint unavailable — try next
    }
  }
  return null;
}

// ── Strategy 2: Puppeteer with deep stealth ───────────────────
async function tryPuppeteer(cleanUrl: string): Promise<ScrapeResult | null> {
  const browser = await launchBrowser();

  try {
    const page = await stealthPage(browser);

    // Extra stealth patches on top of base stealthPage()
    await page.evaluateOnNewDocument(() => {
      // Patch chrome runtime — headless Chrome lacks this
      (window as any).chrome = {
        runtime: { onConnect: { addListener: () => {} } },
        app: { isInstalled: false },
      };
      // Patch permissions API — bots often don't have it
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        (window.navigator.permissions as any).query = (params: any) =>
          params.name === "notifications"
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(params);
      }
      // Randomise screen dimensions slightly
      Object.defineProperty(screen, "width",       { get: () => 1920 });
      Object.defineProperty(screen, "height",      { get: () => 1080 });
      Object.defineProperty(screen, "availWidth",  { get: () => 1920 });
      Object.defineProperty(screen, "availHeight", { get: () => 1040 });
      Object.defineProperty(screen, "colorDepth",  { get: () => 24  });
    });

    // Visit Amazon homepage first to establish a "session" — reduces bot signals
    await page.goto("https://www.amazon.in", {
      waitUntil: "domcontentloaded",
      timeout:   20_000,
    });
    await randomDelay(1000, 2500);

    // Now navigate to the product page
    await page.goto(cleanUrl, {
      waitUntil: "domcontentloaded",
      timeout:   30_000,
    });

    // Wait for price OR CAPTCHA — whichever arrives first
    const result = await Promise.race([
      page.waitForSelector("#corePriceDisplay_desktop_feature_div, .priceToPay, #priceblock_ourprice", { timeout: 15_000 })
        .then(() => "price"),
      page.waitForSelector("form[action='/errors/validateCaptcha'], input#captchacharacters", { timeout: 15_000 })
        .then(() => "captcha"),
    ]).catch(() => "timeout");

    if (result === "captcha") {
      await browser.close();
      return null; // Signal caller to try next strategy
    }

    // Human-like: scroll down a little
    await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 300) + 200));
    await randomDelay(600, 1400);

    const html = await page.content();
    await browser.close();

    return parseAmazonHtml(html);
  } catch (err: any) {
    await browser.close().catch(() => {});
    return null;
  }
}

// ── Strategy 3: Google Cache fetch ───────────────────────────
// Google's cached version of the page often has price data
// and bypasses Amazon's bot detection entirely.
async function tryGoogleCache(asin: string): Promise<ScrapeResult | null> {
  const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:amazon.in/dp/${asin}&hl=en`;

  try {
    const res = await fetch(cacheUrl, {
      headers: {
        "User-Agent": randomUserAgent(),
        "Accept-Language": "en-IN,en;q=0.9",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    // Make sure it's actually an Amazon page
    if (!html.includes("amazon") || !html.includes("price")) return null;

    return parseAmazonHtml(html);
  } catch {
    return null;
  }
}

// ── Strategy 4: Direct fetch + Cheerio ───────────────────────
// Works occasionally when Amazon serves a simpler page to fetch()
async function tryDirectFetch(cleanUrl: string): Promise<ScrapeResult | null> {
  const agents = [
    // Googlebot — sometimes gets a simpler page
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    // Real Chrome
    randomUserAgent(),
    // Kindle Silk browser — Amazon's own browser, never blocked
    "Mozilla/5.0 (Linux; Android 9; KFJWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/95.3.2 like Chrome/95.0.4638.74 Safari/537.36",
  ];

  for (const ua of agents) {
    try {
      const res = await fetch(cleanUrl, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-IN,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) continue;

      const html   = await res.text();
      const result = parseAmazonHtml(html);
      if (result?.price) return result;
    } catch {
      // Try next agent
    }
  }
  return null;
}

// ── HTML parser — shared across all strategies ────────────────
function parseAmazonHtml(html: string): ScrapeResult | null {
  const $ = cheerio.load(html);

  // CAPTCHA check
  const title = $("title").text().toLowerCase();
  if (
    title.includes("robot check") ||
    title.includes("captcha") ||
    title.includes("sorry") ||
    $("form[action='/errors/validateCaptcha']").length > 0 ||
    $("#captchacharacters").length > 0
  ) {
    return null;
  }

  // ── Try JSON-LD first — most reliable price source ────────
  let price: number | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (price) return;
    try {
      const data  = JSON.parse($(el).html() ?? "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const offer = item?.offers ?? item?.offer;
        const p     = offer?.price ?? offer?.lowPrice;
        if (p) { const n = parsePrice(String(p)); if (n) { price = n; break; } }
      }
    } catch {}
  });

  // ── DOM selectors ────────────────────────────────────────
  if (!price) {
    // Try the offscreen price (most reliable — used for screen readers)
    const offscreen = $(".priceToPay .a-offscreen, #corePriceDisplay_desktop_feature_div .a-offscreen")
      .first().text().trim();
    if (offscreen) price = parsePrice(offscreen);
  }

  if (!price) {
    for (const sel of PRICE_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw) { price = parsePrice(raw); if (price) break; }
    }
  }

  if (!price) return null;

  // ── Name ────────────────────────────────────────────────
  let name: string | null = null;
  for (const sel of NAME_SELECTORS) {
    const raw = $(sel).first().text().trim();
    if (raw) { name = raw.slice(0, 200); break; }
  }

  // ── Image ────────────────────────────────────────────────
  let imageUrl: string | null = null;
  for (const sel of IMAGE_SELECTORS) {
    const el  = $(sel).first();
    const src = el.attr("src") || el.attr("data-old-hires") || el.attr("data-src");
    if (src && src.startsWith("http")) { imageUrl = src; break; }
    // Try data-a-dynamic-image JSON (contains multiple sizes)
    const dynJson = el.attr("data-a-dynamic-image");
    if (dynJson) {
      try {
        const urls = Object.keys(JSON.parse(dynJson));
        if (urls[0]) { imageUrl = urls[0]; break; }
      } catch {}
    }
  }

  // ── Availability ─────────────────────────────────────────
  const avail      = $("#availability span").text().toLowerCase();
  const available  =
    !avail.includes("unavailable") &&
    !avail.includes("out of stock") &&
    !avail.includes("currently unavailable");

  return { price, name, imageUrl, available };
}

// ── Main export ───────────────────────────────────────────────
export async function scrapeAmazon(url: string): Promise<ScrapeResult> {
  const cleanUrl = normaliseUrl(url);
  const asin     = extractAsin(cleanUrl);

  console.log(`[amazon] Scraping ${cleanUrl} (ASIN: ${asin ?? "unknown"})`);

  // ── Strategy 1: JSON API (fastest, no CAPTCHA risk) ──────
  if (asin) {
    console.log("[amazon] Trying JSON API...");
    const jsonResult = await tryJsonApi(asin);
    if (jsonResult?.price) {
      console.log(`[amazon] JSON API succeeded: ₹${jsonResult.price}`);
      return jsonResult;
    }
  }

  // ── Strategy 2: Puppeteer with deep stealth ──────────────
  console.log("[amazon] Trying Puppeteer...");
  const puppeteerResult = await tryPuppeteer(cleanUrl);
  if (puppeteerResult?.price) {
    console.log(`[amazon] Puppeteer succeeded: ₹${puppeteerResult.price}`);
    return puppeteerResult;
  }

  // ── Strategy 3: Google Cache ─────────────────────────────
  if (asin) {
    console.log("[amazon] Trying Google Cache...");
    await randomDelay(1500, 3000); // Don't hammer Google
    const cacheResult = await tryGoogleCache(asin);
    if (cacheResult?.price) {
      console.log(`[amazon] Google Cache succeeded: ₹${cacheResult.price}`);
      return cacheResult;
    }
  }

  // ── Strategy 4: Direct fetch ─────────────────────────────
  console.log("[amazon] Trying direct fetch...");
  const fetchResult = await tryDirectFetch(cleanUrl);
  if (fetchResult?.price) {
    console.log(`[amazon] Direct fetch succeeded: ₹${fetchResult.price}`);
    return fetchResult;
  }

  // All strategies failed
  console.error(`[amazon] All strategies failed for ${cleanUrl}`);
  return {
    price:     null,
    name:      null,
    imageUrl:  null,
    available: false,
    error:     "All scraping strategies failed. Amazon may be rate-limiting this IP.",
  };
}