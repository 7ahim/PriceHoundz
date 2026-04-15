"use client";

import { useState, useEffect, createContext, useContext, lazy, Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const TourTriggerButton = dynamic(
  () => import("@/components/OnboardingTour").then((m) => ({ default: m.TourTriggerButton })),
  { ssr: false }
);
const OnboardingTour = dynamic(() => import("@/components/OnboardingTour"), { ssr: false });

type Theme = "dark" | "light";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} });
export function useTheme() { return useContext(ThemeCtx); }

const DARK_VARS = `
  --bg:#0a0a0a; --bg2:#111111; --bg3:#181818;
  --border:rgba(255,255,255,0.08); --border2:rgba(255,255,255,0.16);
  --accent:#e8ff47; --accent2:#ff6b35; --accent-fg:#0a0a0a;
  --text:#f0ede8; --muted:#6b6b6b; --muted2:#9a9a9a;
  --success:#4ade80; --danger:#f87171;
  --nav-bg:rgba(10,10,10,0.94);
  --card:#141414;
  --scrollbar-thumb:rgba(255,255,255,0.12);
  --scrollbar-thumb-hover:rgba(255,255,255,0.24);
`;

/* Light mode: slate/indigo palette — warm background, indigo accent,
   high-contrast text. No green for buttons or interactive elements. */
