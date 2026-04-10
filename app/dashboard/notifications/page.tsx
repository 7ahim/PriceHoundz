// app/dashboard/notifications/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect }     from "next/navigation";
import NotificationsPageClient from "@/components/NotificationsPageClient";

export default async function NotificationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).single();

  const { data: products } = await supabase
    .from("tracked_products").select("*")
    .eq("user_id", user.id).order("created_at", { ascending: false });

  const { data: notificationLogs } = await supabase
    .from("notification_log").select("*")
    .eq("user_id", user.id).order("sent_at", { ascending: false }).limit(50);

  return (
    <NotificationsPageClient
      profile={profile}
      products={products ?? []}
      notificationLogs={notificationLogs ?? []}
    />
  );
}