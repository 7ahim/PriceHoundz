// Usage:  npm run test-scrape -- "<product url>"
// Runs the real scraper for one URL on your machine and prints the result,
// plus a [croma]/[flipkart]/... log line for every strategy it tries.
import { scrapeProduct } from "../lib/scrapers";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: npm run test-scrape -- "https://www.croma.com/..."');
    process.exit(1);
  }
  const t0 = Date.now();
  const result = await scrapeProduct(url);
  console.log("\n──────── RESULT ────────");
  console.log(result);
  console.log(`Took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(result.price ? 0 : 1);
}

main();