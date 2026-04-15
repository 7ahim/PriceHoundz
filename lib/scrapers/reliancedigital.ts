// lib/scrapers/reliancedigital.ts
//
// Reliance Digital (reliancedigital.in) runs on Next.js with Cloudflare.
// Four strategies, tried in order:
//
//  1. __NEXT_DATA__ direct fetch  — RD embeds all product data in the Next.js
//                                   server-side props JSON blob. Fast, no JS needed.
//
//  2. Product API endpoint         — RD exposes a REST API for product details
//                                   that the React app calls during hydration.
//
//  3. Mobile / AMP fetch           — Lighter stack, weaker bot detection.
//
//  4. Puppeteer stealth            — Full browser last resort.

import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import {
  launchBrowser, stealthPage, randomDelay, randomUserAgent, type ScrapeResult,
} from "./base";

// ── Price selectors (RD class names) ─────────────────────────
const PRICE_SELECTORS = [
  // 2024 layout
  "span.pdp__offerPrice",
  "span.pdp__price",
  "[class*='offerPrice']",
  "[class*='finalPrice']",
  "[class*='selling-price']",
  ".pdp-price",
  // Generic fallbacks
  "[itemprop='price']",
  "[data-testid='pdp-price']",
];

const NAME_SELECTORS = [
  "h1.pdp__title",
  "h1[class*='title']",
  "h1[class*='name']",
  ".pdp__name",
  "h1",
];

// ── Helpers ───────────────────────────────────────────────────
function parsePrice(raw: string): number | null {
  // Handles "₹24,990", "24990", "24,990.00"
  const cleaned = raw.replace(/[₹,\s\u20B9Rs.]/g, "").split(".")[0].trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

function normaliseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = "www.reliancedigital.in";
    // Strip tracking params
    ["utm_source","utm_medium","utm_campaign","ref","source"].forEach(
      (p) => parsed.searchParams.delete(p)
    );
    return parsed.toString();
  } catch {
    return url;
  }
}

// Extract product ID from RD URL
// RD URLs: /sony-wh1000xm5-wireless-headphones/p/493057203
function extractProductId(url: string): string | null {
  try {
    const path  = new URL(url).pathname;
    // Last segment after /p/ is the product ID
    const match = path.match(/\/p\/(\d+)/);
    if (match?.[1]) return match[1];
    // Fallback: any long number in the path
    const num = path.match(/(\d{6,})/);
    if (num?.[1]) return num[1];
  } catch {}
  return null;
}

// ── Parse __NEXT_DATA__ JSON blob ─────────────────────────────
function parseNextData(html: string): ScrapeResult | null {
  try {
    const $ = cheerio.load(html);

    // Block check
    const title = $("title").text().toLowerCase();
    if (
      title.includes("access denied") ||
      title.includes("403") ||
      title.includes("blocked")
    ) return null;

    // ── Try __NEXT_DATA__ script tag ──────────────────────────
    const nextDataRaw = $("#__NEXT_DATA__").html();
    if (nextDataRaw) {
      try {
        const nextData = JSON.parse(nextDataRaw);
        const result = walkForPrice(nextData);
        if (result?.price) return result;
      } catch {}
    }

    // ── Try inline script JSON blobs ─────────────────────────
    let result = null as ScrapeResult | null;
    $("script").each((_: number, el: Element) => {
      if (result?.price) return false;
      const text = $(el).html() ?? "";
      if (
        text.includes("offerPrice") ||
        text.includes("sellingPrice") ||
        text.includes("finalPrice") ||
        text.includes('"price"')
      ) {
        result = extractFromJsonString(text) as ScrapeResult | null;
      }
    });
    if ((result as ScrapeResult | null)?.price) return result as ScrapeResult;

    // ── DOM selectors ─────────────────────────────────────────
    // JSON-LD
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

    if (!price) {
      // Try meta tags
      const metaPrice =
        $('meta[itemprop="price"]').attr("content") ||
        $('meta[property="product:price:amount"]').attr("content");
      if (metaPrice) price = parsePrice(metaPrice);
    }

    if (!price) {
      for (const sel of PRICE_SELECTORS) {
        const raw = $(sel).first().text().trim();
        if (raw) { price = parsePrice(raw); if (price) break; }
      }
    }

    if (!price) return null;

    let name: string | null = null;
    for (const sel of NAME_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw.length > 3) { name = raw.slice(0, 200); break; }
    }

    const imageUrl =
      $('meta[property="og:image"]').attr("content") ||
      $("img.pdp__image, img[class*='product-image']").first().attr("src") ||
      null;

    const bodyText = $("body").text().toLowerCase();
    const available =
      !bodyText.includes("out of stock") &&
      !bodyText.includes("sold out") &&
      !bodyText.includes("currently unavailable");

    return { price, name, imageUrl: imageUrl ?? null, available };
  } catch {
    return null;
  }
}

