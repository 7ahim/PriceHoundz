// lib/scrapers/base.ts
// Shared Puppeteer launch config + bot-evasion helpers

import puppeteer, { type Browser, type Page } from "puppeteer";

// ── Rotating user-agent pool ──────────────────────────────────
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ── Random delay — mimics human reading time ──────────────────
export function randomDelay(min = 1200, max = 3500): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

// ── Puppeteer launch options ──────────────────────────────────
export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1920,1080",
      // Prevent Cloudflare / bot-detection from seeing Puppeteer flags
      "--disable-blink-features=AutomationControlled",
    ],
    ignoreHTTPSErrors: true,
  } as any);
}

// ── Stealth page setup ────────────────────────────────────────
// Overrides the most commonly fingerprinted JS properties so
// headless Chrome looks like a regular browser session.
export async function stealthPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();

  const ua = randomUserAgent();
  await page.setUserAgent(ua);

  await page.setViewport({ width: 1920, height: 1080 });

  // Override navigator.webdriver (the #1 bot detection signal)
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
    // Spoof plugins list (empty in headless Chrome)
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    // Spoof languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-IN", "en-US", "en"],
    });
    // Remove the automation chrome object
    // @ts-ignore
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    // @ts-ignore
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    // @ts-ignore
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
  });

  // Accept cookies / Indian locale headers
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-IN,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  });

  // Block images, fonts, and media to speed up scraping
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (["image", "media", "font", "stylesheet"].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  return page;
}

// ── Shared scrape result type ─────────────────────────────────
export interface ScrapeResult {
  price: number | null;
  name: string | null;
  imageUrl: string | null;
  available: boolean;
  error?: string;
}
