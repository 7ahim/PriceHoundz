// app/api/notify/test/route.ts
// POST /api/notify/test
// Sends a test price-drop email to the currently signed-in user.
// Used from the notification settings panel in the dashboard.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPriceAlert } from "@/lib/mailer";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", user.id)
    .single();

  if (!profile?.email) {
    return NextResponse.json({ error: "No email found for your account" }, { status: 400 });
  }

  try {
    await sendPriceAlert({
      to:           profile.email,
      productName:  "Sony WH-1000XM5 (Test Product)",
      productUrl:   `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard`,
      currentPrice: 21990,
      targetPrice:  24990,
    });

    return NextResponse.json({ success: true, sentTo: profile.email });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