// Walk Next.js page props tree looking for price data
function walkForPrice(data: any): ScrapeResult | null {
  try {
    const raw = JSON.stringify(data);
    return extractFromJsonString(raw);
  } catch {
    return null;
  }
}

function extractFromJsonString(text: string): ScrapeResult | null {
  try {
    let price: number | null = null;
    const patterns = [
      /"offerPrice"\s*:\s*(\d+)/,
      /"discountedPrice"\s*:\s*(\d+)/,
      /"sellingPrice"\s*:\s*(\d+)/,
      /"finalPrice"\s*:\s*(\d+)/,
      /"price"\s*:\s*(\d+)/,
      /"specialPrice"\s*:\s*(\d+)/,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.[1]) {
        const n = parseInt(m[1], 10);
        if (n > 100 && n < 10_000_000) { price = n; break; }
      }
    }
    if (!price) return null;

    const namePatterns = [
      /"productName"\s*:\s*"([^"]{5,200})"/,
      /"name"\s*:\s*"([^"]{5,200})"/,
      /"title"\s*:\s*"([^"]{5,200})"/,
      /"displayName"\s*:\s*"([^"]{5,200})"/,
    ];
    let name: string | null = null;
    for (const re of namePatterns) {
      const m = text.match(re);
      if (m?.[1]) { name = m[1].slice(0, 200); break; }
    }

    const imgMatch = text.match(/"(?:image|imageUrl|img)"\s*:\s*"(https?:[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
    const imageUrl = imgMatch?.[1] ?? null;

    return { price, name, imageUrl, available: true };
  } catch {
    return null;
  }
}

