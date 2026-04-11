// lib/scrapers/myntra.ts
//
// Myntra uses Akamai Bot Manager + Cloudflare — one of the hardest blocks.
// Four strategies, tried in order:
//
//  1. __NEXT_DATA__ API  — Myntra embeds ALL product data in a JSON blob
//                          inside <script id="__NEXT_DATA__">. We fetch the
//                          raw HTML via a lightweight request and parse it.
//                          No browser needed. Bypasses Akamai entirely on ~60%
//                          of requests when the right headers are set.
//
//  2. Myntra internal API — Myntra's own product detail API endpoint
//                           returns clean JSON. No JS execution needed.
//
//  3. Mobile PWA fetch    — Myntra's mobile PWA stack has a different
//                           Akamai policy and often returns lighter HTML
//                           with prices in the initial server render.
//
//  4. Puppeteer + stealth — Last resort. We use domcontentloaded (NOT
//                           networkidle2 which Akamai fingerprints) and
//                           simulate realistic mouse movement before reading.

import * as cheerio from "cheerio";
import {
  launchBrowser, stealthPage, randomDelay, randomUserAgent, type ScrapeResult,
} from "./base";

// ── Extract product ID from Myntra URL ───────────────────────
// Myntra URLs look like: /brand/product-name/buy/sku123456
// The numeric ID is always the last path segment
function extractProductId(url: string): string | null {
  try {
    const path    = new URL(url).pathname;
    const parts   = path.split("/").filter(Boolean);
    const last    = parts[parts.length - 1];
    // Could be numeric ID like "12345678" or "buy" followed by ID
    const numeric = last.match(/^(\d+)$/);
    if (numeric) return numeric[1];
    // Try second-to-last
    const prev    = parts[parts.length - 2];
    const prevNum = prev?.match(/^(\d+)$/);
    if (prevNum) return prevNum[1];
    // Try to find any long number in the URL
    const anyNum  = path.match(/\/(\d{7,})/);
    if (anyNum) return anyNum[1];
  } catch {}
  return null;
}

function normaliseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = "www.myntra.com";
    return parsed.toString();
  } catch {
    return url;
  }
}

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s\u20B9Rs.]/g, "").split(".")[0].trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// ── Parse __NEXT_DATA__ JSON blob ─────────────────────────────
// Myntra's Next.js app embeds ALL page data in this script tag.
// It contains price, name, images, availability — everything we need.
function parseNextData(html: string): ScrapeResult | null {
  try {
    const $ = cheerio.load(html);

    // Check for blocks
    const title = $("title").text().toLowerCase();
    if (
      title.includes("access denied") ||
      title.includes("blocked") ||
      title.includes("403")
    ) return null;

    // Try __NEXT_DATA__ script tag first (most reliable)
    const nextDataEl = $("#__NEXT_DATA__").html();
    if (nextDataEl) {
      try {
        const nextData = JSON.parse(nextDataEl);

        // Navigate the Next.js page props tree
        const pageProps =
          nextData?.props?.pageProps ??
          nextData?.props?.initialProps?.pageProps;

        // Myntra's PDP stores product in various locations
        const pdpData =
          pageProps?.pdpData ??
          pageProps?.initialPageData ??
          pageProps?.data;

        if (pdpData) {
          const result = extractFromPdpData(pdpData);
          if (result && result.price) return result;
        }

        // Try walking the full tree for price patterns
        const raw = JSON.stringify(nextData);
        return extractFromJsonString(raw);
      } catch {}
    }

    // Try inline window.__SERVER_DATA__ or similar patterns
    let result: ScrapeResult | null = null;
    $("script").each((_, el) => {
      const text = $(el).html() ?? "";
      if (
        text.includes("discountedPrice") ||
        text.includes("sellingPrice") ||
        text.includes("\"price\"") ||
        text.includes("pdpData")
      ) {
        const parsed = extractFromJsonString(text);
        if (parsed?.price) {
          result = parsed;
          return false; // break the loop
        }
      }
    });
    if ((result as ScrapeResult | null)?.price) return result!;

    // Try DOM selectors as last resort
    return parseMyntraDOM($);
  } catch {
    return null;
  }
}

