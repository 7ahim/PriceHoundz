// app/api/scrape-cross/route.ts
// POST /api/scrape-cross  { crossId }
// Scrapes one linked platform price right now and stores it.

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { scrapeProduct } from "@/lib/scrapers";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { crossId } = await request.json();
    if (!crossId) return NextResponse.json({ error: "crossId required" }, { status: 400 });

    const { data: row } = await supabase
      .from("cross_platform_prices").select("*")
      .eq("id", crossId).eq("user_id", user.id).single();
    if (!row) return NextResponse.json({ error: "Link not found" }, { status: 404 });

    console.log(`[/api/scrape-cross] ${row.platform}: ${row.url}`);
    const result = await scrapeProduct(row.url);
    console.log(`[/api/scrape-cross] price=${result.price} error=${result.error ?? "none"}`);

    if (!result.price) {
      return NextResponse.json(
        { success: false, error: result.error ?? "Could not read the price from that page." },
        { status: 422 }
      );
    }

    const admin = createAdminClient();
    const now   = new Date().toISOString();

    const { error: hErr } = await admin.from("cross_price_history").insert({
      cross_platform_id: row.id, product_id: row.product_id, platform: row.platform, price: result.price,
    });
    if (hErr) {
      console.error("[/api/scrape-cross] history insert failed:", hErr);
      return NextResponse.json({ success: false, error: `Price found (₹${result.price}) but saving failed: ${hErr.message}` }, { status: 500 });
    }

    const updates: Record<string, any> = { current_price: result.price, updated_at: now };
    if (result.name     && !row.name)      updates.name      = result.name;
    if (result.imageUrl && !row.image_url) updates.image_url = result.imageUrl;

    const { error: uErr } = await admin.from("cross_platform_prices").update(updates).eq("id", row.id);
    if (uErr) {
      console.error("[/api/scrape-cross] update failed:", uErr);
      return NextResponse.json({ success: false, error: `Price found (₹${result.price}) but saving failed: ${uErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true, price: result.price, name: updates.name ?? row.name,
      imageUrl: updates.image_url ?? row.image_url, updatedAt: now,
    });
  } catch (err: any) {
    console.error("[/api/scrape-cross] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}