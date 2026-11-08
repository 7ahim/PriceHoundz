// lib/crossAlert.ts
// Sends the target-price email when a LINKED platform (same product on another
// store) drops to the product's target. Shares the product's `notify_sent` flag,
// so the user still gets only one alert per target, whichever store hits first.

import { CROSS_PLATFORMS } from "@/lib/crossPlatforms";

export async function alertIfCrossTargetHit(
  admin: any,
  args: { productId: string; platform: string; price: number; url: string; name?: string | null },
): Promise<boolean> {
  try {
    const { data: product } = await admin
      .from("tracked_products")
      .select("id, user_id, name, target_price, notify_sent")
      .eq("id", args.productId)
      .single();

    if (!product || product.notify_sent || args.price > product.target_price) return false;

    // Claim the alert atomically so two parallel checks can't both send
    const { data: claimed } = await admin
      .from("tracked_products")
      .update({ notify_sent: true })
      .eq("id", product.id)
      .eq("notify_sent", false)
      .select("id");
    if (!claimed?.length) return false;

    const label = CROSS_PLATFORMS.find((p) => p.id === args.platform)?.label ?? args.platform;
    const base  = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const res = await fetch(`${base}/api/notify`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: JSON.stringify({
        productId:    product.id,
        userId:       product.user_id,
        currentPrice: args.price,
        targetPrice:  product.target_price,
        productName:  `${args.name ?? product.name ?? "Your product"} (on ${label})`,
        productUrl:   args.url,
      }),
    });

    // Email failed → release the flag so the next check retries
    if (!res.ok) {
      await admin.from("tracked_products").update({ notify_sent: false }).eq("id", product.id);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[crossAlert] failed:", err);
    return false;
  }
}