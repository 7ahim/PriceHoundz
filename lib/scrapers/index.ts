// lib/scrapers/index.ts
// Routes a product URL to the correct platform scraper.
// Includes exponential-backoff retry logic so transient failures
// (network blip, temporary bot wall) don't permanently stop tracking.

import { scrapeAmazon }   from "./amazon";
import { scrapeFlipkart } from "./flipkart";
import { scrapeMyntra }   from "./myntra";
import { detectPlatform } from "@/lib/utils";
import type { ScrapeResult } from "./base";

export type { ScrapeResult };

const RETRY_DELAYS_MS = [0, 3_000, 8_000]; // immediate → 3 s → 8 s

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function scrapeProduct(url: string): Promise<ScrapeResult> {
  const platform = detectPlatform(url);

  let lastResult: ScrapeResult = {
    price: null,
    name: null,
    imageUrl: null,
    available: false,
    error: "Never attempted",
  };

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (RETRY_DELAYS_MS[attempt] > 0) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }

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
          // Generic fallback — best-effort Cheerio fetch, no JS rendering
          lastResult = await scrapeGeneric(url);
      }
    } catch (err: any) {
      lastResult = {
        price: null, name: null, imageUrl: null,
        available: false,
        error: err?.message ?? "Unknown error",
      };
    }

    // If we got a price, no need to retry
    if (lastResult.price !== null && lastResult.price > 0) {
      return lastResult;
    }

    // Don't retry on hard blocks (CAPTCHA/403) — backing off won't help immediately
    if (lastResult.error === "CAPTCHA" || lastResult.error === "BLOCKED") {
      console.warn(`[scraper] Hard block on ${url}: ${lastResult.error}`);
      return lastResult;
    }

    console.warn(
      `[scraper] Attempt ${attempt + 1} failed for ${url}: ${lastResult.error ?? "no price found"}`
    );
  }

  return lastResult;
}

// ── Generic scraper (no JS rendering) ────────────────────────
// Used for platforms we haven't built a dedicated scraper for yet.
async function scrapeGeneric(url: string): Promise<ScrapeResult> {
  try {
    const { load } = await import("cheerio");
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "Accept-Language": "en-IN,en;q=0.9",
      },
    });

    if (!res.ok) {
      return { price: null, name: null, imageUrl: null, available: false, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const $ = load(html);

    // Look for common microdata / JSON-LD price patterns
    let price: number | null = null;
    let name: string | null  = null;

    // JSON-LD structured data (schema.org/Product)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() ?? "");
        const offer = data?.offers ?? data?.offer;
        if (offer?.price) {
          price = parseFloat(String(offer.price));
        }
        if (data?.name) name = String(data.name).slice(0, 200);
      } catch {}
    });

    // Meta tags fallback
    if (!price) {
      const metaPrice =
        $('meta[property="product:price:amount"]').attr("content") ||
        $('meta[itemprop="price"]').attr("content");
      if (metaPrice) price = parseFloat(metaPrice);
    }

    if (!name) {
      name =
        $("h1").first().text().trim().slice(0, 200) ||
        $('meta[property="og:title"]').attr("content")?.slice(0, 200) ||
        null;
    }

    const imageUrl =
      $('meta[property="og:image"]').attr("content") || null;

    return {
      price: price && price > 0 ? price : null,
      name,
      imageUrl,
      available: price !== null,
    };
  } catch (err: any) {
    return { price: null, name: null, imageUrl: null, available: false, error: err.message };
  }
}
