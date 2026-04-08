// app/api/cron/scrape/route.ts
// GET /api/cron/scrape
//
// This route is called on a schedule by Vercel Cron (or any external
// cron service like cron-job.org / GitHub Actions).
//
// It MUST be protected by the CRON_SECRET env var — never expose it publicly.
//
// Vercel cron config (vercel.json):
// {
//   "crons": [{ "path": "/api/cron/scrape", "schedule": "0 */4 * * *" }]
// }
// → runs every 4 hours

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { scrapeProduct } from "@/lib/scrapers";

// Max products to scrape in one cron invocation.
// Vercel Hobby functions time out at 10 s; Pro at 60 s.
// Adjust this based on your plan.
const BATCH_SIZE = 10;

export async function GET(request: Request) {
  // ── Auth: verify the cron secret ─────────────────────────
  const authHeader = request.headers.get("authorization");
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expectedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const results: Record<string, any>[] = [];

  try {
    // Fetch all active products, oldest-updated first so no product starves
    const { data: products, error } = await admin
      .from("tracked_products")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;
    if (!products?.length) {
      return NextResponse.json({ message: "No active products to scrape", scraped: 0 });
    }

    // Scrape products concurrently in small batches to avoid memory spikes.
    // 3 at a time is safe on a 512 MB serverless function.
    const CONCURRENCY = 3;

    for (let i = 0; i < products.length; i += CONCURRENCY) {
      const batch = products.slice(i, i + CONCURRENCY);

      await Promise.all(
        batch.map(async (product: typeof products[number]) => {
          const entry: Record<string, any> = { id: product.id, url: product.url };

          try {
            const scraped = await scrapeProduct(product.url);
            entry.scraped_price = scraped.price;
            entry.error         = scraped.error ?? null;

            if (!scraped.price) {
              results.push(entry);
              return;
            }

            // ── Persist price history ────────────────────────
            await admin.from("price_history").insert({
              product_id: product.id,
              price: scraped.price,
            });

            // ── Update current price on the product ──────────
            const updates: Record<string, any> = {
              current_price: scraped.price,
            };
            if (scraped.name && !product.name)         updates.name      = scraped.name;
            if (scraped.imageUrl && !product.image_url) updates.image_url = scraped.imageUrl;

            // ── Check if target price has been hit ───────────
            const targetHit =
              scraped.price <= product.target_price &&
              !product.notify_sent;           // only alert once per target cycle

            if (targetHit) {
              updates.notify_sent = true;
              entry.alert = true;
            }

            await admin
              .from("tracked_products")
              .update(updates)
              .eq("id", product.id);

            // ── Trigger email notification ───────────────────
            // We call the notification route internally rather than
            // sending the email directly here — keeps concerns separate
            // and lets the notification logic run in its own context.
            if (targetHit) {
              try {
                const notifUrl = new URL("/api/notify", getBaseUrl());
                await fetch(notifUrl.toString(), {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.CRON_SECRET}`,
                  },
                  body: JSON.stringify({
                    productId:    product.id,
                    userId:       product.user_id,
                    currentPrice: scraped.price,
                    targetPrice:  product.target_price,
                    productName:  scraped.name ?? product.name ?? product.url,
                    productUrl:   product.url,
                  }),
                });
              } catch (notifErr) {
                console.error("[cron] Failed to send notification:", notifErr);
              }
            }
          } catch (err: any) {
            entry.error = err.message;
            console.error(`[cron] Error scraping ${product.url}:`, err);
          }

          results.push(entry);
        })
      );
    }

    return NextResponse.json({
      message: "Cron scrape complete",
      scraped: results.length,
      results,
    });
  } catch (err: any) {
    console.error("[cron] Fatal error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
