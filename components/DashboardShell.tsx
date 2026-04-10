"use client";

import dynamic from "next/dynamic";
import { ThemeProvider, DashboardNav } from "@/components/DashboardNav";
import type { Profile, TrackedProduct, PriceHistory, NotificationLog } from "@/types/supabase";

const DashboardClient = dynamic(
  () => import("@/components/DashboardClient"),
  { ssr: false }
);

interface Props {
  profile:          Profile | null;
  products:         TrackedProduct[];
  allHistory:       PriceHistory[];
  notificationLogs: NotificationLog[];
}

export default function DashboardShell({
  profile, products, allHistory, notificationLogs,
}: Props) {
  return (
    <ThemeProvider>
      <DashboardNav
        activeTab="tracker"
        notifCount={notificationLogs.length}
      />
      {/* ph-page adds paddingTop:52 to clear the fixed nav */}
      <div className="ph-page" style={{ display: "flex", overflow: "hidden" }}>
        <DashboardClient
          profile={profile}
          products={products}
          allHistory={allHistory}
        />
      </div>
    </ThemeProvider>
  );
}