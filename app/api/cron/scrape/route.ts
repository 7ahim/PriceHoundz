// app/api/cron/scrape/route.ts — daily cron: scrapes primary + cross-platform prices

import { NextResponse }      from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { scrapeProduct }     from "@/lib/scrapers";

const BATCH_SIZE  = 10;
const CONCURRENCY = 3;

export async function GET(request: Request) {
  const auth         = request.headers.get("authorization");
  const expected     = `Bearer ${process.env.CRON_SECRET}`;
  const isVercelCron = request.headers.get("x-vercel-cron-signature") != null;

  if (!isVercelCron && (!process.env.CRON_SECRET || auth !== expected)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin   = createAdminClient();
  const summary: Array<{ id: string; type: string; price: number | null; alert: boolean; error?: string }> = [];

  try {
    // ── 1. Scrape primary tracked products ────────────────────
    const { data: products } = await admin
      .from("tracked_products")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: true })
      .limit(BATCH_SIZE);

    for (let i = 0; i < (products?.length ?? 0); i += CONCURRENCY) {
      await Promise.allSettled(
        (products ?? []).slice(i, i + CONCURRENCY).map(async (product: { id: string; url: string; name?: string; image_url?: string; target_price: number; notify_sent: boolean; user_id: string; platform?: string }) => {
          try {
            const scraped = await scrapeProduct(product.url);
            if (!scraped.price) { summary.push({ id: product.id, type: "primary", price: null, alert: false, error: scraped.error }); return; }

            await admin.from("price_history").insert({ product_id: product.id, price: scraped.price });

            const updates: Record<string, any> = { current_price: scraped.price };
            if (scraped.name     && !product.name)      updates.name      = scraped.name;
            if (scraped.imageUrl && !product.image_url) updates.image_url = scraped.imageUrl;
            const targetHit = scraped.price <= product.target_price && !product.notify_sent;
            if (targetHit) updates.notify_sent = true;

            await admin.from("tracked_products").update(updates).eq("id", product.id);
            if (targetHit) await triggerNotification({ productId: product.id, userId: product.user_id, currentPrice: scraped.price, targetPrice: product.target_price, productName: scraped.name ?? product.name ?? product.url, productUrl: product.url, platform: product.platform ?? "other", isCross: false });
            summary.push({ id: product.id, type: "primary", price: scraped.price, alert: targetHit });
          } catch (err: any) { summary.push({ id: product.id, type: "primary", price: null, alert: false, error: err.message }); }
        })
      );
    }

    // ── 2. Scrape cross-platform prices ───────────────────────
    const { data: crossEntries } = await admin
      .from("cross_platform_prices")
      .select("*, tracked_products(target_price, user_id, name)")
      .eq("is_active", true)
      .eq("confirmed", true)
      .order("updated_at", { ascending: true })
      .limit(BATCH_SIZE);

    for (let i = 0; i < (crossEntries?.length ?? 0); i += CONCURRENCY) {
      await Promise.allSettled(
        (crossEntries ?? []).slice(i, i + CONCURRENCY).map(async (entry: { id: string; url: string; name?: string; platform: string; product_id: string; current_price: number | null; is_active: boolean; confirmed: boolean; updated_at: string; tracked_products?: { target_price: number; user_id: string; name?: string } }) => {
          try {
            const scraped = await scrapeProduct(entry.url);
            if (!scraped.price) { summary.push({ id: entry.id, type: "cross", price: null, alert: false, error: scraped.error }); return; }

            await admin.from("cross_price_history").insert({ cross_platform_id: entry.id, product_id: entry.product_id, platform: entry.platform, price: scraped.price });
            await admin.from("cross_platform_prices").update({ current_price: scraped.price }).eq("id", entry.id);

            const parent      = (entry as any).tracked_products;
            const targetHit   = parent?.target_price && scraped.price <= parent.target_price;
            if (targetHit && parent?.user_id) {
              await triggerNotification({ productId: entry.product_id, userId: parent.user_id, currentPrice: scraped.price, targetPrice: parent.target_price, productName: entry.name ?? parent.name ?? entry.url, productUrl: entry.url, platform: entry.platform, isCross: true });
            }
            summary.push({ id: entry.id, type: "cross", price: scraped.price, alert: !!targetHit });
          } catch (err: any) { summary.push({ id: entry.id, type: "cross", price: null, alert: false, error: err.message }); }
        })
      );
    }

    return NextResponse.json({ message: "Cron complete", scraped: summary.length, alerts: summary.filter(s=>s.alert).length, failures: summary.filter(s=>s.error).length, results: summary });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function triggerNotification(p: { productId: string; userId: string; currentPrice: number; targetPrice: number; productName: string; productUrl: string; platform: string; isCross: boolean }) {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    await fetch(`${base}/api/notify`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` }, body: JSON.stringify(p) });
  } catch {}
}