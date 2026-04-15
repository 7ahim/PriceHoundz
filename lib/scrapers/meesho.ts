// lib/scrapers/meesho.ts
//
// Meesho (meesho.com) — Social commerce platform.
// React SPA with Akamai-lite protection.
// Products have prices that vary by supplier, so we take the lowest listed.
//
// Four strategies:
//
//  1. Meesho GraphQL API     — Meesho's React app uses GraphQL to hydrate
//                              product data. We hit the same endpoint directly.
//                              This is the most reliable path.
//
//  2. __PRELOADED_STATE__    — Some Meesho pages embed a preloaded Redux state
//                              blob in the HTML with price data.
//
//  3. Mobile fetch           — Meesho's mobile web has lighter protection.
//
//  4. Puppeteer stealth      — Full browser, last resort with Akamai evasion.

import * as cheerio from "cheerio";
import {
  launchBrowser, randomDelay, randomUserAgent, type ScrapeResult,
} from "./base";

// ── Selectors ────────────────────────────────────────────────
const PRICE_SELECTORS = [
  // 2024 Meesho PDP
  "[class*='PriceValue']",
  "[class*='price-value']",
  "[class*='selling-price']",
  "[class*='ProductPrice']",
  "[data-testid*='price']",
  "h4[class*='Price']",
  "span[class*='Price']",
  // Generic
  "[itemprop='price']",
];

const NAME_SELECTORS = [
  "h1[class*='ProductTitle']",
  "h1[class*='product-title']",
  "h1[class*='Title']",
  "[data-testid*='product-title']",
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
    if (!parsed.hostname.includes("meesho.com")) {
      parsed.hostname = "meesho.com";
    }
    ["utm_source","utm_medium","utm_campaign","ref","source","origin"].forEach(
      (p) => parsed.searchParams.delete(p)
    );
    return parsed.toString();
  } catch {
    return url;
  }
}

// Extract product ID from Meesho URL
// e.g. /product-name/p/1234567890 or /product-name/1234567890
function extractProductId(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    // /p/{id} pattern
    const m1 = path.match(/\/p\/(\d+)/);
    if (m1?.[1]) return m1[1];
    // Last segment if numeric
    const parts = path.split("/").filter(Boolean);
    const last  = parts[parts.length - 1];
    if (/^\d{8,}$/.test(last)) return last;
    // Second-to-last if "p"
    const prev = parts[parts.length - 2];
    if (prev === "p" && last) return last;
  } catch {}
  return null;
}

// ── JSON extraction ────────────────────────────────────────────
function extractFromJsonString(text: string): ScrapeResult | null {
  try {
    let price: number | null = null;
    const patterns = [
      // Meesho-specific keys
      /"mrp"\s*:\s*(\d+)/,
      /"price"\s*:\s*(\d+)/,
      /"sellingPrice"\s*:\s*(\d+)/,
      /"finalPrice"\s*:\s*(\d+)/,
      /"discountedPrice"\s*:\s*(\d+)/,
      /"priceValue"\s*:\s*(\d+)/,
      /"catalogPrice"\s*:\s*(\d+)/,
      // Sometimes price is in an array as lowest value
      /"minPrice"\s*:\s*(\d+)/,
      /"offerPrice"\s*:\s*(\d+)/,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.[1]) {
        const n = parseInt(m[1], 10);
        if (n > 10 && n < 10_000_000) { price = n; break; }
      }
    }
    if (!price) return null;

    const namePatterns = [
      /"productName"\s*:\s*"([^"]{5,200})"/,
      /"catalogName"\s*:\s*"([^"]{5,200})"/,
      /"name"\s*:\s*"([^"]{5,200})"/,
      /"title"\s*:\s*"([^"]{5,200})"/,
    ];
    let name: string | null = null;
    for (const re of namePatterns) {
      const m = text.match(re);
      if (m?.[1]) { name = m[1].slice(0, 200); break; }
    }

    const imgMatch = text.match(/"(?:image|imageUrl|thumbnailUrl|catalogThumbnailUrl)"\s*:\s*"(https?:[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
    const imageUrl = imgMatch?.[1] ?? null;

    return { price, name, imageUrl, available: true };
  } catch {
    return null;
  }
}