// ── Strategy 1: __NEXT_DATA__ direct fetch ────────────────────
async function tryNextDataFetch(url: string): Promise<ScrapeResult | null> {
  const profiles: Record<string, string>[] = [
    {
      "User-Agent":       randomUserAgent(),
      "Accept":           "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language":  "en-IN,en;q=0.9",
      "Accept-Encoding":  "gzip, deflate, br",
      "Cache-Control":    "max-age=0",
      "Sec-Fetch-Dest":   "document",
      "Sec-Fetch-Mode":   "navigate",
      "Sec-Fetch-Site":   "none",
      "Sec-Fetch-User":   "?1",
      "Referer":          "https://www.google.com/",
    },
    {
      "User-Agent":       "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
      "Accept":           "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language":  "en-IN,en;q=0.8",
      "Referer":          "https://www.google.co.in/",
      "Sec-Fetch-Dest":   "document",
      "Sec-Fetch-Mode":   "navigate",
    },
  ];

  for (const headers of profiles) {
    try {
      const res = await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const html   = await res.text();
      const result = parseNextData(html);
      if (result?.price) return result;
    } catch {}
    await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

// ── Strategy 2: Reliance Digital product API ──────────────────
async function tryProductApi(productId: string): Promise<ScrapeResult | null> {
  // RD's internal API endpoints (discovered from network tab analysis)
  const endpoints = [
    `https://www.reliancedigital.in/rildigitalws/v2/rrldigital/cms/pageData?pageType=PDP&pageId=${productId}`,
    `https://www.reliancedigital.in/rildigitalws/v2/rrldigital/products/${productId}`,
    `https://www.reliancedigital.in/api/products/${productId}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          "User-Agent":       randomUserAgent(),
          "Accept":           "application/json, text/plain, */*",
          "Accept-Language":  "en-IN,en;q=0.9",
          "Referer":          "https://www.reliancedigital.in/",
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("json")) continue;

      const json = await res.json();
      const raw  = JSON.stringify(json);
      const result = extractFromJsonString(raw);
      if (result?.price) return result;
    } catch {}
  }
  return null;
}

// ── Strategy 3: Mobile fetch ──────────────────────────────────
async function tryMobileFetch(url: string): Promise<ScrapeResult | null> {
  const mobileAgents = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/18.0 Chrome/107.0.5304.141 Mobile Safari/537.36",
  ];

  for (const ua of mobileAgents) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":      ua,
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-IN,en;q=0.9",
          "Referer":         "https://www.google.co.in/",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const html   = await res.text();
      const result = parseNextData(html);
      if (result?.price) return result;
    } catch {}
  }
  return null;
}

// ── Strategy 4: Puppeteer ─────────────────────────────────────
async function tryPuppeteer(url: string): Promise<ScrapeResult | null> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(randomUserAgent());
    await page.setViewport({ width: 1366, height: 768 });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver",          { get: () => undefined });
      Object.defineProperty(navigator, "languages",          { get: () => ["en-IN", "en-US", "en"] });
      Object.defineProperty(navigator, "hardwareConcurrency",{ get: () => 8 });
      (window as any).chrome = { runtime: {}, app: { isInstalled: false } };
    });

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-IN,en;q=0.9",
      "Referer":         "https://www.google.com/",
    });

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (type === "script") { req.continue(); return; }
      if (type === "media" || type === "font") { req.abort(); return; }
      req.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Wait for price element or timeout
    await page.waitForSelector(
      PRICE_SELECTORS.join(", "),
      { timeout: 12_000 }
    ).catch(() => {});

    await randomDelay(1500, 3000);

    const html = await page.content();
    await browser.close();
    return parseNextData(html);
  } catch {
    await browser.close().catch(() => {});
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────
export async function scrapeRelianceDigital(url: string): Promise<ScrapeResult> {
  const cleanUrl   = normaliseUrl(url);
  const productId  = extractProductId(cleanUrl);

  console.log(`[reliance] Scraping ${cleanUrl} (ID: ${productId ?? "unknown"})`);

  // Strategy 1: __NEXT_DATA__
  console.log("[reliance] Trying __NEXT_DATA__ fetch...");
  const nextResult = await tryNextDataFetch(cleanUrl);
  if (nextResult?.price) {
    console.log(`[reliance] __NEXT_DATA__ succeeded: ₹${nextResult.price}`);
    return nextResult;
  }

  // Strategy 2: Product API
  if (productId) {
    console.log("[reliance] Trying product API...");
    const apiResult = await tryProductApi(productId);
    if (apiResult?.price) {
      console.log(`[reliance] API succeeded: ₹${apiResult.price}`);
      return apiResult;
    }
  }

  // Strategy 3: Mobile fetch
  console.log("[reliance] Trying mobile fetch...");
  const mobileResult = await tryMobileFetch(cleanUrl);
  if (mobileResult?.price) {
    console.log(`[reliance] Mobile fetch succeeded: ₹${mobileResult.price}`);
    return mobileResult;
  }

  // Strategy 4: Puppeteer
  console.log("[reliance] Trying Puppeteer...");
  await randomDelay(1500, 3000);
  const puppeteerResult = await tryPuppeteer(cleanUrl);
  if (puppeteerResult?.price) {
    console.log(`[reliance] Puppeteer succeeded: ₹${puppeteerResult.price}`);
    return puppeteerResult;
  }

  console.error(`[reliance] All strategies failed for ${cleanUrl}`);
  return {
    price:     null,
    name:      null,
    imageUrl:  null,
    available: false,
    error:     "All scraping strategies failed for Reliance Digital.",
  };
}