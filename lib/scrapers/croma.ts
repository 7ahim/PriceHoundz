// lib/scrapers/croma.ts
//
// Croma (croma.com) — Tata's electronics retail chain.
// Runs on Next.js with Cloudflare WAF.
//
// Four strategies, tried in order:
//
//  1. __NEXT_DATA__ direct fetch — Croma embeds full product JSON in the
//                                  Next.js server-side props blob. No JS needed.
//
//  2. Croma product API          — Croma exposes a public product data API
//                                  used by the React app during hydration.
//
//  3. Mobile fetch               — Lighter page weight, weaker bot policy.
//
//  4. Puppeteer stealth          — Full browser, last resort.

import * as cheerio from "cheerio";
import {
  launchBrowser, randomDelay, randomUserAgent, type ScrapeResult,
} from "./base";

// ── Selectors ────────────────────────────────────────────────
const PRICE_SELECTORS = [
  // 2024 Croma PDP layout
  "span.pdpPriceSection__new-price",
  "[class*='pdp-price']",
  "[class*='new-price']",
  "[class*='offer-price']",
  "[class*='selling-price']",
  "[data-testid='pdp-price']",
  "[itemprop='price']",
  // Fallbacks
  ".pd-price span",
  ".price-display",
];

const NAME_SELECTORS = [
  "h1.pdp-title",
  "h1[class*='pdp']",
  "h1[class*='product-name']",
  "h1[class*='title']",
  "h1",
];

// ── Helpers ───────────────────────────────────────────────────
function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s\u20B9Rs.]/g, "").split(".")[0].trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

function normaliseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = "www.croma.com";
    ["utm_source","utm_medium","utm_campaign","ref","source","cid"].forEach(
      (p) => parsed.searchParams.delete(p)
    );
    return parsed.toString();
  } catch {
    return url;
  }
}

// Croma SKU is the last numeric segment in the URL path
// e.g. /mobiles/smartphones/apple-iphone-15-pro-...-p/269164
function extractSku(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const m    = path.match(/\/p\/(\d+)/i);
    if (m?.[1]) return m[1];
    const last = path.match(/(\d{5,})/);
    if (last?.[1]) return last[1];
  } catch {}
  return null;
}

// ── JSON string extraction ────────────────────────────────────
function extractFromJsonString(text: string): ScrapeResult | null {
  try {
    let price: number | null = null;
    const patterns = [
      /"offerPrice"\s*:\s*(\d+)/,
      /"discountedPrice"\s*:\s*(\d+)/,
      /"sellingPrice"\s*:\s*(\d+)/,
      /"finalPrice"\s*:\s*(\d+)/,
      /"price"\s*:\s*(\d+)/,
      /"newPrice"\s*:\s*(\d+)/,
      /"salePrice"\s*:\s*(\d+)/,
      /"priceDisplay"\s*:\s*"₹([0-9,]+)"/,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.[1]) {
        // Handle ₹XX,XXX pattern captured by last regex
        const raw = m[1].replace(/,/g,"");
        const n   = parseInt(raw, 10);
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

    const imgMatch = text.match(/"(?:imageUrl|image|thumbnailUrl)"\s*:\s*"(https?:[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
    const imageUrl = imgMatch?.[1] ?? null;

    return { price, name, imageUrl, available: true };
  } catch {
    return null;
  }
}

// ── HTML parser ───────────────────────────────────────────────
function parseCromaHtml(html: string): ScrapeResult | null {
  const $ = cheerio.load(html);

  // Block check
  const title = $("title").text().toLowerCase();
  if (title.includes("access denied") || title.includes("403") || title.includes("blocked")) {
    return null;
  }

  // 1. __NEXT_DATA__
  const nextDataRaw = $("#__NEXT_DATA__").html();
  if (nextDataRaw) {
    try {
      const result = extractFromJsonString(nextDataRaw);
      if (result?.price) return result;
    } catch {}
  }

  // 2. JSON-LD
  let price: number | null = null;
  let name:  string | null = null;
  let imageUrl: string | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (price) return;
    try {
      const data  = JSON.parse($(el).html() ?? "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const offer = item?.offers ?? item?.offer;
        const p     = offer?.price ?? offer?.lowPrice;
        if (p) { const n = parsePrice(String(p)); if (n) { price = n; } }
        if (item?.name)  name     = String(item.name).slice(0, 200);
        if (item?.image) imageUrl = Array.isArray(item.image) ? item.image[0] : item.image;
        if (price) break;
      }
    } catch {}
  });

  // 3. Meta tags
  if (!price) {
    const mp = $('meta[itemprop="price"]').attr("content") ||
               $('meta[property="product:price:amount"]').attr("content");
    if (mp) price = parsePrice(mp);
  }
  if (!imageUrl) imageUrl = $('meta[property="og:image"]').attr("content") ?? null;

  // 4. Inline scripts
  if (!price) {
    $("script").each((_, el) => {
      if (price) return false;
      const text = $(el).html() ?? "";
      if (text.includes("offerPrice") || text.includes("sellingPrice") || text.includes("newPrice")) {
        const r = extractFromJsonString(text);
        if (r?.price) { price = r.price; if (!name) name = r.name; if (!imageUrl) imageUrl = r.imageUrl; }
      }
    });
  }

  // 5. DOM selectors
  if (!price) {
    for (const sel of PRICE_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw) { price = parsePrice(raw); if (price) break; }
    }
  }

  if (!price) return null;

  if (!name) {
    for (const sel of NAME_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw.length > 3) { name = raw.slice(0, 200); break; }
    }
    if (!name) name = $('meta[property="og:title"]').attr("content")?.slice(0, 200) ?? null;
  }

  const bodyText = $("body").text().toLowerCase();
  const available = !bodyText.includes("out of stock") && !bodyText.includes("sold out");

  return { price, name, imageUrl, available };
}