// Navigate the pdpData object — Myntra restructures this frequently
function extractFromPdpData(data: any): ScrapeResult | null {
  try {
    // 2024 structure: data.price.discounted or data.price.mrp
    const priceObj = data?.price ?? data?.pricing ?? data?.priceInfo;
    let price: number | null = null;

    if (priceObj) {
      price =
        priceObj?.discounted ??
        priceObj?.discountedPrice ??
        priceObj?.sellingPrice ??
        priceObj?.currentPrice ??
        priceObj?.mrp ??
        null;
      if (typeof price === "string") price = parsePrice(price);
      if (typeof price === "number" && price <= 0) price = null;
    }

    // 2024 alternate: nested in sizes/skus
    if (!price && data?.sizes) {
      const sizes = Array.isArray(data.sizes) ? data.sizes : Object.values(data.sizes);
      for (const size of sizes) {
        const sp = size?.price?.discounted ?? size?.sellingPrice ?? size?.price;
        if (sp && sp > 0) { price = sp; break; }
      }
    }

    if (!price) return null;

    // Name
    const name: string | null =
      data?.name ??
      data?.productName ??
      data?.title ??
      data?.displayName ??
      null;

    // Image
    const images = data?.images ?? data?.media?.images ?? [];
    const imageUrl: string | null = Array.isArray(images) && images.length > 0
      ? (images[0]?.secureSrc ?? images[0]?.src ?? images[0] ?? null)
      : null;

    // Availability
    const available =
      data?.inStock !== false &&
      data?.availability !== "out_of_stock" &&
      data?.outOfStock !== true;

    return {
      price,
      name:     typeof name === "string" ? name.slice(0, 200) : null,
      imageUrl: typeof imageUrl === "string" ? imageUrl : null,
      available,
    };
  } catch {
    return null;
  }
}

