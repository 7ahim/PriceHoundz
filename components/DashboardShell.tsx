"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Profile, TrackedProduct, PriceHistory, NotificationLog } from "@/types/supabase";

const DashboardClient = dynamic(() => import("@/components/DashboardClient"), { ssr: false });
const NotificationSettings = dynamic(() => import("@/components/NotificationSettings"), { ssr: false });

interface Props {
  profile:           Profile | null;
  products:          TrackedProduct[];
  allHistory:        PriceHistory[];
  notificationLogs:  NotificationLog[];
}

type Tab = "tracker" | "notifications";

export default function DashboardShell({
  profile, products, allHistory, notificationLogs,
}: Props) {
  const [tab, setTab] = useState<Tab>("tracker");

  const tabStyle = (t: Tab): React.CSSProperties => ({
    background:  "transparent",
    border:      "none",
    borderBottom: tab === t ? "2px solid #e8ff47" : "2px solid transparent",
    color:       tab === t ? "#f0ede8" : "#6b6b6b",
    fontFamily:  "'DM Mono', monospace",
    fontSize:    11,
    letterSpacing: "0.1em",
    padding:     "12px 0",
    cursor:      "pointer",
    transition:  "color 0.2s, border-color 0.2s",
    whiteSpace:  "nowrap",
  });

  // The notifications tab is shown as a top bar only when NOT on the
  // tracker tab (the tracker has its own full-height sidebar layout).
  if (tab === "tracker") {
    return (
      <>
        {/* Tiny tab bar floated at top right inside the tracker */}
        <div style={{
          position: "fixed", top: 0, right: 0, zIndex: 200,
          display: "flex", gap: 24, padding: "0 32px",
          background: "rgba(10,10,10,0.9)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}>
          <button style={tabStyle("tracker")} onClick={() => setTab("tracker")}>
            TRACKER
          </button>
          <button style={tabStyle("notifications")} onClick={() => setTab("notifications")}>
            NOTIFICATIONS
            {notificationLogs.length > 0 && (
              <span style={{
                marginLeft: 6,
                background: "rgba(232,255,71,0.15)",
                color: "#e8ff47",
                fontFamily: "'DM Mono', monospace",
                fontSize: 9,
                padding: "1px 6px",
                borderRadius: 2,
              }}>
                {notificationLogs.length}
              </span>
            )}
          </button>
        </div>
        {/* Push content below the fixed tab bar */}
        <div style={{ paddingTop: 44, width: "100%", display: "flex" }}>
          <DashboardClient
            profile={profile}
            products={products}
            allHistory={allHistory}
          />
        </div>
      </>
    );
  }

  // Notifications tab — full-width centered layout
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        :root {
          --bg:#0a0a0a; --bg2:#111111; --bg3:#181818;
          --border:rgba(255,255,255,0.08); --border2:rgba(255,255,255,0.14);
          --accent:#e8ff47; --text:#f0ede8; --muted:#6b6b6b; --muted2:#9a9a9a;
          --success:#6ee7b7; --danger:#f87171;
        }
        body { background:var(--bg); color:var(--text); font-family:'DM Sans',sans-serif; }
      `}</style>

      {/* Tab bar */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 48px",
        background: "rgba(10,10,10,0.9)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <a href="/" style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16,
          color: "#f0ede8", textDecoration: "none",
          display: "flex", alignItems: "center", gap: 8, padding: "12px 0",
        }}>
          <span style={{ width: 7, height: 7, background: "#e8ff47", borderRadius: "50%", display: "inline-block" }} />
          PriceHound
        </a>
        <div style={{ display: "flex", gap: 24 }}>
          <button style={tabStyle("tracker")} onClick={() => setTab("tracker")}>
            TRACKER
          </button>
          <button style={tabStyle("notifications")} onClick={() => setTab("notifications")}>
            NOTIFICATIONS
            {notificationLogs.length > 0 && (
              <span style={{
                marginLeft: 6,
                background: "rgba(232,255,71,0.15)",
                color: "#e8ff47",
                fontFamily: "'DM Mono', monospace",
                fontSize: 9, padding: "1px 6px", borderRadius: 2,
              }}>
                {notificationLogs.length}
              </span>
            )}
          </button>
        </div>
        <div style={{ width: 120 }} /> {/* spacer */}
      </div>

      {/* Content */}
      <div style={{ paddingTop: 60, minHeight: "100vh", background: "var(--bg)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 32px" }}>
          <div style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 28, letterSpacing: "-1px", marginBottom: 8,
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
      </div>
    </>
  );
}
