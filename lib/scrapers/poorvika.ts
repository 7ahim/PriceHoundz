// lib/scrapers/poorvika.ts
//
// Poorvika Mobiles (poorvika.com) — South Indian electronics retail chain.
// Runs on a simpler server-rendered stack (Magento / custom PHP).
// Less aggressive bot detection than Cloudflare-heavy sites.
//
// Four strategies:
//
//  1. Direct fetch + Cheerio DOM  — Poorvika server-renders prices in HTML.
//                                   Fastest path, works most of the time.
//
//  2. JSON-LD + meta tags         — Structured data in the page head.
//
//  3. Crawler fetch               — Googlebot headers for extra leniency.
//
//  4. Puppeteer stealth           — Full browser fallback.

import * as cheerio from "cheerio";
import {
  launchBrowser, randomDelay, randomUserAgent, type ScrapeResult,
} from "./base";

// ── Selectors — Poorvika Magento/custom layout ────────────────
const PRICE_SELECTORS = [
  // Primary price (current offer price)
  "span.special-price .price",
  "span.special-price",
  "[data-price-type='finalPrice'] .price",
  "[data-price-type='finalPrice']",
  // Regular price fallback
  "span.regular-price .price",
  ".price-box .price",
  // Custom selectors seen on poorvika.com
  ".product-info-price .price",
  "#product-price-main",
  "span.price",
  "[class*='price__offer']",
  "[class*='offer-price']",
  "[class*='sale-price']",
];

const NAME_SELECTORS = [
  "h1.page-title span",
  "h1.page-title",
  "h1[itemprop='name']",
  ".product-info-main h1",
  "h1",
];

const IMAGE_SELECTORS = [
  "img.gallery-placeholder__image",
  ".product.media img",
  "img[role='presentation']",
  ".product-image-photo",
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
    // Ensure we're on the right domain (they also use poorvika.com/in/)
    if (!parsed.hostname.includes("poorvika.com")) {
      parsed.hostname = "www.poorvika.com";
    }
    ["utm_source","utm_medium","utm_campaign","ref","source"].forEach(
      (p) => parsed.searchParams.delete(p)
    );
    return parsed.toString();
  } catch {
    return url;
  }
}

// ── Poorvika HTML parser ──────────────────────────────────────
function parsePoorvikaHtml(html: string): ScrapeResult | null {
  const $ = cheerio.load(html);

  // Block check
  const title = $("title").text().toLowerCase();
  if (
    title.includes("access denied") ||
    title.includes("403") ||
    title.includes("blocked") ||
    title.includes("captcha")
  ) return null;

  let price: number | null    = null;
  let name:  string | null    = null;
  let imageUrl: string | null = null;

  // ── JSON-LD (Magento injects rich structured data) ────────
  $('script[type="application/ld+json"]').each((_, el) => {
    if (price) return;
    try {
      const data  = JSON.parse($(el).html() ?? "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        // Product schema
        const offer = item?.offers ?? item?.offer;
        const p     = offer?.price ?? offer?.lowPrice;
        if (p) { const n = parsePrice(String(p)); if (n) { price = n; } }
        if (item?.name) name     = String(item.name).slice(0, 200);
        if (item?.image) {
          const img = Array.isArray(item.image) ? item.image[0] : item.image;
          imageUrl = typeof img === "string" ? img : img?.url ?? null;
        }
        if (price) break;
      }
    } catch {}
  });

  // ── Meta tags ─────────────────────────────────────────────
  if (!price) {
    const mp =
      $('meta[itemprop="price"]').attr("content") ||
      $('meta[property="product:price:amount"]').attr("content") ||
      $('meta[name="twitter:data1"]').attr("content");
    if (mp) price = parsePrice(mp);
  }
  if (!imageUrl) {
    imageUrl = $('meta[property="og:image"]').attr("content") ?? null;
  }

  // ── Magento price data attribute ─────────────────────────
  // Magento stores price in data-price-amount
  if (!price) {
    const priceAttr =
      $("[data-price-amount]").first().attr("data-price-amount") ||
      $("[data-price-type='finalPrice']").first().attr("data-price-amount");
    if (priceAttr) price = parsePrice(priceAttr);
  }

  // ── DOM selectors ─────────────────────────────────────────
  if (!price) {
    for (const sel of PRICE_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw) { price = parsePrice(raw); if (price) break; }
    }
  }

  if (!price) return null;

  // ── Name ─────────────────────────────────────────────────
  if (!name) {
    for (const sel of NAME_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw.length > 3) { name = raw.slice(0, 200); break; }
    }
    if (!name) {
      name = $('meta[property="og:title"]').attr("content")?.slice(0, 200) ?? null;
    }
  }

  // ── Image ─────────────────────────────────────────────────
  if (!imageUrl) {
    for (const sel of IMAGE_SELECTORS) {
      const src = $(sel).first().attr("src");
      if (src?.startsWith("http")) { imageUrl = src; break; }
    }
  }

  // ── Availability ─────────────────────────────────────────
  const bodyText = $("body").text().toLowerCase();
  const outOfStock =
    $(".stock.unavailable").length > 0 ||
    bodyText.includes("out of stock") ||
    bodyText.includes("sold out") ||
    bodyText.includes("currently unavailable") ||
    $("[data-action='add-to-cart']").attr("disabled") !== undefined;

  return { price, name, imageUrl, available: !outOfStock };
}

