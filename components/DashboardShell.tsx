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
      {/*
        Desktop: position:fixed from top:52 to bottom:0 — the dashboard fills
        the exact viewport below the nav. db-wrap + db-main fill this via
        width/height:100%.

        Mobile (≤768px): the fixed container is overridden back to normal flow
        via the CSS in DashboardClient's mobile breakpoint. db-wrap becomes
        display:block height:auto so the page scrolls normally.
      */}
      <div
        id="db-shell-wrap"
        style={{
          position: "fixed",
          top: 52,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <style>{`
          @media (max-width: 768px) {
            #db-shell-wrap {
              position: static !important;
              top: auto !important;
              left: auto !important;
              right: auto !important;
              bottom: auto !important;
              height: auto !important;
              overflow: visible !important;
              padding-top: 52px;
            }
          }
        `}</style>
        <DashboardClient
          profile={profile}
          products={products}
          allHistory={allHistory}
        />
      </div>
    </ThemeProvider>
  );
}