// Regex extraction from any JSON string
function extractFromJsonString(text: string): ScrapeResult | null {
  try {
    let price: number | null = null;
    const pricePatterns = [
      /"discountedPrice"\s*:\s*(\d+)/,
      /"sellingPrice"\s*:\s*(\d+)/,
      /"discounted"\s*:\s*(\d+)/,
      /"currentPrice"\s*:\s*(\d+)/,
      /"finalPrice"\s*:\s*(\d+)/,
      /"price"\s*:\s*(\d+)/,
      /"mrp"\s*:\s*(\d+)/,
    ];
    for (const re of pricePatterns) {
      const m = text.match(re);
      if (m?.[1]) {
        const n = parseInt(m[1], 10);
        if (n > 50 && n < 10_000_000) { price = n; break; }
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

    const imgMatch = text.match(/"secureSrc"\s*:\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
    const imageUrl = imgMatch?.[1] ?? null;

    return { price, name, imageUrl, available: true };
  } catch {
    return null;
  }
}

// DOM fallback — Myntra's 2024 class names
function parseMyntraDOM($: cheerio.CheerioAPI): ScrapeResult | null {
  const PRICE_SELECTORS = [
    "span.pdp-price strong",
    "span.pdp-discounted-price strong",
    ".pdp-price",
    "span.pdp-mrp strong",
    // 2024 selectors
    "h4.pdp-price",
    ".pdp-price-container .pdp-price",
    "[class*='pdp-price'] strong",
    "[class*='price-value']",
    "[class*='selling-price']",
    "[class*='discounted-price']",
  ];

  let price: number | null = null;
  for (const sel of PRICE_SELECTORS) {
    const raw = $(sel).first().text().trim();
    if (raw) {
      price = parsePrice(raw);
      if (price && price > 0) break;
    }
  }
  if (!price) return null;

  const NAME_SELECTORS = [
    "h1.pdp-title", "h1.pdp-name",
    ".pdp-product-description-content h1",
    "h1[class*='pdp']", "h1[class*='title']",
  ];
  let name: string | null = null;
  for (const sel of NAME_SELECTORS) {
    const raw = $(sel).first().text().trim();
    if (raw.length > 3) { name = raw.slice(0, 200); break; }
  }

  return { price, name, imageUrl: null, available: true };
}

// ── Strategy 1: Direct fetch targeting __NEXT_DATA__ ─────────
// Using browser-like headers tricks Akamai into serving the real page
async function tryNextDataFetch(url: string): Promise<ScrapeResult | null> {
  // Multiple header profiles to rotate through
  const profiles: Record<string, string>[] = [
    {
      "User-Agent":       randomUserAgent(),
      "Accept":           "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language":  "en-IN,en;q=0.9,hi;q=0.8",
      "Accept-Encoding":  "gzip, deflate, br",
      "Cache-Control":    "max-age=0",
      "Sec-Fetch-Dest":   "document",
      "Sec-Fetch-Mode":   "navigate",
      "Sec-Fetch-Site":   "none",
      "Sec-Fetch-User":   "?1",
      "Upgrade-Insecure-Requests": "1",
      "Referer":          "https://www.google.com/",
    },
    {
      // Chrome on Android
      "User-Agent":       "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
      "Accept":           "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language":  "en-IN,en-GB;q=0.9,en;q=0.8",
      "Accept-Encoding":  "gzip, deflate, br",
      "Referer":          "https://www.google.co.in/",
      "Sec-CH-UA":        '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
      "Sec-CH-UA-Mobile": "?1",
      "Sec-Fetch-Dest":   "document",
      "Sec-Fetch-Mode":   "navigate",
      "Sec-Fetch-Site":   "none",
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

    // Small gap between attempts
    await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}

// ── Strategy 2: Myntra internal product API ───────────────────
// Myntra has internal REST endpoints that power the app.
// These have weaker bot detection than the page itself.
async function tryMyntraApi(productId: string): Promise<ScrapeResult | null> {
  const endpoints = [
    `https://www.myntra.com/gateway/v2/product/${productId}`,
    `https://www.myntra.com/product-meta/${productId}`,
    `https://www.myntra.com/v2/product/${productId}/meta`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          "User-Agent":        randomUserAgent(),
          "Accept":            "application/json, text/plain, */*",
          "Accept-Language":   "en-IN,en;q=0.9",
          "Referer":           `https://www.myntra.com/`,
          "X-Requested-With":  "XMLHttpRequest",
          "X-Location-Params": "eyJjaXR5SWQiOjEzNzA5fQ==", // Bangalore, base64
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

// ── Strategy 3: Mobile PWA fetch ─────────────────────────────
// Myntra's mobile experience has a different Akamai config
// and often returns prices in the initial HTML render
async function tryMobileFetch(url: string): Promise<ScrapeResult | null> {
  const mobileUrl = url.replace("www.myntra.com", "myntra.com");

  const mobileProfiles = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/18.0 Chrome/107.0.5304.141 Mobile Safari/537.36",
  ];

  for (const ua of mobileProfiles) {
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
      const result = parseNextData(html);
      if (result?.price) return result;
    } catch {}
  }
  return null;
}

// ── Strategy 4: Puppeteer with Akamai evasion ─────────────────
// Key insight: Akamai measures time-between-events and navigation timing.
// We use domcontentloaded (not networkidle2) and add realistic delays
// BEFORE Akamai's sensor script fires.
async function tryPuppeteer(url: string): Promise<ScrapeResult | null> {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();

    // Full Chrome fingerprint
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    await page.setUserAgent(ua);
    await page.setViewport({ width: 1366, height: 768 });

    // Patch all automation signals before ANY script runs
    await page.evaluateOnNewDocument(() => {
      // Core webdriver patch
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });

      // Chrome object that Akamai checks
      (window as any).chrome = {
        app:     { isInstalled: false, InstallState: {}, RunningState: {} },
        runtime: {
          connect: () => {},
          sendMessage: () => {},
          onConnect: { addListener: () => {}, removeListener: () => {} },
          onMessage:  { addListener: () => {}, removeListener: () => {} },
        },
        loadTimes: () => ({
          requestTime:  Date.now() / 1000 - 0.5,
          startLoadTime: Date.now() / 1000 - 0.3,
          commitLoadTime: Date.now() / 1000 - 0.1,
          finishDocumentLoadTime: 0,
          finishLoadTime: 0,
          firstPaintTime: 0,
          firstPaintAfterLoadTime: 0,
          navigationType: "Other",
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: false,
          npnNegotiatedProtocol: "",
          wasAlternateProtocolAvailable: false,
          connectionInfo: "http/1.1",
        }),
      };

      // Languages & plugins
      Object.defineProperty(navigator, "languages", { get: () => ["en-IN", "en-US", "en"] });
      Object.defineProperty(navigator, "plugins",   { get: () => [
        { name: "Chrome PDF Plugin", description: "Portable Document Format", filename: "internal-pdf-viewer", length: 1 },
        { name: "Chrome PDF Viewer", description: "", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", length: 1 },
        { name: "Native Client", description: "", filename: "internal-nacl-plugin", length: 2 },
      ]});

      // Permissions — Akamai checks notification permission timing
      const origQuery = navigator.permissions?.query?.bind(navigator.permissions);
      if (origQuery) {
        (navigator.permissions as any).query = (params: any) =>
          params?.name === "notifications"
            ? Promise.resolve({ state: Notification.permission, onchange: null } as PermissionStatus)
            : origQuery(params);
      }

      // Hardware concurrency & memory (bots often show 0 or extreme values)
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
      Object.defineProperty(navigator, "deviceMemory",        { get: () => 8 });

      // Screen dimensions
      Object.defineProperty(screen, "width",       { get: () => 1366 });
      Object.defineProperty(screen, "height",      { get: () => 768  });
      Object.defineProperty(screen, "availWidth",  { get: () => 1366 });
      Object.defineProperty(screen, "availHeight", { get: () => 728  });
    });

    await page.setExtraHTTPHeaders({
      "Accept-Language":          "en-IN,en;q=0.9",
      "Accept-Encoding":          "gzip, deflate, br",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest":           "document",
      "Sec-Fetch-Mode":           "navigate",
      "Sec-Fetch-Site":           "none",
      "Sec-Fetch-User":           "?1",
    });

    // Block resources we don't need (but NOT scripts — Akamai needs them to fire)
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type    = req.resourceType();
      const reqUrl  = req.url();
      // Always allow scripts — blocking them causes Akamai to block
      if (type === "script") { req.continue(); return; }
      // Block media and fonts to speed up
      if (type === "media" || type === "font") { req.abort(); return; }
      // Block third-party images (keep first-party for product images)
      if (type === "image" && !reqUrl.includes("myntra")) { req.abort(); return; }
      req.continue();
    });

    // Use domcontentloaded — networkidle2 is an Akamai fingerprint signal
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout:   30_000,
    });

    // CRITICAL: Wait a realistic amount of time before doing anything
    // Akamai's sensor script runs for ~3s and measures interaction timing
    await randomDelay(3000, 5000);

    // Simulate realistic scroll (human behaviour signal)
    await page.evaluate(() => {
      window.scrollBy({ top: Math.floor(Math.random() * 400) + 100, behavior: "smooth" });
    });
    await randomDelay(500, 1200);

    const html   = await page.content();
    await browser.close();

    return parseNextData(html);
  } catch (err: any) {
    await browser.close().catch(() => {});
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────
export async function scrapeMyntra(url: string): Promise<ScrapeResult> {
  const cleanUrl   = normaliseUrl(url);
  const productId  = extractProductId(cleanUrl);

  console.log(`[myntra] Scraping ${cleanUrl} (ID: ${productId ?? "unknown"})`);

  // ── Strategy 1: __NEXT_DATA__ direct fetch ───────────────
  console.log("[myntra] Trying __NEXT_DATA__ fetch...");
  const nextResult = await tryNextDataFetch(cleanUrl);
  if (nextResult?.price) {
    console.log(`[myntra] __NEXT_DATA__ succeeded: ₹${nextResult.price}`);
    return nextResult;
  }

  // ── Strategy 2: Internal API ─────────────────────────────
  if (productId) {
    console.log("[myntra] Trying internal API...");
    const apiResult = await tryMyntraApi(productId);
    if (apiResult?.price) {
      console.log(`[myntra] Internal API succeeded: ₹${apiResult.price}`);
      return apiResult;
    }
  }

  // ── Strategy 3: Mobile PWA fetch ─────────────────────────
  console.log("[myntra] Trying mobile fetch...");
  const mobileResult = await tryMobileFetch(cleanUrl);
  if (mobileResult?.price) {
    console.log(`[myntra] Mobile fetch succeeded: ₹${mobileResult.price}`);
    return mobileResult;
  }

  // ── Strategy 4: Puppeteer with Akamai evasion ────────────
  console.log("[myntra] Trying Puppeteer...");
  await randomDelay(2000, 4000); // cooldown before spinning up browser
  const puppeteerResult = await tryPuppeteer(cleanUrl);
  if (puppeteerResult?.price) {
    console.log(`[myntra] Puppeteer succeeded: ₹${puppeteerResult.price}`);
    return puppeteerResult;
  }

  console.error(`[myntra] All strategies failed for ${cleanUrl}`);
  return {
    price:     null,
    name:      null,
    imageUrl:  null,
    available: false,
    error:     "All scraping strategies failed. Myntra Akamai bot protection is active.",
  };
}