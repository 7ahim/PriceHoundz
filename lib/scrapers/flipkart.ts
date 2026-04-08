// lib/scrapers/flipkart.ts
import * as cheerio from "cheerio";
import { launchBrowser, stealthPage, randomDelay, type ScrapeResult } from "./base";

// Flipkart uses React-rendered pages — prices are in data attributes or
// JSON blobs embedded in <script> tags as well as the DOM.
const PRICE_SELECTORS = [
  // 2024 layout
  "div._30jeq3._16Jk6d",       // selling price (most common)
  "div._30jeq3",               // base price fallback
  "._25b18cr ._30jeq3",        // alternate product page
  "div.Nx9bqj.CxhGGd",        // newer variant
  "div._16Jk6d",
];

const NAME_SELECTORS = [
  "span.B_NuCI",               // standard product title
  "h1._9E25nV span",
  "h1 span",
];

const IMAGE_SELECTORS = [
  "img._396cs4._2amPTt._3qGmMb",
  "img._396cs4",
  "div._3kidJX img",
];

function parseFlipkartPrice(raw: string): number | null {
  // Prices look like "₹24,990" or "24,990"
  const cleaned = raw.replace(/[₹,\s]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Flipkart sometimes embeds the price in a window.__INITIAL_STATE__ JSON blob
function extractFromScript($: cheerio.CheerioAPI): number | null {
  try {
    let found: number | null = null;
    $("script").each((_, el) => {
      const text = $(el).html() ?? "";
      if (text.includes("finalPrice") || text.includes("sellingPrice")) {
        const match =
          text.match(/"finalPrice"\s*:\s*(\d+)/) ||
          text.match(/"sellingPrice"\s*:\s*(\d+)/);
        if (match) {
          found = parseInt(match[1], 10);
          return false; // break
        }
      }
    });
    return found;
  } catch {
    return null;
  }
}

export async function scrapeFlipkart(url: string): Promise<ScrapeResult> {
  // Clean affiliate/tracking params
  const parsed = new URL(url);
  ["affid", "affExtParam1", "affExtParam2", "otracker", "pid"].forEach((p) =>
    parsed.searchParams.delete(p)
  );

  const browser = await launchBrowser();
  const page    = await stealthPage(browser);

  try {
    await randomDelay(500, 1500);

    // Flipkart aggressively checks referrer — spoofing it helps bypass
    await page.setExtraHTTPHeaders({ Referer: "https://www.google.com/" });

    await page.goto(parsed.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Wait for the price element or the "blocked" page
    await page.waitForSelector("div._30jeq3, div.Nx9bqj, ._16Jk6d", {
      timeout: 12_000,
    }).catch(() => {});

    await randomDelay(600, 1800);

    const html = await page.content();
    const $    = cheerio.load(html);

    // ── Bot wall detection ────────────────────────────────────
    const bodyText = $("body").text().toLowerCase();
    if (
      bodyText.includes("access denied") ||
      bodyText.includes("unusual traffic") ||
      bodyText.includes("verify you are human")
    ) {
      return { price: null, name: null, imageUrl: null, available: false, error: "BLOCKED" };
    }

    // ── Price ─────────────────────────────────────────────────
    let price: number | null = null;

    for (const sel of PRICE_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw) {
        price = parseFlipkartPrice(raw);
        if (price && price > 0) break;
      }
    }

    // Fallback: try the embedded JSON
    if (!price) price = extractFromScript($);

    // ── Name ──────────────────────────────────────────────────
    let name: string | null = null;
    for (const sel of NAME_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw) { name = raw.slice(0, 200); break; }
    }

    // ── Image ─────────────────────────────────────────────────
    let imageUrl: string | null = null;
    for (const sel of IMAGE_SELECTORS) {
      const src = $(sel).first().attr("src");
      if (src) { imageUrl = src; break; }
    }

    // ── Availability ──────────────────────────────────────────
    const available =
      !bodyText.includes("sold out") &&
      !bodyText.includes("out of stock") &&
      price !== null;

    return { price, name, imageUrl, available };
  } catch (err: any) {
    return { price: null, name: null, imageUrl: null, available: false, error: err.message };
  } finally {
    await browser.close();
  }
}
