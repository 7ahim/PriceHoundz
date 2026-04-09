// app/api/notify/route.ts
// POST /api/notify
//
// Called internally by:
//   - /api/scrape    (on-demand scrape when target is hit)
//   - /api/cron/scrape  (scheduled batch scrape)
//
// Protected by CRON_SECRET so it can't be triggered by anyone externally.
// Never called directly from the browser.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPriceAlert } from "@/lib/mailer";

export async function POST(request: Request) {
  // ── Auth ─────────────────────────────────────────────────
  const auth     = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Parse body ───────────────────────────────────────────
  let body: {
    productId:    string;
    userId:       string;
    currentPrice: number;
    targetPrice:  number;
    productName:  string;
    productUrl:   string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { productId, userId, currentPrice, targetPrice, productName, productUrl } = body;

  if (!productId || !userId || !currentPrice || !targetPrice || !productUrl) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── Look up user email ────────────────────────────────────
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .single();

  if (profileError || !profile?.email) {
    console.error("[/api/notify] Could not find user profile:", profileError);
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // ── Check we haven't already sent an alert for this cycle ─
  // (Belt-and-suspenders — the scraper also checks notify_sent,
  //  but this prevents double-sends if the route is called twice.)
  const { data: existing } = await admin
    .from("notification_log")
    .select("id")
    .eq("product_id", productId)
    .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // last 24 h
    .limit(1)
    .single();

  if (existing) {
    return NextResponse.json({
      success: false,
      message: "Alert already sent within the last 24 hours",
    });
  }

  // ── Send the email ────────────────────────────────────────
  try {
    await sendPriceAlert({
      to:           profile.email,
      productName:  productName || "Your tracked product",
      productUrl,
      currentPrice,
      targetPrice,
    });
  } catch (mailErr: any) {
    console.error("[/api/notify] Email send failed:", mailErr.message);
    return NextResponse.json(
      { error: `Email failed: ${mailErr.message}` },
      { status: 500 }
    );
  }

  // ── Log the notification ──────────────────────────────────
  const { error: logError } = await admin.from("notification_log").insert({
    product_id: productId,
    user_id:    userId,
    price:      currentPrice,
    email:      profile.email,
  });

  if (logError) {
    // Non-fatal — email was sent, log just failed
    console.warn("[/api/notify] Failed to write notification_log:", logError.message);
  }

  console.log(`[/api/notify] Alert sent to ${profile.email} for product ${productId} @ ${currentPrice}`);

  return NextResponse.json({
    success:   true,
    sentTo:    profile.email,
    productId,
    price:     currentPrice,
  });
}
