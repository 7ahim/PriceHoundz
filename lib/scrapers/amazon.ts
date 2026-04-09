// lib/scrapers/amazon.ts
import * as cheerio from "cheerio";
import { launchBrowser, stealthPage, randomDelay, type ScrapeResult } from "./base";

// Amazon frequently A/B tests its page layout — we try multiple selectors
// in order of reliability and fall back gracefully.
const PRICE_SELECTORS = [
  // Primary: the main offer price block
  ".priceToPay .a-price-whole",
  "#priceblock_ourprice",
  "#priceblock_dealprice",
  // Secondary: used on deal / lightning deal pages
  ".apexPriceToPay .a-price-whole",
  ".a-price.aok-align-center .a-price-whole",
  // Tertiary: subscribe & save / other variants
  "#sns-base-price",
  ".a-color-price",
  // New 2024 layout
  "span[data-a-color='base'] .a-price-whole",
];

const NAME_SELECTORS = [
  "#productTitle",
  "#title",
  "h1.product-title-word-break",
];

const IMAGE_SELECTORS = [
  "#landingImage",
  "#imgBlkFront",
  ".a-dynamic-image.a-stretch-vertical",
];

function parseAmazonPrice(raw: string): number | null {
  // Amazon prices look like "24,990" or "24,990.00" or "₹24,990"
  const cleaned = raw.replace(/[₹,\s]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export async function scrapeAmazon(url: string): Promise<ScrapeResult> {
  // Normalise URL — strip affiliate tags, force Indian domain
  const parsed = new URL(url);
  parsed.hostname = "www.amazon.in";

  // Remove tracking params that can trigger bot checks
  ["tag", "linkCode", "linkId", "ref", "psc", "th"].forEach((p) => parsed.searchParams.delete(p));
  const cleanUrl = parsed.toString();

  const browser = await launchBrowser();
  const page    = await stealthPage(browser);

  try {
    // Amazon rate-limits aggressive crawlers — a small pre-delay helps
    await randomDelay(500, 1500);

    await page.goto(cleanUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Wait for the price block — if it never appears the product may be
    // unavailable or we've hit a CAPTCHA page.
    await page.waitForSelector("#corePriceDisplay_desktop_feature_div, #buyNew_noncbb, .a-color-price", {
      timeout: 12_000,
    }).catch(() => { /* timeout is fine — we'll return null price */ });

    // Extra random delay to mimic reading the page
    await randomDelay(800, 2000);

    const html = await page.content();
    const $    = cheerio.load(html);

    // ── CAPTCHA / bot wall detection ──────────────────────────
    const title = $("title").text().toLowerCase();
    if (
      title.includes("robot check") ||
      title.includes("captcha") ||
      title.includes("service unavailable") ||
      $("form[action='/errors/validateCaptcha']").length > 0
    ) {
      return { price: null, name: null, imageUrl: null, available: false, error: "CAPTCHA" };
    }

    // ── Price ─────────────────────────────────────────────────
    let price: number | null = null;
    for (const sel of PRICE_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw) {
        price = parseAmazonPrice(raw);
        if (price && price > 0) break;
      }
    }

    // ── Name ──────────────────────────────────────────────────
    let name: string | null = null;
    for (const sel of NAME_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw) { name = raw.slice(0, 200); break; }
    }

    // ── Image ─────────────────────────────────────────────────
    let imageUrl: string | null = null;
    for (const sel of IMAGE_SELECTORS) {
      const src = $(sel).first().attr("src") || $(sel).first().attr("data-src");
      if (src) { imageUrl = src; break; }
    }

    // ── Availability ──────────────────────────────────────────
    const unavailableText = $("#availability span").text().toLowerCase();
    const available =
      !unavailableText.includes("unavailable") &&
      !unavailableText.includes("out of stock") &&
      price !== null;

    return { price, name, imageUrl, available };
  } catch (err: any) {
    return { price: null, name: null, imageUrl: null, available: false, error: err.message };
  } finally {
    await browser.close();
  }
}
