"use client";

import { useState }  from "react";
import dynamic        from "next/dynamic";
import { ThemeProvider, DashboardNav } from "@/components/DashboardNav";
import type { Profile, TrackedProduct, PriceHistory, NotificationLog } from "@/types/supabase";

const DashboardClient      = dynamic(() => import("@/components/DashboardClient"),      { ssr: false });
const NotificationSettings = dynamic(() => import("@/components/NotificationSettings"), { ssr: false });

interface Props {
  profile:          Profile | null;
  products:         TrackedProduct[];
  allHistory:       PriceHistory[];
  notificationLogs: NotificationLog[];
}

type Tab = "tracker" | "notifications";

export default function DashboardShell({
  profile, products, allHistory, notificationLogs,
}: Props) {
  const [tab, setTab] = useState<Tab>("tracker");

  return (
    <ThemeProvider>
      <DashboardNav
        activeTab={tab}
        notifCount={notificationLogs.length}
        onTrackerClick={() => setTab("tracker")}
        onNotifClick={() => setTab("notifications")}
      />

      <div className="ph-page" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tab === "tracker" && (
          <DashboardClient
            profile={profile}
            products={products}
            allHistory={allHistory}
          />
        )}

        {tab === "notifications" && (
          <div style={{
            maxWidth: 900, margin: "0 auto", padding: "40px 32px", width: "100%",
          }}>
            <div style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: 28, letterSpacing: "-1px", marginBottom: 8,
              color: "var(--text)",
            }}>
              Notifications
            </div>
            <p style={{
              fontSize: 14, color: "var(--muted2)", fontWeight: 300,
              marginBottom: 32, lineHeight: 1.6,
            }}>
              Manage how and when PriceHound alerts you.
            </p>
            <NotificationSettings
              logs={notificationLogs}
              products={products}
              email={profile?.email ?? ""}
            />
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}