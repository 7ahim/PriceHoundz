// app/api/cross-search/route.ts
//
// Uses each platform's own internal JSON search/suggest APIs.
// These are the same endpoints their mobile apps call — they return JSON
// without needing JavaScript execution or browser automation.
//
// Strategy per platform:
//  Flipkart        → /api/5/page/dynamic/search (internal search API)
//  Amazon          → /s?k=...&page=1 + __react_hydration data, or /dp directly
//  Croma           → /cromaservices/rest/v2/products/search?q=...
//  Reliance Digital → /rildigitalws/v2/rrldigital/cms/pageData?pageType=SEARCH
//  Poorvika        → /all?search=... (server-rendered, cheerio works fine here)
//
// Each strategy extracts the FIRST relevant product URL, then calls
// scrapeProduct() on that PDP URL to get accurate price + name.

import { NextResponse }   from "next/server";
import { createClient }  from "@/lib/supabase/server";
import { scrapeProduct } from "@/lib/scrapers";

// ── Shared fetch headers ──────────────────────────────────────
const DESKTOP_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-IN,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control":   "no-cache",
  "Referer":         "https://www.google.com/",
};

const JSON_HEADERS = {
  "User-Agent":       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":           "application/json, text/plain, */*",
  "Accept-Language":  "en-IN,en;q=0.9",
  "X-Requested-With": "XMLHttpRequest",
};

function parsePrice(raw: string | number): number | null {
  if (typeof raw === "number") return raw > 0 ? Math.round(raw) : null;
  const n = parseInt(String(raw).replace(/[₹,\s]/g, ""), 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// ── 1. FLIPKART ───────────────────────────────────────────────
// Flipkart's internal search API returns a JSON blob with product listings.
// The mobile site (m.flipkart.com) is much less protected than desktop.
async function searchFlipkart(query: string): Promise<{ url: string; name: string | null; price: number | null; imageUrl: string | null } | null> {
  // Strategy A: Flipkart suggest API — returns product IDs we can use
  const suggestApis = [
    `https://www.flipkart.com/api/6/page/dynamic/search?affid=pricehoun&q=${encodeURIComponent(query)}&sort=relevance&page=1`,
    `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&sort=relevance&page=1`,
  ];

  // Strategy A: Mobile Flipkart — different JS stack, easier to parse
  try {
    const mobileUrl = `https://m.flipkart.com/search?q=${encodeURIComponent(query)}&sort=relevance&as=off&as-show=off&otracker=search`;
    const res = await fetch(mobileUrl, {
      headers: {
        "User-Agent":      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Referer":         "https://www.google.com/",
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });

    if (res.ok) {
      const html = await res.text();
      // Mobile Flipkart embeds product data in __INITIAL_STATE__ or as JSON props
      const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
      if (initialStateMatch) {
        try {
          const state = JSON.parse(initialStateMatch[1]);
          const raw   = JSON.stringify(state);
          // Find first product URL in state
          const urlMatch = raw.match(/"pageUrl"\s*:\s*"(\/[^"]+\/p\/[^"]{10,})"/);
          if (urlMatch?.[1]) {
            const productUrl = "https://www.flipkart.com" + urlMatch[1].split("?")[0];
            const result = await scrapeProduct(productUrl);
            if (result.price) return { url: productUrl, name: result.name, price: result.price, imageUrl: result.imageUrl };
          }
        } catch {}
      }

      // Parse __NEXT_DATA__ from mobile page
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]{0,200000})<\/script>/);
      if (nextDataMatch) {
        const raw = nextDataMatch[1];
        const urlMatch = raw.match(/"(?:url|href|pageUrl)"\s*:\s*"((?:https?:\/\/(?:www\.)?flipkart\.com)?\/[^"]+\/p\/[A-Z0-9]{10,}[^"]*)"/);
        if (urlMatch?.[1]) {
          const productUrl = urlMatch[1].startsWith("http")
            ? urlMatch[1].split("?")[0]
            : "https://www.flipkart.com" + urlMatch[1].split("?")[0];
          const result = await scrapeProduct(productUrl);
          if (result.price) return { url: productUrl, name: result.name, price: result.price, imageUrl: result.imageUrl };
        }
      }

      // Cheerio on mobile HTML — simpler DOM than desktop
      const { load } = await import("cheerio");
      const $ = load(html);
      // On mobile, product cards have simpler markup
      const hrefs = $("a[href*='/p/']").map((_, el) => $(el).attr("href")).get();
      for (const href of hrefs) {
        if (!href) continue;
        // Skip app banners, category pages, filters
        if (href.includes("?") && href.includes("appLink")) continue;
        if (/\/p\/[A-Z0-9]{10,}/.test(href)) {
          const productUrl = href.startsWith("http")
            ? href.split("?")[0]
            : "https://www.flipkart.com" + href.split("?")[0];
          const result = await scrapeProduct(productUrl);
          if (result.price) return { url: productUrl, name: result.name, price: result.price, imageUrl: result.imageUrl };
          break;
        }
      }
    }
  } catch (err: any) {
    console.error("[cross-search] Flipkart mobile failed:", err.message);
  }

  // Strategy B: Flipkart autocomplete / typeahead API
  try {
    const acUrl = `https://www.flipkart.com/api/6/suggest?q=${encodeURIComponent(query)}&as=on&as-show=on&as-suggest=on&locale=en&pageNumber=1`;
    const res   = await fetch(acUrl, {
      headers: { ...JSON_HEADERS, "Referer": "https://www.flipkart.com/" },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const json = await res.json();
      const raw  = JSON.stringify(json);
      // Extract first product URL
      const urlMatch = raw.match(/"(?:pageUrl|url)"\s*:\s*"(\/[^"]+\/p\/[A-Z0-9]{10,}[^"]*)"/);
      if (urlMatch?.[1]) {
        const productUrl = "https://www.flipkart.com" + urlMatch[1].split("?")[0];
        const result = await scrapeProduct(productUrl);
        if (result.price) return { url: productUrl, name: result.name, price: result.price, imageUrl: result.imageUrl };
      }
    }
  } catch {}

  return null;
}

// ── 2. AMAZON ────────────────────────────────────────────────
// Amazon's search is server-rendered — plain fetch works if we look for
// the right React hydration data or use their completion API.
async function searchAmazon(query: string): Promise<{ url: string; name: string | null; price: number | null; imageUrl: string | null } | null> {
  // Strategy A: Amazon completion API (returns product ASINs)
  try {
    const completionUrl = `https://completion.amazon.in/api/2017/suggestions?lop=en_IN&site-variant=desktop&category=aps&prefix=${encodeURIComponent(query)}&marketplace=IN&plain-mid=1&client-info=amazon-search-ui`;
    const res = await fetch(completionUrl, {
      headers: { ...JSON_HEADERS, "Referer": "https://www.amazon.in/" },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const json = await res.json();
      const suggestions = json?.suggestions ?? [];
      for (const s of suggestions) {
        if (s?.asin) {
          const productUrl = `https://www.amazon.in/dp/${s.asin}`;
          const result = await scrapeProduct(productUrl);
          if (result.price) return { url: productUrl, name: result.name, price: result.price, imageUrl: result.imageUrl };
        }
      }
    }
  } catch {}

  // Strategy B: Amazon search page — server-rendered, works with plain fetch
  try {
    const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(query)}&ref=nb_sb_noss`;
    const res = await fetch(searchUrl, {
      headers: { ...DESKTOP_HEADERS, "Referer": "https://www.amazon.in/" },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (res.ok) {
      const html = await res.text();
      const { load } = await import("cheerio");
      const $ = load(html);

      // Amazon search results: h2 > a.a-link-normal with /dp/ASIN href
      const hrefs = [
        ...$("h2 a.a-link-normal").map((_, el) => $(el).attr("href")).get(),
        ...$("a.a-link-normal[href*='/dp/']").map((_, el) => $(el).attr("href")).get(),
      ];

      for (const href of hrefs) {
        if (!href) continue;
        const asinMatch = href.match(/\/dp\/([A-Z0-9]{10})/);
        if (asinMatch) {
          const productUrl = `https://www.amazon.in/dp/${asinMatch[1]}`;
          const result = await scrapeProduct(productUrl);
          if (result.price) return { url: productUrl, name: result.name, price: result.price, imageUrl: result.imageUrl };
          break;
        }
      }
    }
  } catch (err: any) {
    console.error("[cross-search] Amazon search failed:", err.message);
  }

  return null;
}

// ── 3. CROMA ─────────────────────────────────────────────────
// Croma has an internal search API used by their React app.
async function searchCroma(query: string): Promise<{ url: string; name: string | null; price: number | null; imageUrl: string | null } | null> {
  const searchApis = [
    // Croma's Spring/Hybris commerce search API
    `https://www.croma.com/cromaservices/rest/v2/products/search?q=${encodeURIComponent(query)}&fields=FULL&currentPage=0&pageSize=5&lang=en&curr=INR`,
    // Alternative endpoint
    `https://api.croma.com/searchservices/v1/search?q=${encodeURIComponent(query)}&pageSize=5&currentPage=0`,
  ];

  for (const apiUrl of searchApis) {
    try {
      const res = await fetch(apiUrl, {
        headers: {
          ...JSON_HEADERS,
          "Referer": "https://www.croma.com/",
          "Origin":  "https://www.croma.com",
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("json")) continue;

      const json = await res.json();

      // Hybris/SAP Commerce response format: { products: [{ url, name, price }] }
      const products = json?.products ?? json?.results ?? [];
      for (const p of products) {
        const slug = p?.url ?? p?.slug ?? p?.code;
        if (slug) {
          const productUrl = slug.startsWith("http") ? slug : `https://www.croma.com${slug.startsWith("/") ? "" : "/"}${slug}`;
          const result = await scrapeProduct(productUrl);
          if (result.price) return { url: productUrl, name: result.name ?? p.name, price: result.price, imageUrl: result.imageUrl };
        }
      }
    } catch {}
  }

  // Fallback: Croma search page with Googlebot UA (they allow bots)
  try {
    const searchUrl = `https://www.croma.com/searchB?q=${encodeURIComponent(query)}%3Arelevance`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept":          "text/html,application/xhtml+xml",
        "Accept-Language": "en-IN,en;q=0.9",
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (res.ok) {
      const html = await res.text();
      // Try __NEXT_DATA__ for SSR data
      const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]{0,300000})<\/script>/);
      if (ndMatch) {
        // Find first PDP URL in the data blob
        const urlMatch = ndMatch[1].match(/"(?:url|href|pdpUrl)"\s*:\s*"(\/[^"]*\/p\/\d{5,}[^"]*)"/);
        if (urlMatch?.[1]) {
          const productUrl = "https://www.croma.com" + urlMatch[1].split("?")[0];
          const result = await scrapeProduct(productUrl);
          if (result.price) return { url: productUrl, name: result.name, price: result.price, imageUrl: result.imageUrl };
        }
      }
      // Cheerio fallback
      const { load } = await import("cheerio");
      const $ = load(html);
      const hrefs = $("a[href*='/p/']").map((_, el) => $(el).attr("href")).get();
      for (const href of hrefs) {
        if (!href || !/\/p\/\d{5,}/.test(href)) continue;
        const productUrl = href.startsWith("http") ? href : "https://www.croma.com" + href.split("?")[0];
        const result = await scrapeProduct(productUrl);
        if (result.price) return { url: productUrl, name: result.name, price: result.price, imageUrl: result.imageUrl };
        break;
      }
    }
  } catch (err: any) {
    console.error("[cross-search] Croma fallback failed:", err.message);
  }

  return null;
}

// ── 4. RELIANCE DIGITAL ──────────────────────────────────────
// Reliance Digital has a REST API that their Next.js app calls.
async function searchRelianceDigital(query: string): Promise<{ url: string; name: string | null; price: number | null; imageUrl: string | null } | null> {
  const searchApis = [
    `https://www.reliancedigital.in/rildigitalws/v2/rrldigital/cms/pageData?pageType=SEARCH&searchQuery=${encodeURIComponent(query)}&lang=en&curr=INR&pageSize=5&currentPage=0`,
    `https://www.reliancedigital.in/rildigitalws/v2/rrldigital/products/search?q=${encodeURIComponent(query)}&pageSize=5&currentPage=0&fields=FULL`,
  ];

  for (const apiUrl of searchApis) {
    try {
      const res = await fetch(apiUrl, {
        headers: {
          ...JSON_HEADERS,
          "Referer": "https://www.reliancedigital.in/",
          "Origin":  "https://www.reliancedigital.in",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("json")) continue;

      const json = await res.json();
      const raw  = JSON.stringify(json);

      // Find first product URL in the response
      const urlPatterns = [
        /"(?:url|slug|pageUrl)"\s*:\s*"(\/[^"]*\/p\/\d{5,}[^"]*)"/,
        /"(?:productUrl|pdpUrl)"\s*:\s*"(\/[^"]*\/p\/\d{5,}[^"]*)"/,
      ];
      for (const pat of urlPatterns) {
        const m = raw.match(pat);
        if (m?.[1]) {
          const productUrl = "https://www.reliancedigital.in" + m[1].split("?")[0];
          const result = await scrapeProduct(productUrl);
          if (result.price) return { url: productUrl, name: result.name, price: result.price, imageUrl: result.imageUrl };
          break;
        }
      }
    } catch {}
  }

  // Fallback: search page with different headers
  try {
    const res = await fetch(`https://www.reliancedigital.in/search?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent":      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept":          "text/html,application/xhtml+xml",
        "Accept-Language": "en-IN,en;q=0.9",
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (res.ok) {
      const html = await res.text();
      const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]{0,300000})<\/script>/);
      if (ndMatch) {
        const urlMatch = ndMatch[1].match(/"(?:url|slug)"\s*:\s*"(\/[^"]*\/p\/\d{5,}[^"]*)"/);
        if (urlMatch?.[1]) {
          const productUrl = "https://www.reliancedigital.in" + urlMatch[1].split("?")[0];
          const result = await scrapeProduct(productUrl);
          if (result.price) return { url: productUrl, name: result.name, price: result.price, imageUrl: result.imageUrl };
        }
      }
    }
  } catch (err: any) {
    console.error("[cross-search] Reliance Digital fallback failed:", err.message);
  }

  return null;
}

// ── 5. POORVIKA ──────────────────────────────────────────────
// Poorvika is Magento (PHP server-rendered) — plain fetch + cheerio works well.
async function searchPoorvika(query: string): Promise<{ url: string; name: string | null; price: number | null; imageUrl: string | null } | null> {
  const UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  ];

  for (const ua of UAS) {
    try {
      const searchUrl = `https://www.poorvika.com/all?search=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent":      ua,
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-IN,en;q=0.9",
          "Referer":         "https://www.google.com/",
        },
        signal: AbortSignal.timeout(12_000),
        redirect: "follow",
      });

      if (!res.ok) continue;
      const html = await res.text();
      const { load } = await import("cheerio");
      const $ = load(html);

      // Poorvika Magento — product items have class product-item
      // Product links end in .html
      const hrefs = [
        ...$("a.product-item-link").map((_, el) => $(el).attr("href")).get(),
        ...$("a[href$='.html']").map((_, el) => $(el).attr("href")).get(),
        ...$("[class*='product-item'] a[href*='.html']").map((_, el) => $(el).attr("href")).get(),
      ].filter(Boolean) as string[];

      for (const href of hrefs) {
        if (!href || href.includes("category") || href.includes("/all")) continue;
        const productUrl = href.startsWith("http") ? href : `https://www.poorvika.com${href}`;
        if (!/[\w-]+\.html/.test(productUrl)) continue;
        const result = await scrapeProduct(productUrl);
        if (result.price) return { url: productUrl, name: result.name, price: result.price, imageUrl: result.imageUrl };
        break;
      }

      // Also try Poorvika's REST API
      try {
        const apiUrl = `https://www.poorvika.com/rest/V1/products?searchCriteria[filterGroups][0][filters][0][field]=name&searchCriteria[filterGroups][0][filters][0][value]=%25${encodeURIComponent(query)}%25&searchCriteria[filterGroups][0][filters][0][conditionType]=like&searchCriteria[pageSize]=5&fields=items[name,custom_attributes,extension_attributes]`;
        const apiRes = await fetch(apiUrl, {
          headers: { ...JSON_HEADERS, "Referer": "https://www.poorvika.com/" },
          signal: AbortSignal.timeout(8_000),
        });
        if (apiRes.ok) {
          const json = await apiRes.json();
          const items = json?.items ?? [];
          for (const item of items) {
            const urlKey = item?.custom_attributes?.find((a: any) => a.attribute_code === "url_key")?.value;
            if (urlKey) {
              const productUrl = `https://www.poorvika.com/${urlKey}.html`;
              const result = await scrapeProduct(productUrl);
              if (result.price) return { url: productUrl, name: result.name ?? item.name, price: result.price, imageUrl: result.imageUrl };
            }
          }
        }
      } catch {}
    } catch (err: any) {
      console.error("[cross-search] Poorvika failed:", err.message);
    }
  }

  return null;
}

// ── Platform search map ───────────────────────────────────────
const PLATFORM_SEARCHERS: Record<string, (q: string) => Promise<{ url: string; name: string | null; price: number | null; imageUrl: string | null } | null>> = {
  flipkart:        searchFlipkart,
  amazon:          searchAmazon,
  croma:           searchCroma,
  reliancedigital: searchRelianceDigital,
  poorvika:        searchPoorvika,
};

const ALL_PLATFORMS = Object.keys(PLATFORM_SEARCHERS);

// ── Main handler ──────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const body = await request.json();
    const { url, productName, productPrice, sourcePlatform } = body;

    if (!url?.startsWith("http")) return NextResponse.json({ error: "Valid URL required." }, { status: 400 });
    if (!productName?.trim())     return NextResponse.json({ error: "productName required." }, { status: 400 });

    const sourcePrice     = parseFloat(productPrice) || null;
    const sourcePlatform_ = (sourcePlatform as string) ?? "other";

    // Clean query — remove parenthesised specs, trim to 80 chars
    const cleanQuery = productName
      .replace(/\(.*?\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 80);

    console.log(`[cross-search] "${cleanQuery}" (source: ${sourcePlatform_}, ₹${sourcePrice})`);

    // Search all other platforms in parallel, each with a 30s timeout
    const targets = ALL_PLATFORMS.filter((p) => p !== sourcePlatform_);

    const results = await Promise.allSettled(
      targets.map((platform) =>
        Promise.race([
          PLATFORM_SEARCHERS[platform](cleanQuery).catch((err) => {
            console.error(`[cross-search] ${platform} threw:`, err.message);
            return null;
          }),
          new Promise<null>((r) => setTimeout(() => r(null), 30_000)),
        ])
      )
    );

    // Collect successful candidates
    const candidates: Array<{ platform: string; url: string; name: string | null; price: number | null; imageUrl: string | null }> = [];
    results.forEach((r, i) => {
      const val = r.status === "fulfilled" ? r.value : null;
      if (val?.url && val?.price) {
        candidates.push({
          platform: targets[i],
          url:      val.url,
          name:     val.name,
          price:    val.price,
          imageUrl: val.imageUrl,
        });
      }
    });

    console.log(`[cross-search] ${candidates.length} candidates: ${candidates.map(c => `${c.platform}(₹${c.price})`).join(", ")}`);

    return NextResponse.json({
      source:     { name: productName, url, price: sourcePrice, platform: sourcePlatform_ },
      candidates,
    });
  } catch (err: any) {
    console.error("[cross-search] Fatal:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}