const LIGHT_VARS = `
  --bg:#f0eff4; --bg2:#ffffff; --bg3:#e4e3ea;
  --border:rgba(0,0,0,0.10); --border2:rgba(0,0,0,0.20);
  --accent:#4f46e5; --accent2:#ea580c; --accent-fg:#ffffff;
  --text:#0f0f14; --muted:#6b7280; --muted2:#374151;
  --success:#16a34a; --danger:#dc2626;
  --nav-bg:rgba(240,239,244,0.97);
  --card:#ffffff;
  --scrollbar-thumb:rgba(0,0,0,0.15);
  --scrollbar-thumb-hover:rgba(0,0,0,0.30);
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme,   setTheme]   = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("ph_theme") as Theme | null;
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  const toggle = () => setTheme((t) => {
    const next = t === "dark" ? "light" : "dark";
    localStorage.setItem("ph_theme", next);
    return next;
  });

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

        :root { ${mounted && theme === "light" ? LIGHT_VARS : DARK_VARS} }

        html, body {
          background:var(--bg); color:var(--text);
          font-family:'DM Sans',sans-serif;
          transition:background 0.25s,color 0.25s;
        }

        /* Security: prevent text-size attack on iOS */
        body { -webkit-text-size-adjust:100%; }

        /* Custom scrollbar */
        .ph-scrollbar { scrollbar-width:thin; scrollbar-color:var(--scrollbar-thumb) transparent; }
        .ph-scrollbar::-webkit-scrollbar { width:4px; }
        .ph-scrollbar::-webkit-scrollbar-track { background:transparent; }
        .ph-scrollbar::-webkit-scrollbar-thumb { background:var(--scrollbar-thumb); border-radius:4px; }
        .ph-scrollbar::-webkit-scrollbar-thumb:hover { background:var(--scrollbar-thumb-hover); }

        /* ── Nav: 3-col grid — logo | tabs | right ── */
        .ph-nav {
          position:fixed; top:0; left:0; right:0; z-index:300;
          height:52px;
          display:grid;
          grid-template-columns:auto 1fr auto;
          align-items:center;
          gap:16px;
          padding:0 24px;
          background:var(--nav-bg);
          backdrop-filter:blur(16px);
          -webkit-backdrop-filter:blur(16px);
          border-bottom:1px solid var(--border);
          transition:background 0.25s,border-color 0.25s;
        }

        .ph-nav-logo {
          font-family:'Syne',sans-serif; font-weight:800; font-size:18px;
          color:var(--text); text-decoration:none;
          display:flex; align-items:center; gap:8px; flex-shrink:0;
        }
        .ph-nav-logo:hover { opacity:0.8; }
        .ph-nav-logo-dot { width:7px; height:7px; background:var(--accent); border-radius:50%; flex-shrink:0; transition:background 0.25s; }

        .ph-nav-tabs { display:flex; align-items:stretch; height:52px; justify-content:center; }
        .ph-nav-tab {
          font-family:'DM Mono',monospace; font-size:11px;
          letter-spacing:0.1em; padding:0 16px;
          display:flex; align-items:center; gap:6px;
          text-decoration:none; background:transparent; border:none;
          border-bottom:2px solid transparent;
          color:var(--muted2); cursor:pointer;
          transition:color 0.2s,border-color 0.2s;
          white-space:nowrap; height:52px;
        }
        .ph-nav-tab:hover  { color:var(--text); }
        .ph-nav-tab.active { color:var(--accent); border-bottom-color:var(--accent); }
        .ph-nav-badge {
          background:color-mix(in srgb,var(--accent) 18%,transparent);
          color:var(--accent); font-size:9px; padding:1px 6px; border-radius:2px;
        }

        .ph-nav-right { display:flex; align-items:center; gap:8px; justify-content:flex-end; }

        /* Theme toggle */
        .ph-theme-toggle { display:flex; align-items:center; gap:5px; }
        .ph-theme-icon   { font-size:13px; line-height:1; user-select:none; }
        .ph-theme-btn {
          width:34px; height:20px;
          background:var(--border2); border:1px solid var(--border2);
          border-radius:10px; position:relative; cursor:pointer;
          transition:background 0.25s; flex-shrink:0; padding:0;
        }
        .ph-theme-btn::after {
          content:''; position:absolute; top:2px;
          width:14px; height:14px; border-radius:50%;
          background:var(--accent); transition:left 0.2s,background 0.25s;
        }
        .ph-theme-btn.dark::after  { left:2px; }
        .ph-theme-btn.light::after { left:16px; }

        .ph-signout-btn {
          background:transparent; border:1px solid var(--border2);
          font-family:'DM Mono',monospace; font-size:10px;
          color:var(--muted2); cursor:pointer; letter-spacing:0.06em;
          padding:5px 12px; transition:all 0.2s; white-space:nowrap;
        }
        .ph-signout-btn:hover { color:var(--danger); border-color:var(--danger); }

        /* Hamburger */
        .ph-hamburger {
          display:none; flex-direction:column; gap:5px; cursor:pointer;
          background:none; border:none; padding:6px 4px; flex-shrink:0;
        }
        .ph-hamburger span {
          display:block; width:20px; height:2px;
          background:var(--text); border-radius:2px;
          transition:transform 0.22s,opacity 0.22s;
        }
        .ph-hamburger.open span:nth-child(1) { transform:rotate(45deg) translate(5px,5px); }
        .ph-hamburger.open span:nth-child(2) { opacity:0; }
        .ph-hamburger.open span:nth-child(3) { transform:rotate(-45deg) translate(5px,-5px); }

        /* Mobile drawer */
        .ph-mobile-drawer {
          display:none;
          position:fixed; top:52px; left:0; right:0; z-index:299;
          background:var(--bg2); border-bottom:1px solid var(--border);
          flex-direction:column;
          animation:phDrawerIn 0.18s ease;
          max-height:calc(100vh - 52px);
          overflow-y:auto;
        }
        .ph-mobile-drawer.open { display:flex; }
        @keyframes phDrawerIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }

        .ph-mobile-tab {
          font-family:'DM Mono',monospace; font-size:12px;
          color:var(--muted2); text-decoration:none; background:none; border:none;
          padding:14px 24px; border-bottom:1px solid var(--border);
          text-align:left; cursor:pointer; letter-spacing:0.08em;
          transition:color 0.2s,background 0.15s;
          display:flex; align-items:center; justify-content:space-between;
        }
        .ph-mobile-tab:hover  { color:var(--text); background:var(--bg3); }
        .ph-mobile-tab.active { color:var(--accent); }
        .ph-mobile-actions {
          display:flex; gap:10px; padding:16px 24px;
          flex-wrap:wrap; align-items:center;
          border-top:1px solid var(--border);
        }
        .ph-mobile-email {
          font-family:'DM Mono',monospace; font-size:11px;
          color:var(--muted2); text-decoration:none;
          padding:5px 10px; border:1px solid var(--border2);
          transition:all 0.2s; max-width:180px;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        }
        .ph-mobile-email:hover { color:var(--accent); border-color:var(--accent); }

        /* Overlay */
        .ph-drawer-overlay {
          display:none; position:fixed; inset:0; z-index:298;
          background:rgba(0,0,0,0.45); backdrop-filter:blur(2px);
        }
        .ph-drawer-overlay.open { display:block; }

        .ph-page { padding-top:52px; min-height:100vh; }

        @media(max-width:768px) {
          .ph-nav { padding:0 16px; gap:8px; }
          .ph-nav-tabs    { display:none; }
          .ph-signout-btn { display:none; }
          .ph-hamburger   { display:flex; }
          .ph-theme-toggle { gap:4px; }
        }
      `}</style>
      {children}
    </ThemeCtx.Provider>
  );
}