// ── Parse Meesho HTML ─────────────────────────────────────────
function parseMeeshoHtml(html: string): ScrapeResult | null {
  const $ = cheerio.load(html);

  const title = $("title").text().toLowerCase();
  if (title.includes("access denied") || title.includes("403") || title.includes("blocked")) {
    return null;
  }

  // ── __PRELOADED_STATE__ ───────────────────────────────────
  // Use a wrapper object to prevent TypeScript from narrowing `found.result`
  // to `never` inside the Cheerio `.each()` callback closure.
  const found: { result: ScrapeResult | null } = { result: null };
  $("script").each((_, el) => {
    if (found.result?.price) return false;
    const text = $(el).html() ?? "";
    if (
      text.includes("__PRELOADED_STATE__") ||
      text.includes("__INITIAL_STATE__") ||
      text.includes("window.dataLayer")
    ) {
      const r = extractFromJsonString(text);
      if (r?.price) found.result = r;
    }
    // Also check for price data without those markers
    if (!found.result && (text.includes('"mrp"') || text.includes('"sellingPrice"') || text.includes('"catalogPrice"'))) {
      const r = extractFromJsonString(text);
      if (r?.price) found.result = r;
    }
  });
  if (found.result?.price) return found.result;

  // ── JSON-LD ───────────────────────────────────────────────
  let price: number | null    = null;
  let name:  string | null    = null;
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
        if (item?.name) name     = String(item.name).slice(0, 200);
        if (item?.image) {
          const img = Array.isArray(item.image) ? item.image[0] : item.image;
          imageUrl = typeof img === "string" ? img : img?.url ?? null;
        }
        if (price) break;
      }
    } catch {}
  });

  // ── Meta ──────────────────────────────────────────────────
  if (!price) {
    const mp = $('meta[itemprop="price"]').attr("content") ||
               $('meta[property="product:price:amount"]').attr("content");
    if (mp) price = parsePrice(mp);
  }
  if (!imageUrl) imageUrl = $('meta[property="og:image"]').attr("content") ?? null;

  // ── DOM ───────────────────────────────────────────────────
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

