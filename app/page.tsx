// app/page.tsx  (server component — checks auth, passes to client)
import { createClient } from "@/lib/supabase/server";
import LandingClient from "@/components/LandingClient";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return <LandingClient isLoggedIn={!!user} userEmail={user?.email ?? null} />;
}