// lib/scrapers/base.ts
// Works locally (full puppeteer) AND on Vercel serverless
// (@sparticuz/chromium + puppeteer-core).
//
// npm install puppeteer-core @sparticuz/chromium
// npm install --save-dev puppeteer   ← local dev only

import type { Browser, Page } from "puppeteer-core";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function randomDelay(min = 1200, max = 3500): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

export async function launchBrowser(): Promise<Browser> {
  const isServerless =
    process.env.VERCEL === "1" ||
    process.env.AWS_LAMBDA_FUNCTION_NAME != null;

  if (isServerless) {
    const chromium      = (await import("@sparticuz/chromium")).default;
    const puppeteerCore = (await import("puppeteer-core")).default;
    const executablePath = await chromium.executablePath();
    return puppeteerCore.launch({
      args:              chromium.args,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      executablePath,
      headless:true,
    }) as unknown as Browser;
  }

  // Local dev — full puppeteer with bundled Chromium
  const puppeteer = (await import("puppeteer")).default;
  return puppeteer.launch({
    headless: false,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", "--disable-gpu",
      "--window-size=1920,1080",
      "--disable-blink-features=AutomationControlled",
    ],
  }) as unknown as Browser;
}

export async function stealthPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(randomUserAgent());
  await page.setViewport({ width: 1920, height: 1080 });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver",  { get: () => undefined });
    Object.defineProperty(navigator, "plugins",    { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages",  { get: () => ["en-IN", "en-US", "en"] });
  });

  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-IN,en;q=0.9",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control":   "no-cache",
  });

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    ["image", "media", "font", "stylesheet"].includes(req.resourceType())
      ? req.abort()
      : req.continue();
  });

  return page;
}

export interface ScrapeResult {
  price:     number | null;
  name:      string | null;
  imageUrl:  string | null;
  available: boolean;
  error?:    string;
}