// ── Strategy 1: Meesho API ────────────────────────────────────
// Meesho's React app calls internal REST/GraphQL endpoints to hydrate
// product data. These endpoints require:
//   - A valid __cfduid / _guest_token cookie (obtained by a prior GET)
//   - x-csrf-token matching that session
//   - catalogId (numeric) not productId (string) for the PDP endpoint
//
// We do a lightweight pre-fetch of the product page to harvest cookies
// and the CSRF token, then fire the API call with those credentials.
async function tryMeeshoApi(productId: string, pageUrl: string): Promise<ScrapeResult | null> {
  const ua = randomUserAgent();

  // ── Step 1: Harvest session cookies + CSRF token ─────────
  let cookies   = "";
  let csrfToken = "";
  try {
    const seedRes = await fetch(pageUrl, {
      headers: {
        "User-Agent":      ua,
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Referer":         "https://www.google.co.in/",
      } satisfies Record<string, string>,
      redirect: "follow",
      signal:   AbortSignal.timeout(15_000),
    });
    // Collect Set-Cookie headers
    const raw = seedRes.headers.get("set-cookie") ?? "";
    cookies = raw.split(",")
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    // CSRF token is often embedded as a meta tag or in __PRELOADED_STATE__
    const html      = await seedRes.text();
    const csrfMatch = html.match(/["']?csrf[-_]?token["']?\s*[=:]\s*["']([^"']{10,})["']/i)
                   ?? html.match(/name=["']csrf[-_]?token["']\s+content=["']([^"']+)["']/i);
    if (csrfMatch?.[1]) csrfToken = csrfMatch[1];
  } catch {
    // Non-fatal — proceed without cookies; API may still respond
  }

  const commonHeaders: Record<string, string> = {
    "User-Agent":       ua,
    "Accept":           "application/json",
    "Accept-Language":  "en-IN,en;q=0.9",
    "Origin":           "https://meesho.com",
    "Referer":          pageUrl,
    ...(cookies   ? { "Cookie":       cookies   } : {}),
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
  };

  // ── Step 2: Try catalog/pdp with correct body shape ──────
  // Meesho expects { catalogId: <number> }, not { productId: <string> }
  const catalogId = parseInt(productId, 10);
  if (!isNaN(catalogId)) {
    try {
      const res = await fetch("https://meesho.com/api/v2/catalog/pdp", {
        method:  "POST",
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json",
          // Headers observed in browser DevTools for Meesho PDP XHR
          "x-consumer":    "meesho-web",
          "x-location-id": "0",
          "x-user-id":     "0",
        },
        body:   JSON.stringify({ catalogId }),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status === 422) {
        console.warn("[meesho] /api/v2/catalog/pdp returned 422 — payload rejected, skipping.");
      } else if (res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("json")) {
          const r = extractFromJsonString(JSON.stringify(await res.json()));
          if (r?.price) return r;
        }
      }
    } catch {}
  }

  // ── Step 3: REST product detail fallback ─────────────────
  try {
    const res = await fetch(`https://meesho.com/api/v1/products/${productId}`, {
      headers: {
        ...commonHeaders,
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 422) {
      console.warn("[meesho] /api/v1/products returned 422 — payload rejected, skipping.");
    } else if (res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("json")) {
        const r = extractFromJsonString(JSON.stringify(await res.json()));
        if (r?.price) return r;
      }
    }
  } catch {}

  return null;
}

// ── Strategy 2: Direct fetch + __PRELOADED_STATE__ ────────────
// Sends a realistic browser fingerprint. Meesho's Akamai WAF scores
// requests on Sec-CH-UA, Sec-Fetch-* and Accept-Encoding — missing
// any of these often triggers a 422 or 403 before the page is served.
async function tryDirectFetch(url: string): Promise<ScrapeResult | null> {
  const profiles: Record<string, string>[] = [
    {
      "User-Agent":       randomUserAgent(),
      "Accept":           "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language":  "en-IN,en;q=0.9",
      "Accept-Encoding":  "gzip, deflate, br",
      "Cache-Control":    "no-cache",
      "Sec-Fetch-Dest":   "document",
      "Sec-Fetch-Mode":   "navigate",
      "Sec-Fetch-Site":   "none",
      "Sec-Fetch-User":   "?1",
      "Sec-CH-UA":        '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
      "Upgrade-Insecure-Requests": "1",
      "Referer":          "https://www.google.com/",
    },
    {
      // Android Chrome — different Akamai scoring path
      "User-Agent":         "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
      "Accept":             "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":    "en-IN,en;q=0.9",
      "Accept-Encoding":    "gzip, deflate, br",
      "Sec-Fetch-Dest":     "document",
      "Sec-Fetch-Mode":     "navigate",
      "Sec-Fetch-Site":     "none",
      "Sec-CH-UA":          '"Android WebView";v="116", "Chromium";v="116"',
      "Sec-CH-UA-Mobile":   "?1",
      "Sec-CH-UA-Platform": '"Android"',
      "Referer":            "https://www.google.co.in/",
    },
  ];

  for (const headers of profiles) {
    try {
      const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const html   = await res.text();
      const result = parseMeeshoHtml(html);
      if (result?.price) return result;
    } catch {}
    await new Promise((r) => setTimeout(r, 700));
  }
  return null;
}

// ── Strategy 3: Mobile web ────────────────────────────────────
async function tryMobileFetch(url: string): Promise<ScrapeResult | null> {
  // Meesho has a separate mobile endpoint
  const mobileUrl = url.replace("meesho.com", "meesho.com");
  const mobileUAs = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/18.0 Chrome/107.0.5304.141 Mobile Safari/537.36",
  ];
  for (const ua of mobileUAs) {
    try {
      const res = await fetch(mobileUrl, {
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
      const result = parseMeeshoHtml(html);
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
    const ua   = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    await page.setUserAgent(ua);
    await page.setViewport({ width: 1366, height: 768 });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver",          { get: () => undefined });
      Object.defineProperty(navigator, "languages",          { get: () => ["en-IN","en-US","en"] });
      Object.defineProperty(navigator, "hardwareConcurrency",{ get: () => 8 });
      Object.defineProperty(navigator, "deviceMemory",       { get: () => 8 });
      (window as any).chrome = { runtime: {}, loadTimes: () => ({}), app: { isInstalled: false } };
    });

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-IN,en;q=0.9",
      "Referer":         "https://www.google.com/",
    });

    // Meesho SPA loads via React — allow scripts, block heavy media
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const t = req.resourceType();
      if (t === "media" || t === "font") { req.abort(); return; }
      req.continue();
    });

    // Use domcontentloaded — let React hydrate
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Wait for price element or React to hydrate price
    await Promise.race([
      page.waitForSelector(PRICE_SELECTORS.join(", "), { timeout: 12_000 }),
      new Promise((r) => setTimeout(r, 8000)),
    ]).catch(() => {});

    // Extra delay for React to finish rendering
    await randomDelay(2000, 3500);

    const html = await page.content();
    await browser.close();
    return parseMeeshoHtml(html);
  } catch {
    await browser.close().catch(() => {});
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────
export async function scrapeMeesho(url: string): Promise<ScrapeResult> {
  const cleanUrl   = normaliseUrl(url);
  const productId  = extractProductId(cleanUrl);
  console.log(`[meesho] Scraping ${cleanUrl} (ID: ${productId ?? "unknown"})`);

  // Strategy 1: API with session cookie pre-fetch (fastest, no full page load)
  if (productId) {
    console.log("[meesho] Trying Meesho API...");
    const r1 = await tryMeeshoApi(productId, cleanUrl);
    if (r1?.price) { console.log(`[meesho] API succeeded: ₹${r1.price}`); return r1; }
  }

  // Strategy 2: Direct fetch + __PRELOADED_STATE__
  console.log("[meesho] Trying direct fetch...");
  const r2 = await tryDirectFetch(cleanUrl);
  if (r2?.price) { console.log(`[meesho] Direct fetch succeeded: ₹${r2.price}`); return r2; }

  // Strategy 3: Mobile web
  console.log("[meesho] Trying mobile fetch...");
  const r3 = await tryMobileFetch(cleanUrl);
  if (r3?.price) { console.log(`[meesho] Mobile fetch succeeded: ₹${r3.price}`); return r3; }

  // Strategy 4: Puppeteer
  console.log("[meesho] Trying Puppeteer...");
  await randomDelay(2000, 4000);
  const r4 = await tryPuppeteer(cleanUrl);
  if (r4?.price) { console.log(`[meesho] Puppeteer succeeded: ₹${r4.price}`); return r4; }

  console.error(`[meesho] All strategies failed for ${cleanUrl}`);
  return {
    price:     null,
    name:      null,
    imageUrl:  null,
    available: false,
    error:     "All scraping strategies failed for Meesho.",
  };
}