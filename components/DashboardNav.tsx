"use client";

import { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────
//  Theme context
// ─────────────────────────────────────────────────────────────
type Theme = "dark" | "light";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeCtx);
}

const DARK_VARS = `
  --bg:#0a0a0a; --bg2:#111111; --bg3:#181818;
  --border:rgba(255,255,255,0.08); --border2:rgba(255,255,255,0.14);
  --accent:#e8ff47; --accent2:#ff6b35;
  --text:#f0ede8; --muted:#6b6b6b; --muted2:#9a9a9a;
  --success:#6ee7b7; --danger:#f87171;
  --nav-bg:rgba(10,10,10,0.93);
  --card:#141414;
  --scrollbar-thumb:rgba(255,255,255,0.12);
  --scrollbar-thumb-hover:rgba(255,255,255,0.22);
`;

const LIGHT_VARS = `
  --bg:#f5f5f0; --bg2:#ffffff; --bg3:#f0eff8;
  --border:rgba(0,0,0,0.08); --border2:rgba(0,0,0,0.14);
  --accent:#5c8a00; --accent2:#c4430a;
  --text:#1a1a1a; --muted:#8a8a8a; --muted2:#5a5a5a;
  --success:#0a6640; --danger:#c0392b;
  --nav-bg:rgba(245,245,240,0.96);
  --card:#ffffff;
  --scrollbar-thumb:rgba(0,0,0,0.15);
  --scrollbar-thumb-hover:rgba(0,0,0,0.28);
`;

