// lib/scrapers/index.ts
// Routes a product URL to the correct platform scraper.
// Amazon uses its own 4-strategy cascade internally, so we only
// retry here for non-Amazon platforms or genuine network failures.

import { scrapeAmazon }   from "./amazon";
import { scrapeFlipkart } from "./flipkart";
import { scrapeMyntra }   from "./myntra";
import { detectPlatform } from "@/lib/utils";
import type { ScrapeResult } from "./base";

export type { ScrapeResult };

// Retry config per platform
// Amazon, Flipkart, and Myntra all handle their own multi-strategy
// retries internally. No outer retries needed — they just waste runtime.
const RETRY_CONFIG: Record<string, number[]> = {
  amazon:   [0],
  flipkart: [0],
  myntra:   [0],
  other:    [0, 4_000, 10_000],
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function scrapeProduct(url: string): Promise<ScrapeResult> {
  const platform = detectPlatform(url);
  const delays   = RETRY_CONFIG[platform] ?? RETRY_CONFIG.other;

  let lastResult: ScrapeResult = {
    price: null, name: null, imageUrl: null,
    available: false, error: "Never attempted",
  };

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await sleep(delays[attempt]);

    try {
      switch (platform) {
        case "amazon":
          lastResult = await scrapeAmazon(url);
          break;
        case "flipkart":
          lastResult = await scrapeFlipkart(url);
          break;
        case "myntra":
          lastResult = await scrapeMyntra(url);
          break;
        default:
          lastResult = await scrapeGeneric(url);
      }
    } catch (err: any) {
      lastResult = {
        price: null, name: null, imageUrl: null,
        available: false, error: err?.message ?? "Unknown error",
      };
    }

    // Success — done
    if (lastResult.price !== null && lastResult.price > 0) {
      return lastResult;
    }

    // For generic platforms, a hard block means stop retrying
    if (
      platform !== "amazon" && platform !== "flipkart" && platform !== "myntra" &&
      (lastResult.error === "CAPTCHA" || lastResult.error === "BLOCKED")
    ) {
      console.warn(`[scraper] Hard block on ${url}: ${lastResult.error}`);
      return lastResult;
    }

    if (attempt < delays.length - 1) {
      console.warn(
        `[scraper] Attempt ${attempt + 1}/${delays.length} failed for ${url}: ${lastResult.error ?? "no price"}`
      );
    }
  }

  return lastResult;
}

// ── Generic scraper — JSON-LD + meta tags, no browser ────────
async function scrapeGeneric(url: string): Promise<ScrapeResult> {
  try {
    const { load } = await import("cheerio");
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "Accept-Language": "en-IN,en;q=0.9",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return { price: null, name: null, imageUrl: null, available: false, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const $    = load(html);

    let price: number | null = null;
    let name:  string | null = null;

    // JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, el) => {
      if (price) return;
      try {
        const data  = JSON.parse($(el).html() ?? "");
        const offer = data?.offers ?? data?.offer;
        if (offer?.price) price = parseFloat(String(offer.price));
        if (data?.name)   name  = String(data.name).slice(0, 200);
      } catch {}
    });

    // Meta tag fallback
    if (!price) {
      const mp =
        $('meta[property="product:price:amount"]').attr("content") ||
        $('meta[itemprop="price"]').attr("content");
      if (mp) price = parseFloat(mp);
    }

    if (!name) {
      name =
        $("h1").first().text().trim().slice(0, 200) ||
        $('meta[property="og:title"]').attr("content")?.slice(0, 200) ||
        null;
    }

    const imageUrl = $('meta[property="og:image"]').attr("content") || null;

    return {
      price:     price && price > 0 ? price : null,
      name,
      imageUrl,
      available: price !== null,
    };
  } catch (err: any) {
    return { price: null, name: null, imageUrl: null, available: false, error: err.message };
  }
}