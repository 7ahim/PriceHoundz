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
  const { data: allHistory } = productIds.length
    ? await supabase.from("price_history").select("*")
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
      notificationLogs={notificationLogs ?? []}
    />
  );
}
