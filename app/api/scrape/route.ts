// app/api/scrape/route.ts
// POST /api/scrape
// Triggers an immediate scrape for a single product.
// Called from the dashboard when a user first adds a product
// so they don't have to wait for the next cron run.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { scrapeProduct } from "@/lib/scrapers";

export async function POST(request: Request) {
  try {
    // Auth check — must be signed in
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { productId } = await request.json();
    if (!productId) {
      return NextResponse.json({ error: "productId required" }, { status: 400 });
    }

    // Fetch the product — ensure it belongs to this user
    const { data: product, error: fetchError } = await supabase
      .from("tracked_products")
      .select("*")
      .eq("id", productId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Run the scraper
    console.log("Scraping URL:", product.url);
    const result = await scrapeProduct(product.url);
    console.log("Scrape result:", result);
    
    if (!result.price) {
      return NextResponse.json({
        success: false,
        error: result.error ?? "Could not extract price",
      }, { status: 422 });
    }

    // Write to price_history and update current_price on the product
    const admin = createAdminClient();

    await admin.from("price_history").insert({
      product_id: product.id,
      price: result.price,
    });

    const updates: Record<string, any> = {
      current_price: result.price,
    };
    if (result.name && !product.name) updates.name = result.name;
    if (result.imageUrl && !product.image_url) updates.image_url = result.imageUrl;

    await admin
      .from("tracked_products")
      .update(updates)
      .eq("id", product.id);

    return NextResponse.json({
      success: true,
      price: result.price,
      name: result.name,
      available: result.available,
    });
  } catch (err: any) {
    console.error("[/api/scrape] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
