"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { detectPlatform } from "@/lib/utils";

// ── Add a product to track ────────────────────────────────────
// Returns the new productId so the client can immediately call
// POST /api/scrape to fetch the first price without waiting for cron.
export async function addProduct(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const url         = formData.get("url") as string;
  const targetPrice = parseFloat(formData.get("target_price") as string);
  const name        = (formData.get("name") as string) || null;

  if (!url || isNaN(targetPrice) || targetPrice <= 0) {
    return { error: "Invalid URL or target price" };
  }

  const platform = detectPlatform(url);

  const { data, error } = await supabase
    .from("tracked_products")
    .insert({ user_id: user.id, url, name, platform, target_price: targetPrice })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Don't revalidatePath yet — the client will trigger the scrape first,
  // then revalidate once we have a real price to show.
  return { success: true, productId: data.id };
}

// ── Delete a tracked product ──────────────────────────────────
export async function deleteProduct(productId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tracked_products")
    .delete()
    .eq("id", productId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

// ── Toggle active / paused ────────────────────────────────────
export async function toggleProduct(productId: string, isActive: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tracked_products")
    .update({ is_active: !isActive, notify_sent: false })
    .eq("id", productId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

// ── Update target price ───────────────────────────────────────
export async function updateTargetPrice(productId: string, newPrice: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tracked_products")
    .update({ target_price: newPrice, notify_sent: false })
    .eq("id", productId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

// ── Revalidate dashboard (called by client after scrape finishes) ──
export async function revalidateDashboard() {
  revalidatePath("/dashboard");
}