// ── Strategy 1: __NEXT_DATA__ direct fetch ────────────────────
async function tryNextDataFetch(url: string): Promise<ScrapeResult | null> {
  const headerSets: Record<string, string>[] = [
    {
      "User-Agent":       randomUserAgent(),
      "Accept":           "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language":  "en-IN,en;q=0.9",
      "Accept-Encoding":  "gzip, deflate, br",
      "Sec-Fetch-Dest":   "document",
      "Sec-Fetch-Mode":   "navigate",
      "Sec-Fetch-Site":   "none",
      "Sec-Fetch-User":   "?1",
      "Cache-Control":    "max-age=0",
      "Referer":          "https://www.google.com/",
    },
    {
      // Android Chrome — different Cloudflare scoring
      "User-Agent":       "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
      "Accept":           "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":  "en-IN,en;q=0.9",
      "Referer":          "https://www.google.co.in/",
      "Sec-Fetch-Dest":   "document",
      "Sec-Fetch-Mode":   "navigate",
    },
  ];

  for (const headers of headerSets) {
    try {
      const res = await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const html   = await res.text();
      const result = parseCromaHtml(html);
      if (result?.price) return result;
    } catch {}
    await new Promise((r) => setTimeout(r, 700));
  }
  return null;
}

// ── Strategy 2: Croma product API ────────────────────────────
// Croma exposes a Next.js API route that the PDP calls to hydrate
async function tryCromaApi(sku: string): Promise<ScrapeResult | null> {
  const endpoints = [
    `https://www.croma.com/api/product/${sku}`,
    `https://www.croma.com/api/products/details?sku=${sku}`,
    `https://www.croma.com/cromaservices/rest/v2/productdetails?productId=${sku}&lang=en&curr=INR`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          "User-Agent":       randomUserAgent(),
          "Accept":           "application/json, text/plain, */*",
          "Accept-Language":  "en-IN,en;q=0.9",
          "Referer":          `https://www.croma.com/`,
          "X-Requested-With": "XMLHttpRequest",
        } satisfies Record<string, string>,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("json")) continue;
      const json = await res.json();
      const result = extractFromJsonString(JSON.stringify(json));
      if (result?.price) return result;
    } catch {}
  }
  return null;
}

// ── Strategy 3: Googlebot fetch ──────────────────────────────
// Croma serves a simpler, less-protected page to crawlers
async function tryCrawlerFetch(url: string): Promise<ScrapeResult | null> {
  const agents = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  ];
  for (const ua of agents) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":      ua,
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-IN,en;q=0.9",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const html   = await res.text();
      const result = parseCromaHtml(html);
      if (result?.price) return result;
    } catch {}
  }
  return null;
}

// ── Strategy 4: Puppeteer ────────────────────────────────────
async function tryPuppeteer(url: string): Promise<ScrapeResult | null> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(randomUserAgent());
    await page.setViewport({ width: 1366, height: 768 });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver",           { get: () => undefined });
      Object.defineProperty(navigator, "languages",           { get: () => ["en-IN","en-US","en"] });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
      (window as any).chrome = { runtime: {}, app: { isInstalled: false } };
    });

    await page.setExtraHTTPHeaders({ "Accept-Language": "en-IN,en;q=0.9", "Referer": "https://www.google.com/" });

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const t = req.resourceType();
      if (t === "media" || t === "font") { req.abort(); return; }
      req.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector(PRICE_SELECTORS.join(", "), { timeout: 12_000 }).catch(() => {});
    await randomDelay(1500, 3000);

    const html = await page.content();
    await browser.close();
    return parseCromaHtml(html);
  } catch {
    await browser.close().catch(() => {});
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────
export async function scrapeCroma(url: string): Promise<ScrapeResult> {
  const cleanUrl = normaliseUrl(url);
  const sku      = extractSku(cleanUrl);
  console.log(`[croma] Scraping ${cleanUrl} (SKU: ${sku ?? "unknown"})`);

  console.log("[croma] Trying __NEXT_DATA__ fetch...");
  const r1 = await tryNextDataFetch(cleanUrl);
  if (r1?.price) { console.log(`[croma] __NEXT_DATA__ succeeded: ₹${r1.price}`); return r1; }

  if (sku) {
    console.log("[croma] Trying product API...");
    const r2 = await tryCromaApi(sku);
    if (r2?.price) { console.log(`[croma] API succeeded: ₹${r2.price}`); return r2; }
  }

  console.log("[croma] Trying crawler fetch...");
  const r3 = await tryCrawlerFetch(cleanUrl);
  if (r3?.price) { console.log(`[croma] Crawler fetch succeeded: ₹${r3.price}`); return r3; }

  console.log("[croma] Trying Puppeteer...");
  await randomDelay(1500, 3000);
  const r4 = await tryPuppeteer(cleanUrl);
  if (r4?.price) { console.log(`[croma] Puppeteer succeeded: ₹${r4.price}`); return r4; }

  console.error(`[croma] All strategies failed for ${cleanUrl}`);
  return { price: null, name: null, imageUrl: null, available: false, error: "All scraping strategies failed for Croma." };
}