// ── DashboardNav ──────────────────────────────────────────────
interface DashboardNavProps {
  activeTab:    "tracker" | "analytics" | "notifications";
  notifCount?:  number;
  userEmail?:   string | null;
  onMenuClick?: () => void;   // called when mobile hamburger tapped
  mobileMenuOpen?: boolean;
}

export function DashboardNav({
  activeTab, notifCount = 0, userEmail,
  onMenuClick, mobileMenuOpen = false,
}: DashboardNavProps) {
  const { theme, toggle } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tourRun,    setTourRun]    = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  const startGuide = () => {
    setTourRun(false);
    // Small timeout lets state reset before Joyride re-mounts
    setTimeout(() => setTourRun(true), 80);
  };

  return (
    <>
      {/* Tour mounted at nav level so it works from any tab */}
      {tourRun && (
        <OnboardingTour
          forceStart
          page={activeTab === "analytics" ? "analytics" : "tracker"}
          onFinish={() => setTourRun(false)}
        />
      )}

      <nav className="ph-nav">
        {/* Logo */}
        <Link href="/" className="ph-nav-logo">
          <span className="ph-nav-logo-dot" />
          PriceHound
        </Link>

        {/* Centre tabs */}
        <div className="ph-nav-tabs">
          <Link href="/dashboard"               className={`ph-nav-tab${activeTab==="tracker"       ? " active":""}`}>TRACKER</Link>
          <Link href="/dashboard/analytics"     className={`ph-nav-tab${activeTab==="analytics"     ? " active":""}`}>ANALYTICS</Link>
          <Link href="/dashboard/notifications" className={`ph-nav-tab${activeTab==="notifications" ? " active":""}`}>
            NOTIFICATIONS {notifCount > 0 && <span className="ph-nav-badge">{notifCount}</span>}
          </Link>
        </div>

        {/* Right controls */}
        <div className="ph-nav-right">
          {/* Guide button — lives in the navbar on all dashboard pages */}
          <TourTriggerButton onClick={startGuide} />

          <div className="ph-theme-toggle">
            <span className="ph-theme-icon">{theme==="dark" ? "🌙" : "☀️"}</span>
            <button className={`ph-theme-btn ${theme}`} onClick={toggle} aria-label="Toggle theme" />
          </div>
          <form action="/auth/signout" method="POST">
            <button type="submit" className="ph-signout-btn">SIGN OUT ↪</button>
          </form>
          {/* Mobile hamburger */}
          <button
            className={`ph-hamburger${(onMenuClick ? mobileMenuOpen : drawerOpen) ? " open":""}`}
            onClick={onMenuClick ?? (() => setDrawerOpen((v) => !v))}
            aria-label="Toggle menu"
            aria-expanded={onMenuClick ? mobileMenuOpen : drawerOpen}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>

      {/* Nav mobile drawer (not used when onMenuClick is passed — sidebar handles it) */}
      {!onMenuClick && (
        <>
          <div className={`ph-drawer-overlay${drawerOpen ? " open":""}`} onClick={closeDrawer} />
          <div className={`ph-mobile-drawer${drawerOpen ? " open":""}`} role="navigation" aria-label="Mobile navigation">
            <Link href="/dashboard"               className={`ph-mobile-tab${activeTab==="tracker"       ? " active":""}`} onClick={closeDrawer}>TRACKER <span>→</span></Link>
            <Link href="/dashboard/analytics"     className={`ph-mobile-tab${activeTab==="analytics"     ? " active":""}`} onClick={closeDrawer}>ANALYTICS <span>→</span></Link>
            <Link href="/dashboard/notifications" className={`ph-mobile-tab${activeTab==="notifications" ? " active":""}`} onClick={closeDrawer}>
              NOTIFICATIONS {notifCount > 0 && <span className="ph-nav-badge">{notifCount}</span>}
            </Link>
            <Link href="/profile" className="ph-mobile-tab" onClick={closeDrawer}>PROFILE <span>→</span></Link>
            <div className="ph-mobile-actions">
              {userEmail && (
                <Link href="/profile" className="ph-mobile-email" onClick={closeDrawer}>{userEmail}</Link>
              )}
              <form action="/auth/signout" method="POST" style={{ marginLeft:"auto" }}>
                <button type="submit" style={{ background:"transparent", border:"1px solid var(--danger)", color:"var(--danger)", fontFamily:"'DM Mono',monospace", fontSize:11, padding:"6px 14px", cursor:"pointer", letterSpacing:"0.06em" }}>
                  SIGN OUT ↪
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}