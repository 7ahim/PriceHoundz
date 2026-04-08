// app/api/cron/scrape/route.ts
// GET /api/cron/scrape
//
// Scheduled by vercel.json — runs every 4 hours.
// Also callable manually: GET /api/cron/scrape
// with header: Authorization: Bearer <CRON_SECRET>
//
// vercel.json:
// { "crons": [{ "path": "/api/cron/scrape", "schedule": "0 */4 * * *" }] }

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { scrapeProduct }     from "@/lib/scrapers";

// Vercel Hobby = 10 s max / Pro = 300 s max function duration.
// Keep BATCH_SIZE small on Hobby; increase on Pro.
const BATCH_SIZE  = 10;
const CONCURRENCY = 3;   // parallel scrapes per mini-batch

export async function GET(request: Request) {
  // ── Verify cron secret ────────────────────────────────────
  const auth     = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  // Vercel automatically sets x-vercel-cron-signature for cron invocations.
  // We also accept a manual Bearer token for local testing.
  const isVercelCron = request.headers.get("x-vercel-cron-signature") != null;

  if (!isVercelCron && (!process.env.CRON_SECRET || auth !== expected)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin   = createAdminClient();
  const summary: Array<{ id: string; price: number | null; alert: boolean; error?: string }> = [];

  try {
    // Fetch active products ordered by oldest scrape first (fair rotation)
    const { data: products, error } = await admin
      .from("tracked_products")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    if (!products?.length) {
      return NextResponse.json({ message: "No active products", scraped: 0 });
    }

    // Process in mini-batches of CONCURRENCY
    for (let i = 0; i < products.length; i += CONCURRENCY) {
      const batch = products.slice(i, i + CONCURRENCY);

      await Promise.allSettled(
        batch.map(async (product: typeof products[number]) => {
          try {
            const scraped = await scrapeProduct(product.url);

            if (!scraped.price) {
              summary.push({ id: product.id, price: null, alert: false, error: scraped.error });
              return;
            }

            // ── Write price history ──────────────────────────
            await admin.from("price_history").insert({
              product_id: product.id,
              price:      scraped.price,
            });

            // ── Update product row ───────────────────────────
            const updates: Record<string, any> = { current_price: scraped.price };
            if (scraped.name     && !product.name)      updates.name      = scraped.name;
            if (scraped.imageUrl && !product.image_url) updates.image_url = scraped.imageUrl;

            const targetHit =
              scraped.price <= product.target_price && !product.notify_sent;
            if (targetHit) updates.notify_sent = true;

            await admin
              .from("tracked_products")
              .update(updates)
              .eq("id", product.id);

            // ── Email notification ───────────────────────────
            if (targetHit) {
              await triggerNotification({
                productId:    product.id,
                userId:       product.user_id,
                currentPrice: scraped.price,
                targetPrice:  product.target_price,
                productName:  scraped.name ?? product.name ?? product.url,
                productUrl:   product.url,
              });
            }

            summary.push({ id: product.id, price: scraped.price, alert: targetHit });
          } catch (err: any) {
            console.error(`[cron] Failed ${product.id}:`, err.message);
            summary.push({ id: product.id, price: null, alert: false, error: err.message });
          }
        })
      );
    }

    const alertCount = summary.filter((s) => s.alert).length;
    const failCount  = summary.filter((s) => s.error).length;

    return NextResponse.json({
      message:  "Cron complete",
      scraped:  summary.length,
      alerts:   alertCount,
      failures: failCount,
      results:  summary,
    });
  } catch (err: any) {
    console.error("[cron] Fatal:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function triggerNotification(payload: {
  productId:    string;
  userId:       string;
  currentPrice: number;
  targetPrice:  number;
  productName:  string;
  productUrl:   string;
}) {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    await fetch(`${base}/api/notify`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[cron] Notification request failed:", err);
  }
}