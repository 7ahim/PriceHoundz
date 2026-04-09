// lib/scrapers/myntra.ts
// Myntra is a fully React SSR app — we need to wait for hydration,
// then pull from either the DOM or the embedded __myx_data__ JSON blob.
import * as cheerio from "cheerio";
import { launchBrowser, stealthPage, randomDelay, type ScrapeResult } from "./base";

const PRICE_SELECTORS = [
  "span.pdp-price strong",           // primary selling price
  "span.pdp-discounted-price strong",
  ".pdp-price",
  "span.pdp-mrp strong",             // fallback to MRP if discounted not found
];

const NAME_SELECTORS = [
  "h1.pdp-title",
  "h1.pdp-name",
  ".pdp-product-description-content h1",
];

const IMAGE_SELECTORS = [
  "img.image-grid-image",
  "div.pdp-image img",
];

function parseMyntraPrice(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s\u20B9]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Myntra embeds product data in a window.__myx_data__ or __SERVER_DATA__ blob
function extractFromMyntraScript($: cheerio.CheerioAPI): { price: number | null; name: string | null } {
  try {
    let price: number | null = null;
    let name: string | null  = null;

    $("script").each((_, el) => {
      const text = $(el).html() ?? "";
      if (text.includes("discountedPrice") || text.includes("sellingPrice")) {
        const priceMatch =
          text.match(/"discountedPrice"\s*:\s*(\d+)/) ||
          text.match(/"sellingPrice"\s*:\s*(\d+)/) ||
          text.match(/"price"\s*:\s*(\d+)/);
        if (priceMatch) price = parseInt(priceMatch[1], 10);

        const nameMatch =
          text.match(/"productName"\s*:\s*"([^"]+)"/) ||
          text.match(/"name"\s*:\s*"([^"]+)"/);
        if (nameMatch) name = nameMatch[1];

        return false; // break cheerio each
      }
    });
    return { price, name };
  } catch {
    return { price: null, name: null };
  }
}

export async function scrapeMyntra(url: string): Promise<ScrapeResult> {
  const browser = await launchBrowser();
  const page    = await stealthPage(browser);

  try {
    await randomDelay(500, 1500);

    // Myntra checks referer
    await page.setExtraHTTPHeaders({ Referer: "https://www.google.com/" });

    await page.goto(url, {
      waitUntil: "networkidle2",   // wait for React hydration
      timeout: 35_000,
    });

    // Give the React app time to render the price
    await page.waitForSelector("span.pdp-price, .pdp-discounted-price, span.pdp-mrp", {
      timeout: 15_000,
    }).catch(() => {});

    await randomDelay(800, 2000);

    const html = await page.content();
    const $    = cheerio.load(html);

    // ── Bot / access check ────────────────────────────────────
    const bodyText = $("body").text().toLowerCase();
    if (bodyText.includes("access denied") || bodyText.includes("403")) {
      return { price: null, name: null, imageUrl: null, available: false, error: "BLOCKED" };
    }

    // ── Price ─────────────────────────────────────────────────
    let price: number | null = null;
    for (const sel of PRICE_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw) {
        price = parseMyntraPrice(raw);
        if (price && price > 0) break;
      }
    }

    // Fallback: embedded JSON
    const { price: scriptPrice, name: scriptName } = extractFromMyntraScript($);
    if (!price && scriptPrice) price = scriptPrice;

    // ── Name ──────────────────────────────────────────────────
    let name: string | null = null;
    for (const sel of NAME_SELECTORS) {
      const raw = $(sel).first().text().trim();
      if (raw) { name = raw.slice(0, 200); break; }
    }
    if (!name && scriptName) name = scriptName.slice(0, 200);

    // ── Image ─────────────────────────────────────────────────
    let imageUrl: string | null = null;
    for (const sel of IMAGE_SELECTORS) {
      const src = $(sel).first().attr("src");
      if (src) { imageUrl = src; break; }
    }

    // ── Availability ──────────────────────────────────────────
    const available =
      !bodyText.includes("sold out") &&
      !$(".size-buttons-out-of-stock").length &&
      price !== null;

    return { price, name, imageUrl, available };
  } catch (err: any) {
    return { price: null, name: null, imageUrl: null, available: false, error: err.message };
  } finally {
    await browser.close();
  }
}