// ─────────────────────────────────────────────────────────────
//  ThemeProvider
// ─────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("ph_theme") as Theme | null;
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  const toggle = () => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("ph_theme", next);
      return next;
    });
  };

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

        :root { ${mounted && theme === "light" ? LIGHT_VARS : DARK_VARS} }

        html, body {
          background: var(--bg);
          color: var(--text);
          font-family: 'DM Sans', sans-serif;
          transition: background 0.25s, color 0.25s;
        }

        /* ─── Custom scrollbar — sidebar and page ─── */
        .ph-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: var(--scrollbar-thumb) transparent;
        }
        .ph-scrollbar::-webkit-scrollbar { width: 4px; }
        .ph-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .ph-scrollbar::-webkit-scrollbar-thumb {
          background: var(--scrollbar-thumb);
          border-radius: 4px;
          transition: background 0.2s;
        }
        .ph-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--scrollbar-thumb-hover);
        }

        /* ─── Shared nav ─── */
        .ph-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 300;
          height: 52px;
          display: flex; align-items: center;
          padding: 0 32px;
          background: var(--nav-bg);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--border);
          transition: background 0.25s, border-color 0.25s;
        }

        .ph-nav-logo {
          font-family: 'Syne', sans-serif; font-weight: 800; font-size: 18px;
          color: var(--text); text-decoration: none;
          display: flex; align-items: center; gap: 8px;
          flex: 1; flex-shrink: 0;
          transition: color 0.2s;
        }
        .ph-nav-logo-dot {
          width: 7px; height: 7px;
          background: var(--accent); border-radius: 50%; flex-shrink: 0;
          transition: background 0.25s;
        }

        /* Tabs — truly centred regardless of left/right widths */
        .ph-nav-tabs {
          position: absolute; left: 50%; transform: translateX(-50%);
          display: flex; align-items: stretch; height: 52px;
        }
        .ph-nav-tab {
          font-family: 'DM Mono', monospace; font-size: 11px;
          letter-spacing: 0.1em; padding: 0 18px;
          display: flex; align-items: center; gap: 6px;
          text-decoration: none; background: transparent; border: none;
          border-bottom: 2px solid transparent;
          color: var(--muted2); cursor: pointer;
          transition: color 0.2s, border-color 0.2s;
          white-space: nowrap; height: 52px;
        }
        .ph-nav-tab:hover  { color: var(--text); }
        .ph-nav-tab.active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }
        .ph-nav-badge {
          background: color-mix(in srgb, var(--accent) 15%, transparent);
          color: var(--accent);
          font-size: 9px; padding: 1px 6px; border-radius: 2px;
        }

        /* Right controls */
        .ph-nav-right {
          display: flex; align-items: center; gap: 10px;
          flex: 1; justify-content: flex-end; flex-shrink: 0;
        }

        /* Theme toggle */
        .ph-theme-toggle {
          display: flex; align-items: center; gap: 6px;
        }
        .ph-theme-icon {
          font-size: 13px; line-height: 1; user-select: none;
        }
        .ph-theme-btn {
          width: 34px; height: 20px;
          background: var(--border2);
          border: 1px solid var(--border2);
          border-radius: 10px;
          position: relative; cursor: pointer;
          transition: background 0.25s, border-color 0.25s;
          flex-shrink: 0; padding: 0;
        }
        .ph-theme-btn::after {
          content: '';
          position: absolute; top: 2px;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--accent);
          transition: left 0.2s ease, background 0.25s;
        }
        .ph-theme-btn.dark::after  { left: 2px; }
        .ph-theme-btn.light::after { left: 16px; }

        /* Sign out */
        .ph-signout-btn {
          background: transparent; border: 1px solid var(--border2);
          font-family: 'DM Mono', monospace; font-size: 10px;
          color: var(--muted2); cursor: pointer; letter-spacing: 0.06em;
          padding: 5px 12px; transition: all 0.2s; white-space: nowrap;
        }
        .ph-signout-btn:hover { color: var(--danger); border-color: var(--danger); }

        /* Page offset — all dashboard pages use this */
        .ph-page { padding-top: 52px; min-height: 100vh; }

        /* ── Responsive nav ── */
        @media (max-width: 768px) {
          .ph-nav { padding: 0 16px; }
          .ph-nav-tab { padding: 0 12px; font-size: 10px; }
          .ph-signout-btn { display: none; }
        }
      `}</style>
      {children}
    </ThemeCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
//  DashboardNav — shared across all three dashboard pages
// ─────────────────────────────────────────────────────────────
interface DashboardNavProps {
  activeTab:   "tracker" | "analytics" | "notifications";
  notifCount?: number;
}

export function DashboardNav({ activeTab, notifCount = 0 }: DashboardNavProps) {
  const { theme, toggle } = useTheme();

  return (
    <nav className="ph-nav">
      {/* Logo */}
      <Link href="/" className="ph-nav-logo">
        <span className="ph-nav-logo-dot" />
        PriceHound
      </Link>

      {/* Centre tabs — all are Links now */}
      <div className="ph-nav-tabs">
        <Link
          href="/dashboard"
          className={`ph-nav-tab${activeTab === "tracker" ? " active" : ""}`}
        >
          TRACKER
        </Link>
        <Link
          href="/dashboard/analytics"
          className={`ph-nav-tab${activeTab === "analytics" ? " active" : ""}`}
        >
          ANALYTICS
        </Link>
        <Link
          href="/dashboard/notifications"
          className={`ph-nav-tab${activeTab === "notifications" ? " active" : ""}`}
        >
          NOTIFICATIONS
          {notifCount > 0 && (
            <span className="ph-nav-badge">{notifCount}</span>
          )}
        </Link>
      </div>

      {/* Right */}
      <div className="ph-nav-right">
        <div className="ph-theme-toggle">
          <span className="ph-theme-icon">{theme === "dark" ? "🌙" : "☀️"}</span>
          <button
            className={`ph-theme-btn ${theme}`}
            onClick={toggle}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-label="Toggle theme"
          />
        </div>
        <form action="/auth/signout" method="POST">
          <button type="submit" className="ph-signout-btn">SIGN OUT ↪</button>
        </form>
      </div>
    </nav>
  );
}