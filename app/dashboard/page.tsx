// app/dashboard/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Fetch all tracked products for this user
  const { data: products } = await supabase
    .from("tracked_products")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Fetch price history for all products
  const productIds = (products ?? []).map((p) => p.id);
  const { data: allHistory } = productIds.length
    ? await supabase
        .from("price_history")
        .select("*")
        .in("product_id", productIds)
        .order("scraped_at", { ascending: true })
    : { data: [] };

  return (
    <DashboardClient
      profile={profile}
      products={products ?? []}
      allHistory={allHistory ?? []}
    />
  );
}
