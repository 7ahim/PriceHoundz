// app/dashboard/analytics/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect }     from "next/navigation";
import AnalyticsClient  from "@/components/AnalyticsClient";

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // All tracked products
  const { data: products } = await supabase
    .from("tracked_products")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Full price history for all products
  const productIds = (products ?? []).map((p) => p.id);
  const { data: allHistory } = productIds.length
    ? await supabase
        .from("price_history")
        .select("*")
        .in("product_id", productIds)
        .order("scraped_at", { ascending: true })
    : { data: [] };

  // Notification log (for savings calculation)
  const { data: notificationLogs } = await supabase
    .from("notification_log")
    .select("*")
    .eq("user_id", user.id)
    .order("sent_at", { ascending: true });

  return (
    <AnalyticsClient
      products={products ?? []}
      allHistory={allHistory ?? []}
      notificationLogs={notificationLogs ?? []}
    />
  );
}