// ── Inline JSON extraction ────────────────────────────────────
// Poorvika sometimes embeds price in a JS config object
function extractFromScripts(html: string): ScrapeResult | null {
  const $ = cheerio.load(html);
  let price: number | null = null;
  let name:  string | null = null;

  $("script").each((_, el) => {
    if (price) return false;
    const text = $(el).html() ?? "";

    // Look for Magento priceConfig or window.dataLayer
    const patterns = [
      /"finalPrice"\s*:\s*\{\s*"amount"\s*:\s*([\d.]+)/,
      /"regularPrice"\s*:\s*\{\s*"amount"\s*:\s*([\d.]+)/,
      /"price"\s*:\s*([\d.]+)/,
      /price_incl_tax['"]\s*:\s*([\d.]+)/,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.[1]) {
        const n = parseFloat(m[1]);
        if (n > 100 && n < 10_000_000) { price = Math.round(n); break; }
      }
    }

    if (!name) {
      const nm = text.match(/"name"\s*:\s*"([^"]{5,200})"/);
      if (nm?.[1]) name = nm[1].slice(0, 200);
    }
  });

  return price ? { price, name, imageUrl: null, available: true } : null;
}

// ── Strategy 1: Direct fetch (server-rendered) ────────────────
async function tryDirectFetch(url: string): Promise<ScrapeResult | null> {
  const headerSets: Record<string, string>[] = [
    {
      "User-Agent":      randomUserAgent(),
      "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-IN,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control":   "no-cache",
      "Referer":         "https://www.google.com/",
    },
    {
      // iPhone Safari — often gets lighter pages
      "User-Agent":      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-IN,en;q=0.9",
      "Referer":         "https://www.google.co.in/",
    },
  ];

  for (const headers of headerSets) {
    try {
      const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const html = await res.text();

      // Try DOM parse first
      const domResult = parsePoorvikaHtml(html);
      if (domResult?.price) return domResult;

      // Try script extraction
      const scriptResult = extractFromScripts(html);
      if (scriptResult?.price) return scriptResult;
    } catch {}
    await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

// ── Strategy 2: Poorvika catalog API ─────────────────────────
// Poorvika has a REST API endpoint used by their search/listing
async function tryPoorvikaApi(url: string): Promise<ScrapeResult | null> {
  try {
    // Extract slug from URL path
    const path  = new URL(url).pathname.replace(/^\//, "").replace(/\/$/, "");
    const slug  = path.split("/").pop() ?? "";
    const endpoints = [
      `https://www.poorvika.com/rest/V1/products?searchCriteria[filterGroups][0][filters][0][field]=url_key&searchCriteria[filterGroups][0][filters][0][value]=${slug}`,
    ];

    for (const endpoint of endpoints) {
      const res = await fetch(endpoint, {
        headers: {
          "User-Agent":      randomUserAgent(),
          "Accept":          "application/json",
          "Accept-Language": "en-IN,en;q=0.9",
          "Referer":         "https://www.poorvika.com/",
        } satisfies Record<string, string>,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("json")) continue;

      const json = await res.json();
      const raw  = JSON.stringify(json);

      // Extract from Magento REST response
      const pricePatterns = [
        /"price"\s*:\s*([\d.]+)/,
        /"special_price"\s*:\s*([\d.]+)/,
        /"price_incl_tax"\s*:\s*([\d.]+)/,
      ];
      for (const re of pricePatterns) {
        const m = raw.match(re);
        if (m?.[1]) {
          const n = parseFloat(m[1]);
          if (n > 100 && n < 10_000_000) {
            const nm = raw.match(/"name"\s*:\s*"([^"]{5,200})"/);
            return { price: Math.round(n), name: nm?.[1]?.slice(0, 200) ?? null, imageUrl: null, available: true };
          }
        }
      }
    }
  } catch {}
  return null;
}

// ── Strategy 3: Crawler fetch ─────────────────────────────────
async function tryCrawlerFetch(url: string): Promise<ScrapeResult | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parsePoorvikaHtml(html) ?? extractFromScripts(html);
  } catch {
    return null;
  }
}

// ── Strategy 4: Puppeteer ────────────────────────────────────
async function tryPuppeteer(url: string): Promise<ScrapeResult | null> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(randomUserAgent());
    await page.setViewport({ width: 1366, height: 768 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "languages", { get: () => ["en-IN","en"] });
    });
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["media","font"].includes(req.resourceType())) { req.abort(); return; }
      req.continue();
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector(PRICE_SELECTORS.join(", "), { timeout: 10_000 }).catch(() => {});
    await randomDelay(1200, 2500);
    const html = await page.content();
    await browser.close();
    return parsePoorvikaHtml(html) ?? extractFromScripts(html);
  } catch {
    await browser.close().catch(() => {});
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────
export async function scrapePoorvika(url: string): Promise<ScrapeResult> {
  const cleanUrl = normaliseUrl(url);
  console.log(`[poorvika] Scraping ${cleanUrl}`);

  console.log("[poorvika] Trying direct fetch...");
  const r1 = await tryDirectFetch(cleanUrl);
  if (r1?.price) { console.log(`[poorvika] Direct fetch succeeded: ₹${r1.price}`); return r1; }

  console.log("[poorvika] Trying Poorvika API...");
  const r2 = await tryPoorvikaApi(cleanUrl);
  if (r2?.price) { console.log(`[poorvika] API succeeded: ₹${r2.price}`); return r2; }

  console.log("[poorvika] Trying crawler fetch...");
  const r3 = await tryCrawlerFetch(cleanUrl);
  if (r3?.price) { console.log(`[poorvika] Crawler fetch succeeded: ₹${r3.price}`); return r3; }

  console.log("[poorvika] Trying Puppeteer...");
  await randomDelay(1000, 2500);
  const r4 = await tryPuppeteer(cleanUrl);
  if (r4?.price) { console.log(`[poorvika] Puppeteer succeeded: ₹${r4.price}`); return r4; }

  console.error(`[poorvika] All strategies failed for ${cleanUrl}`);
  return { price: null, name: null, imageUrl: null, available: false, error: "All scraping strategies failed for Poorvika." };
}