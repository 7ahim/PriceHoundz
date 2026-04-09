// lib/scrapers/base.ts
//
// Chromium strategy per environment:
//
//  Local dev  → full `puppeteer` (bundles its own Chromium, zero config)
//  Vercel     → `puppeteer-core` + `@sparticuz/chromium-min`
//               The "-min" variant ships NO binary — it downloads a
//               pre-compressed Chromium from a public S3 URL at runtime.
//               This keeps the function bundle under Vercel's 50 MB limit.
//
// Install:
//   npm install puppeteer-core @sparticuz/chromium-min
//   npm install --save-dev puppeteer
//
// Add to .env.local (and Vercel env vars):
//   CHROMIUM_REMOTE_EXEC_PATH=https://github.com/Sparticuz/chromium/releases/download/v123.0.1/chromium-v123.0.1-pack.tar

import type { Browser, Page } from "puppeteer-core";

// ── Remote Chromium binary URL ────────────────────────────────
// Hosted on GitHub Releases — Vercel downloads and caches it.
// Pin to a specific version that matches @sparticuz/chromium-min.
// Check latest at: https://github.com/Sparticuz/chromium/releases
const CHROMIUM_REMOTE_URL =
  process.env.CHROMIUM_REMOTE_EXEC_PATH ??
  "https://github.com/Sparticuz/chromium/releases/download/v123.0.1/chromium-v123.0.1-pack.tar";

// ── User-agent pool ───────────────────────────────────────────
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

// ── Browser launcher ─────────────────────────────────────────
export async function launchBrowser(): Promise<Browser> {
  const isVercel =
    process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME != null;

  if (isVercel) {
    // Use chromium-min: no bundled binary, fetches from remote URL
    const chromium = (await import("@sparticuz/chromium-min")).default;
    const puppeteerCore = (await import("puppeteer-core")).default;

    // executablePath() accepts a remote URL — it downloads + decompresses
    // the binary to /tmp on first call, then caches it for the function lifetime.
    const executablePath = await chromium.executablePath(CHROMIUM_REMOTE_URL);

    return puppeteerCore.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    }) as unknown as Browser;
  }

  // Local dev — full puppeteer with its bundled Chromium
  const puppeteer = (await import("puppeteer")).default;
  return puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1920,1080",
      "--disable-blink-features=AutomationControlled",
    ],
  }) as unknown as Browser;
}

// ── Stealth page ──────────────────────────────────────────────
export async function stealthPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(randomUserAgent());
  await page.setViewport({ width: 1920, height: 1080 });

  // Mask headless signals
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-IN", "en-US", "en"],
    });
  });

  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-IN,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
  });

  // Block images / fonts / media to speed up scraping
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    ["image", "media", "font", "stylesheet"].includes(req.resourceType())
      ? req.abort()
      : req.continue();
  });

  return page;
}

// ── Shared result type ────────────────────────────────────────
export interface ScrapeResult {
  price: number | null;
  name: string | null;
  imageUrl: string | null;
  available: boolean;
  error?: string;
}
