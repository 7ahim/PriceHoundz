// app/api/scrape/route.ts
// POST /api/scrape
// Scrapes a single product immediately and writes the result to the DB.
// Called right after a product is added (before the first cron run)
// and also available as a manual "refresh" action.

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { scrapeProduct } from "@/lib/scrapers";

export async function POST(request: Request) {
  try {
    // ── Auth ─────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json();
    const { productId } = body;

    if (!productId) {
      return NextResponse.json({ error: "productId required" }, { status: 400 });
    }

    // ── Verify product belongs to this user ──────────────────
    const { data: product, error: fetchError } = await supabase
      .from("tracked_products")
      .select("*")
      .eq("id", productId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // ── Scrape ───────────────────────────────────────────────
    const result = await scrapeProduct(product.url);

    if (!result.price) {
      return NextResponse.json(
        { success: false, error: result.error ?? "Could not extract price" },
        { status: 422 }
      );
    }

    // ── Persist ──────────────────────────────────────────────
    const admin = createAdminClient();

    // Write price history entry
    await admin.from("price_history").insert({
      product_id: product.id,
      price:      result.price,
    });

    // Update the product row with current price (+ name/image if missing)
    const updates: Record<string, any> = {
      current_price: result.price,
    };
    if (result.name     && !product.name)      updates.name      = result.name;
    if (result.imageUrl && !product.image_url) updates.image_url = result.imageUrl;

    // Check if target has just been hit
    const targetHit =
      result.price <= product.target_price && !product.notify_sent;
    if (targetHit) updates.notify_sent = true;

    await admin
      .from("tracked_products")
      .update(updates)
      .eq("id", product.id);

    // ── Trigger notification if target hit ───────────────────
    if (targetHit) {
      try {
        const base = getBaseUrl();
        await fetch(`${base}/api/notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            productId:    product.id,
            userId:       product.user_id,
            currentPrice: result.price,
            targetPrice:  product.target_price,
            productName:  result.name ?? product.name ?? product.url,
            productUrl:   product.url,
          }),
        });
      } catch (notifErr) {
        console.error("[/api/scrape] Notification failed:", notifErr);
      }
    }

    return NextResponse.json({
      success:   true,
      price:     result.price,
      name:      result.name     ?? product.name,
      imageUrl:  result.imageUrl ?? product.image_url,
      available: result.available,
      targetHit,
    });
  } catch (err: any) {
    console.error("[/api/scrape] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL)          return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}