"use client";

import { ThemeProvider, DashboardNav } from "@/components/DashboardNav";
import NotificationSettings from "@/components/NotificationSettings";
import type { Profile, TrackedProduct, NotificationLog } from "@/types/supabase";

interface Props {
  profile:          Profile | null;
  products:         TrackedProduct[];
  notificationLogs: NotificationLog[];
}

export default function NotificationsPageClient({
  profile, products, notificationLogs,
}: Props) {
  return (
    <ThemeProvider>
      <style>{`
        .notif-page {
          min-height: 100vh;
          background: var(--bg);
        }
        .notif-body {
          max-width: 960px;
          margin: 0 auto;
          padding: 40px 32px 80px;
        }
        .notif-header {
          margin-bottom: 36px;
        }
        .notif-header-label {
          font-family: 'DM Mono', monospace;
          font-size: 11px; color: var(--accent);
          letter-spacing: 0.12em; margin-bottom: 10px;
        }
        .notif-header-label::before { content: '// '; }
        .notif-header-title {
          font-family: 'Syne', sans-serif; font-weight: 800;
          font-size: clamp(26px, 3vw, 40px);
          letter-spacing: -1.5px; margin-bottom: 8px;
          color: var(--text);
        }
        .notif-header-sub {
          font-size: 14px; color: var(--muted2);
          font-weight: 300; line-height: 1.6;
        }
        @media (max-width: 768px) {
          .notif-body { padding: 24px; }
        }
      `}</style>

      <DashboardNav activeTab="notifications" />

      <div className="ph-page notif-page">
        <div className="notif-body">
          <div className="notif-header">
            <div className="notif-header-label">notifications</div>
            <h1 className="notif-header-title">Notifications</h1>
            <p className="notif-header-sub">
              Manage how and when PriceHound alerts you.
            </p>
          </div>
          <NotificationSettings
            logs={notificationLogs}
            products={products}
            email={profile?.email ?? ""}
          />
        </div>
      </div>
    </ThemeProvider>
  );
}