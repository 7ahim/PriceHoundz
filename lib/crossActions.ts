"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { detectPlatform } from "@/lib/utils";
import { CROSS_PLATFORMS, isCrossPlatform } from "@/lib/crossPlatforms";
import type { CrossPlatformPrice, CrossPriceHistory } from "@/types/supabase";

async function getUserAndProduct(productId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not authenticated" };
  const { data: product } = await supabase
    .from("tracked_products").select("id, platform")
    .eq("id", productId).eq("user_id", user.id).single();
  if (!product) return { ok: false as const, error: "Product not found" };
  return { ok: true as const, supabase, user, product };
}

// ── Load the linked platforms + their price history ───────────
export async function getCrossData(productId: string): Promise<
  { rows: CrossPlatformPrice[]; history: CrossPriceHistory[] } | { error: string }
> {
  try {
    const ctx = await getUserAndProduct(productId);
    if (!ctx.ok) return { error: ctx.error };
    const { supabase, user } = ctx;

    const { data: rows, error } = await supabase
      .from("cross_platform_prices").select("*")
      .eq("product_id", productId).eq("user_id", user.id).order("created_at");
    if (error) return { error: error.message };

    const ids = (rows ?? []).map((r) => r.id);
    const { data: history } = ids.length
      ? await supabase.from("cross_price_history").select("*")
          .in("cross_platform_id", ids).order("scraped_at", { ascending: true })
      : { data: [] };

    return { rows: (rows ?? []) as CrossPlatformPrice[], history: (history ?? []) as CrossPriceHistory[] };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load platforms" };
  }
}

// ── Add (or replace) the link for one platform ────────────────
export async function addCrossLink(productId: string, platform: string, rawUrl: string): Promise<
  { row: CrossPlatformPrice } | { error: string }
> {
  try {
    const url = (rawUrl ?? "").trim();
    if (!isCrossPlatform(platform)) return { error: "That platform can't be tracked." };
    const label = CROSS_PLATFORMS.find((c) => c.id === platform)!.label;

    let parsed: URL;
    try { parsed = new URL(url); } catch { return { error: "Please paste a full link (starting with https://)." }; }
    if (!/^https?:$/.test(parsed.protocol) || url.length > 2000) return { error: "That link isn't valid." };
    if (detectPlatform(url) !== platform) return { error: `That doesn't look like a ${label} product link.` };

    const ctx = await getUserAndProduct(productId);
    if (!ctx.ok) return { error: ctx.error };
    const { supabase, user, product } = ctx;
    if (product.platform === platform) return { error: `This product is already tracked on ${label}.` };

    const { data: existing } = await supabase
      .from("cross_platform_prices").select("id")
      .eq("product_id", productId).eq("platform", platform).eq("user_id", user.id).maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("cross_platform_prices")
        .update({ url, current_price: null, is_active: true, updated_at: new Date().toISOString() })
        .eq("id", existing.id).eq("user_id", user.id).select("*").single();
      if (error) return { error: error.message };
      return { row: data as CrossPlatformPrice };
    }

    const { data, error } = await supabase
      .from("cross_platform_prices")
      .insert({
        product_id: productId, user_id: user.id, platform, url,
        confirmed: true, ai_confidence: 1, ai_reasoning: "Added manually", is_active: true,
      })
      .select("*").single();
    if (error) return { error: error.message };
    return { row: data as CrossPlatformPrice };
  } catch (e: any) {
    return { error: e?.message ?? "Could not save the link" };
  }
}

// ── Remove a linked platform (and its history) ────────────────
export async function removeCrossLink(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: row } = await supabase
      .from("cross_platform_prices").select("id").eq("id", id).eq("user_id", user.id).single();
    if (!row) return { error: "Not found" };

    await createAdminClient().from("cross_price_history").delete().eq("cross_platform_id", id);
    const { error } = await supabase.from("cross_platform_prices").delete().eq("id", id).eq("user_id", user.id);
    if (error) return { error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { error: e?.message ?? "Could not remove" };
  }
}

// ── Pause / resume tracking for one platform ──────────────────
export async function toggleCrossLink(id: string, isActive: boolean): Promise<{ ok: true } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };
    const { error } = await supabase
      .from("cross_platform_prices").update({ is_active: isActive }).eq("id", id).eq("user_id", user.id);
    if (error) return { error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { error: e?.message ?? "Could not update" };
  }
}