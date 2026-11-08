"use client";

import dynamic from "next/dynamic";
import { ThemeProvider, DashboardNav } from "@/components/DashboardNav";
import type {
  Profile, TrackedProduct, PriceHistory,
  NotificationLog, CrossPlatformPrice, CrossPriceHistory,
} from "@/types/supabase";

const DashboardClient = dynamic(
  () => import("@/components/DashboardClient"),
  { ssr: false }
);

interface Props {
  profile:             Profile | null;
  products:            TrackedProduct[];
  allHistory:          PriceHistory[];
  crossPlatformPrices: CrossPlatformPrice[];
  crossHistory:        CrossPriceHistory[];
  notificationLogs:    NotificationLog[];
}

export default function DashboardShell({
  profile, products, allHistory,
  crossPlatformPrices, crossHistory,
  notificationLogs,
}: Props) {
  return (
    <ThemeProvider>
      <DashboardNav activeTab="tracker" notifCount={notificationLogs.length} />
      <div
        id="db-shell-wrap"
        style={{ position:"fixed", top:52, left:0, right:0, bottom:0, display:"flex", flexDirection:"column", overflow:"hidden" }}
      >
        <style>{`
          @media (max-width:768px) {
            #db-shell-wrap {
              position:static !important; top:auto !important; left:auto !important;
              right:auto !important; bottom:auto !important;
              height:auto !important; overflow:visible !important; padding-top:52px;
            }
          }
        `}</style>
        <DashboardClient
          profile={profile}
          products={products}
          allHistory={allHistory}
          crossPlatformPrices={crossPlatformPrices}
          crossHistory={crossHistory}
        />
      </div>
    </ThemeProvider>
  );
}