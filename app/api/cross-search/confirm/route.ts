// app/api/cross-search/confirm/route.ts
//
// POST /api/cross-search/confirm
//
// Called after the user confirms which cross-platform matches to track.
// Saves the confirmed products to cross_platform_prices and kicks off
// an initial scrape for each confirmed entry.

import { NextResponse }        from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

interface ConfirmedMatch {
  platform:      string;
  url:           string;
  name:          string | null;
  price:         number | null;
  imageUrl:      string | null;
  confidence:    number;
  reasoning:     string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const body = await request.json();
    const { productId, confirmed }: { productId: string; confirmed: ConfirmedMatch[] } = body;

    if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
    if (!Array.isArray(confirmed) || confirmed.length === 0) {
      return NextResponse.json({ saved: 0, message: "No matches to save." });
    }

    // Verify the product belongs to this user
    const { data: product, error: productError } = await supabase
      .from("tracked_products")
      .select("id, user_id, name, url")
      .eq("id", productId)
      .eq("user_id", user.id)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const admin = createAdminClient();
    const saved: string[] = [];
    const errors: string[] = [];

    for (const match of confirmed) {
      try {
        // Security: validate URL
        if (!match.url?.startsWith("http")) continue;

        // Upsert — if same platform already tracked, update it
        const { data: existing } = await admin
          .from("cross_platform_prices")
          .select("id")
          .eq("product_id", productId)
          .eq("platform", match.platform)
          .single();

        if (existing) {
          // Update existing record
          await admin
            .from("cross_platform_prices")
            .update({
              url:           match.url,
              name:          match.name,
              image_url:     match.imageUrl,
              current_price: match.price,
              confirmed:     true,
              ai_confidence: match.confidence,
              ai_reasoning:  match.reasoning,
              is_active:     true,
            })
            .eq("id", existing.id);
          saved.push(existing.id);
        } else {
          // Insert new cross-platform entry
          const { data: inserted, error: insertError } = await admin
            .from("cross_platform_prices")
            .insert({
              product_id:    productId,
              user_id:       user.id,
              platform:      match.platform,
              url:           match.url,
              name:          match.name,
              image_url:     match.imageUrl,
              current_price: match.price,
              confirmed:     true,
              ai_confidence: match.confidence,
              ai_reasoning:  match.reasoning,
              is_active:     true,
            })
            .select("id")
            .single();

          if (insertError) {
            errors.push(`${match.platform}: ${insertError.message}`);
          } else if (inserted) {
            saved.push(inserted.id);

            // Write initial price history entry
            if (match.price) {
              await admin.from("cross_price_history").insert({
                cross_platform_id: inserted.id,
                product_id:        productId,
                platform:          match.platform,
                price:             match.price,
              });
            }
          }
        }
      } catch (err: any) {
        errors.push(`${match.platform}: ${err.message}`);
      }
    }

    return NextResponse.json({
      saved:   saved.length,
      errors:  errors.length ? errors : undefined,
      message: `Saved ${saved.length} cross-platform tracker${saved.length !== 1 ? "s" : ""}.`,
    });
  } catch (err: any) {
    console.error("[cross-search/confirm]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}