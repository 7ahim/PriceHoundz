// app/profile/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect }     from "next/navigation";
import ProfileClient    from "@/components/ProfileClient";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).single();

  const { data: products } = await supabase
    .from("tracked_products").select("id, name, is_active, created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false });

  const { data: notifLogs } = await supabase
    .from("notification_log").select("id")
    .eq("user_id", user.id);

  return (
    <ProfileClient
      profile={profile}
      productCount={products?.length ?? 0}
      alertCount={notifLogs?.length ?? 0}
      activeCount={products?.filter((p) => p.is_active).length ?? 0}
    />
  );
}