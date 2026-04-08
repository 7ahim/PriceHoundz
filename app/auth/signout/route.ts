// app/auth/callback/route.ts
// Supabase redirects here after Google OAuth — exchanges the code for a session
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // OAuth provider returned an error
  if (error) {
    console.error("[OAuth Callback] Error:", error, errorDescription);
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(errorDescription ?? error)}`
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("[OAuth Callback] Exchange error:", exchangeError.message);
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent(exchangeError.message)}`
      );
    }

    // Successful — send them to the dashboard (or wherever they came from)
    return NextResponse.redirect(`${origin}${redirectTo}`);
  }

  // No code and no error — shouldn't happen, redirect to login
  return NextResponse.redirect(`${origin}/auth/login`);
}
