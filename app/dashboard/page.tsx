// app/dashboard/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect }     from "next/navigation";
import DashboardShell   from "@/components/DashboardShell";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).single();

  const { data: products } = await supabase
    .from("tracked_products").select("*")
    .eq("user_id", user.id).order("created_at", { ascending: false });

  const productIds = (products ?? []).map((p) => p.id);

  // Primary price history
  const { data: allHistory } = productIds.length
    ? await supabase.from("price_history").select("*")
        .in("product_id", productIds).order("scraped_at", { ascending: true })
    : { data: [] };

  // Cross-platform prices (confirmed only)
  const { data: crossPlatformPrices } = productIds.length
    ? await supabase.from("cross_platform_prices").select("*")
        .in("product_id", productIds)
        .eq("confirmed", true)
        .eq("is_active", true)
    : { data: [] };

  const crossIds = (crossPlatformPrices ?? []).map((c) => c.id);

  // Cross-platform price history for charts
  const { data: crossHistory } = crossIds.length
    ? await supabase.from("cross_price_history").select("*")
        .in("product_id", productIds).order("scraped_at", { ascending: true })
    : { data: [] };

  const { data: notificationLogs } = await supabase
    .from("notification_log").select("*")
    .eq("user_id", user.id).order("sent_at", { ascending: false }).limit(50);

  return (
    <DashboardShell
      profile={profile}
      products={products ?? []}
      allHistory={allHistory ?? []}
      crossPlatformPrices={crossPlatformPrices ?? []}
      crossHistory={crossHistory ?? []}
      notificationLogs={notificationLogs ?? []}
    />
  );
}