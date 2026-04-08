import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server2";
import { scrapeProduct } from "@/lib/scrapers/index";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, targetPrice, userId } = body;

    if (!url || !targetPrice || !userId) {
      return NextResponse.json(
        { error: "Missing fields" },
        { status: 400 }
      );
    }

    // 🟢 1. Detect platform (basic)
    let platform = "other";
    if (url.includes("amazon")) platform = "amazon";
    if (url.includes("flipkart")) platform = "flipkart";
    if (url.includes("myntra")) platform = "myntra";

    // 🟢 2. Insert into tracked_products
    const { data: product, error: insertError } = await supabaseAdmin
      .from("tracked_products")
      .insert([
        {
          url,
          target_price: targetPrice,
          user_id: userId,
          platform,
          current_price: null,
        },
      ])
      .select()
      .single();

    if (insertError || !product) {
      throw insertError || new Error("Insert failed");
    }

    // 🟡 3. Scrape immediately
    let scrapedData = null;

    try {
      scrapedData = await scrapeProduct(url);
    } catch (err) {
      console.error("Scraping failed:", err);
    }

    // 🔵 4. If scrape success → update DB
    if (scrapedData?.price) {
      const price = scrapedData.price;

      // update tracked_products
      await supabaseAdmin
        .from("tracked_products")
        .update({
          current_price: price,
          name: scrapedData.title || null,
          notify_sent: false, // reset
        })
        .eq("id", product.id);

      // insert into price_history
      await supabaseAdmin.from("price_history").insert([
        {
          product_id: product.id,
          price,
        },
      ]);
    }

    // 🟣 5. Response
    return NextResponse.json({
      success: true,
      product,
      scraped: scrapedData,
    });

  } catch (error) {
    console.error("API ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}