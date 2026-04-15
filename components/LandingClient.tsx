"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const TICKER_ITEMS = [
  { name: "Sony WH-1000XM5",   price: "₹3,200", dir: "down" },
  { name: "Apple AirPods Pro",  price: "₹1,800", dir: "down" },
  { name: "Samsung Galaxy S24", price: "₹500",   dir: "up"   },
  { name: "LG 27\" 4K Monitor", price: "₹4,100", dir: "down" },
  { name: "Kindle Paperwhite",  price: "₹890",   dir: "down" },
  { name: "DJI Mini 3 Pro",     price: "₹2,200", dir: "up"   },
  { name: "MacBook Air M3",     price: "₹6,500", dir: "down" },
  { name: "Bose QC45",          price: "₹2,400", dir: "down" },
];

const FEATURES = [
  { num: "01", icon: "↓", title: "Price Drop Alerts",    desc: "Set your target price. The moment it's hit, you get an instant Gmail notification." },
  { num: "02", icon: "📈", title: "Price History Graphs", desc: "See the full price timeline. Know if that \"sale\" is actually a sale." },
  { num: "03", icon: "⚙",  title: "Auto Scraping",        desc: "Cron-powered scrapers run regularly. Bot-aware, flip-resistant." },
  { num: "04", icon: "🔒", title: "Gmail OAuth",          desc: "One-click Google sign-in. Your credentials never touch our servers." },
  { num: "05", icon: "📊", title: "Analytics Dashboard",  desc: "Total savings, best deals, most volatile products — your price intelligence HQ." },
  { num: "06", icon: "🌐", title: "Multi-Platform",       desc: "Amazon, Flipkart, Myntra, Reliance Digital. Paste any URL, we handle the rest." },
];

const STEPS = [
  { num: "01", title: "Sign in with Google",   desc: "OAuth via Supabase. Your Gmail is your identity and notification inbox.", active: true },
  { num: "02", title: "Paste a product URL",   desc: "Drop any link from Amazon, Flipkart, Myntra, or Reliance Digital." },
  { num: "03", title: "Set your target price", desc: "Tell us when to alert you. We check the price on a schedule." },
  { num: "04", title: "Sit back & save",       desc: "Get an email the moment the price drops. Click, buy, celebrate." },
];

const PLANS = [
  {
    name: "Free", price: "₹0", period: "forever",
    desc: "Perfect for personal use — track your wishlist and save smarter.",
    features: ["Up to 2 products", "Price checks every 24 hours", "Gmail alerts", "30-day price history", "Basic analytics"],
    cta: "GET STARTED FREE", accent: false,
  },
  {
    name: "Pro", price: "₹199", period: "per month",
    desc: "For serious shoppers who never want to miss a price drop.",
    features: ["Up to 10 products", "Price checks every hour", "Instant alerts", "Gmail + WhatsApp alerts", "Full price history", "Advanced analytics", "Priority scraping"],
    cta: "START PRO TRIAL", accent: true, badge: "MOST POPULAR",
  },
  {
    name: "Family", price: "₹349", period: "per month",
    desc: "Share PriceHound with up to 4 family members.",
    features: ["Everything in Pro", "Unlimited products", "Up to 4 members", "Shared dashboard", "Family savings report", "Dedicated support"],
    cta: "GET FAMILY PLAN", accent: false,
  },
];

const ANALYTICS_STATS = [
  { value: "₹2.4Cr+", label: "Total savings by users",      icon: "💰" },
  { value: "1.2M+",   label: "Price data points collected",  icon: "📊" },
  { value: "48,000+", label: "Products tracked",             icon: "📦" },
  { value: "99.2%",   label: "Alert delivery rate",          icon: "🔔" },
];

const PRODUCTS_PREVIEW = [
  { name: "Sony WH-1000XM5",  price: "₹24,990", drop: "↓ ₹3,200", active: true },
  { name: "Apple AirPods Pro", price: "₹19,900", drop: null },
  { name: "MacBook Air M3",    price: "₹1,09,990", drop: null },
  { name: "Kindle Paperwhite", price: "₹13,999", drop: null },
];

interface Props { isLoggedIn: boolean; userEmail: string | null; }

export default function LandingClient({ isLoggedIn, userEmail }: Props) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef   = useRef<HTMLDivElement>(null);
  const mousePos  = useRef({ x: 0, y: 0 });
  const ringPos   = useRef({ x: 0, y: 0 });
  const rafRef    = useRef<number>(0);
  const stepRefs  = useRef<(HTMLDivElement | null)[]>([]);

  const [scrolled,     setScrolled]     = useState(false);
  const [signingOut,   setSigningOut]   = useState(false);
  const [mobileOpen,   setMobileOpen]   = useState(false);
  const [theme,        setTheme]        = useState<"dark"|"light">("dark");
  const [visibleSteps, setVisibleSteps] = useState([false,false,false,false]);

  useEffect(() => {
    const saved = localStorage.getItem("ph_lp_theme") as "dark"|"light"|null;
    if (saved) setTheme(saved);
  }, []);

  const toggleTheme = () => setTheme((t) => {
    const next = t === "dark" ? "light" : "dark";
    localStorage.setItem("ph_lp_theme", next);
    return next;
  });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      if (cursorRef.current) { cursorRef.current.style.left = e.clientX + "px"; cursorRef.current.style.top = e.clientY + "px"; }
    };
    document.addEventListener("mousemove", onMove);
    const anim = () => {
      ringPos.current.x += (mousePos.current.x - ringPos.current.x) * 0.12;
      ringPos.current.y += (mousePos.current.y - ringPos.current.y) * 0.12;
      if (ringRef.current) { ringRef.current.style.left = ringPos.current.x + "px"; ringRef.current.style.top = ringPos.current.y + "px"; }
      rafRef.current = requestAnimationFrame(anim);
    };
    rafRef.current = requestAnimationFrame(anim);
    return () => { document.removeEventListener("mousemove", onMove); cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        const idx = stepRefs.current.indexOf(e.target as HTMLDivElement);
        if (idx !== -1 && e.isIntersecting) setVisibleSteps((p) => { const n=[...p]; n[idx]=true; return n; });
      }),
      { threshold: 0.2 }
    );
    stepRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await createClient().auth.signOut();
    window.location.reload();
  };

  const dark = theme === "dark";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        body { -webkit-text-size-adjust:100%; }

        :root {
          ${dark ? `
            --bg:#0a0a0a; --bg2:#111111; --bg3:#181818; --card:#141414;
            --border:rgba(255,255,255,0.08); --border2:rgba(255,255,255,0.15);
            --accent:#e8ff47; --accent-fg:#0a0a0a; --accent2:#ff6b35;
            --text:#f0ede8; --text2:#c4c0ba; --muted:#6b6b6b; --muted2:#9a9a9a;
            --success:#4ade80; --danger:#f87171;
            --nav-bg:rgba(10,10,10,0.94);
            --grid-line:rgba(255,255,255,0.055);
            --hero-stroke:rgba(240,237,232,0.22);
          ` : `
            --bg:#f0eff4; --bg2:#ffffff; --bg3:#e4e3ea; --card:#ffffff;
            --border:rgba(0,0,0,0.09); --border2:rgba(0,0,0,0.18);
            --accent:#4f46e5; --accent-fg:#ffffff; --accent2:#ea580c;
            --text:#0f0f14; --text2:#374151; --muted:#6b7280; --muted2:#4b5563;
            --success:#16a34a; --danger:#dc2626;
            --nav-bg:rgba(240,239,244,0.97);
            --grid-line:rgba(0,0,0,0.045);
            --hero-stroke:rgba(15,15,20,0.18);
          `}
        }

        html { scroll-behavior:smooth; }
        body { background:var(--bg); color:var(--text); font-family:'DM Sans',sans-serif; overflow-x:hidden; cursor:none; transition:background 0.3s,color 0.3s; }
        @media(max-width:768px){ body { cursor:auto; } }

        @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes ticker   { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
        @keyframes ulIn     { to{transform:scaleX(1)} }
        @keyframes drawerIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }

        /* Cursor */
        .lp-cursor      { position:fixed; width:10px; height:10px; background:var(--accent); border-radius:50%; pointer-events:none; z-index:9999; transform:translate(-50%,-50%); mix-blend-mode:${dark?"difference":"multiply"}; }
        .lp-cursor-ring { position:fixed; width:34px; height:34px; border:1.5px solid var(--accent); border-radius:50%; opacity:0.4; pointer-events:none; z-index:9998; transform:translate(-50%,-50%); }

        /* ═══════════════════════════════════════════
           NAVBAR — 3-col CSS Grid
           [logo 1fr] [centre links auto] [right 1fr]
           Centre is always perfectly centred.

           Desktop right: [auth buttons] [toggle-icon] [toggle] 
           Mobile  right: [toggle-icon]  [toggle]      [hamburger]
           (user pill / auth buttons hidden on mobile)
        ═══════════════════════════════════════════ */
        .lp-nav {
          position:fixed; top:0; left:0; right:0; z-index:200;
          display:grid; grid-template-columns:1fr auto 1fr;
          align-items:center; height:62px; padding:0 40px;
          border-bottom:1px solid transparent;
          transition:border-color 0.3s,background 0.3s;
        }
        .lp-nav.scrolled {
          border-bottom-color:var(--border);
          background:var(--nav-bg);
          backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
        }

        /* Col 1 */
        .lp-nav-left { display:flex; align-items:center; }
        .lp-logo { font-family:'Syne',sans-serif; font-weight:800; font-size:20px; letter-spacing:-0.5px; display:flex; align-items:center; gap:8px; color:var(--text); text-decoration:none; }
        .lp-logo:hover { opacity:0.8; }
        .lp-logo-dot { width:8px; height:8px; background:var(--accent); border-radius:50%; animation:pulse 2.5s ease-in-out infinite; flex-shrink:0; }

        /* Col 2 — centre links */
        .lp-nav-center { display:flex; align-items:center; gap:4px; }
        .lp-nav-link { font-family:'DM Mono',monospace; font-size:12px; color:var(--muted2); text-decoration:none; letter-spacing:0.04em; padding:6px 11px; transition:color 0.2s; cursor:none; }
        .lp-nav-link:hover { color:var(--text); }

        /* Col 3 — right, right-aligned
           Flex order: [pill/sign-in] [dashboard] [theme-icon] [theme-btn] [hamburger(mobile)]
           On mobile: pill, sign-in, dashboard button all disappear → only theme + hamburger remain */
        .lp-nav-right { display:flex; align-items:center; gap:8px; justify-content:flex-end; }

        /* Auth buttons */
        .lp-btn-ghost   { background:transparent; border:1px solid var(--border2); color:var(--muted2); font-family:'DM Mono',monospace; font-size:11px; font-weight:500; padding:7px 14px; cursor:none; letter-spacing:0.05em; transition:all 0.2s; text-decoration:none; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
        .lp-btn-ghost:hover { color:var(--text); border-color:var(--text); }
        .lp-btn-primary { background:var(--accent); color:var(--accent-fg); font-family:'DM Mono',monospace; font-size:11px; font-weight:500; padding:7px 14px; border:none; cursor:none; letter-spacing:0.05em; transition:opacity 0.2s,transform 0.15s; text-decoration:none; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
        .lp-btn-primary:hover { opacity:0.85; transform:translateY(-1px); }
        .lp-btn-signout { background:transparent; border:none; color:var(--muted2); font-family:'DM Mono',monospace; font-size:10px; cursor:none; padding:4px 2px; transition:color 0.2s; }
        .lp-btn-signout:hover { color:var(--danger); }

        /* User pill */
        .lp-user-pill { display:flex; align-items:center; gap:7px; background:var(--bg2); border:1px solid var(--border2); padding:4px 10px 4px 4px; text-decoration:none; transition:border-color 0.2s; }
        .lp-user-pill:hover { border-color:var(--accent); }
        .lp-user-avatar { width:22px; height:22px; border-radius:50%; background:color-mix(in srgb,var(--accent) 14%,transparent); border:1px solid color-mix(in srgb,var(--accent) 40%,transparent); display:flex; align-items:center; justify-content:center; font-family:'DM Mono',monospace; font-size:9px; font-weight:600; color:var(--accent); flex-shrink:0; }
        .lp-user-email { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted2); max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        /* Theme toggle — always visible, sits between auth and hamburger */
        .lp-theme-wrap { display:flex; align-items:center; gap:5px; flex-shrink:0; }
        .lp-theme-icon { font-size:13px; line-height:1; user-select:none; }
        .lp-theme-btn  { width:34px; height:20px; background:var(--border2); border:1px solid var(--border2); border-radius:10px; position:relative; cursor:none; flex-shrink:0; padding:0; transition:background 0.25s; }
        .lp-theme-btn::after { content:''; position:absolute; top:2px; width:14px; height:14px; border-radius:50%; background:var(--accent); transition:left 0.2s; }
        .lp-theme-btn.dark::after  { left:2px; }
        .lp-theme-btn.light::after { left:16px; }

        /* Hamburger — hidden on desktop, rightmost on mobile */
        .lp-hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:5px 3px; flex-shrink:0; }
        .lp-hamburger span { display:block; width:20px; height:2px; background:var(--text); border-radius:2px; transition:transform 0.22s,opacity 0.22s; }
        .lp-hamburger.open span:nth-child(1) { transform:rotate(45deg) translate(5px,5px); }
        .lp-hamburger.open span:nth-child(2) { opacity:0; }
        .lp-hamburger.open span:nth-child(3) { transform:rotate(-45deg) translate(5px,-5px); }

        /* Mobile drawer */
        .lp-mobile-drawer { display:none; position:fixed; top:62px; left:0; right:0; z-index:199; background:var(--bg2); border-bottom:1px solid var(--border); flex-direction:column; animation:drawerIn 0.18s ease; max-height:calc(100vh - 62px); overflow-y:auto; }
        .lp-mobile-drawer.open { display:flex; }
        .lp-mobile-link { font-family:'DM Mono',monospace; font-size:13px; color:var(--muted2); text-decoration:none; padding:14px 24px; border-bottom:1px solid var(--border); transition:color 0.2s,background 0.15s; display:flex; align-items:center; justify-content:space-between; }
        .lp-mobile-link:hover { color:var(--text); background:var(--bg3); }
        .lp-mobile-actions { display:flex; gap:10px; padding:16px 24px; flex-wrap:wrap; border-top:1px solid var(--border); }
        .lp-drawer-overlay { display:none; position:fixed; inset:0; z-index:198; background:rgba(0,0,0,0.4); backdrop-filter:blur(2px); }
        .lp-drawer-overlay.open { display:block; }

        /* ═══════════════════════════════════════════
           HERO — exactly 100dvh so it fits the viewport
           without scrolling. Uses dvh for mobile address bar.
           Ticker sits right below so user knows to scroll.
        ═══════════════════════════════════════════ */
        .lp-hero {
          height: 100dvh;           /* dynamic viewport height — accounts for mobile address bar */
          min-height: 580px;        /* floor for very small screens */
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 0 48px 32px;
          padding-top: 62px;        /* clear the fixed nav */
          position: relative;
          overflow: hidden;
        }
        .lp-hero-grid { position:absolute; inset:0; background-image:linear-gradient(var(--grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--grid-line) 1px,transparent 1px); background-size:60px 60px; mask-image:radial-gradient(ellipse 80% 70% at 50% 50%,black 30%,transparent 100%); pointer-events:none; }
        .lp-hero-glow { position:absolute; width:600px; height:600px; background:radial-gradient(circle,color-mix(in srgb,var(--accent) 7%,transparent) 0%,transparent 70%); top:10%; left:50%; transform:translateX(-50%); pointer-events:none; }
        .lp-hero-content { position:relative; z-index:2; max-width:860px; }

        .lp-hero-tag { display:inline-flex; align-items:center; gap:8px; font-family:'DM Mono',monospace; font-size:11px; color:var(--accent); border:1px solid color-mix(in srgb,var(--accent) 30%,transparent); padding:5px 12px; margin-bottom:20px; letter-spacing:0.1em; opacity:0; animation:fadeUp 0.6s 0.2s ease forwards; }
        .lp-hero-tag::before { content:''; width:6px; height:6px; background:var(--accent); border-radius:50%; }

        .lp-h1 { font-family:'Syne',sans-serif; font-weight:800; font-size:clamp(36px,5vw,72px); line-height:0.95; letter-spacing:-2.5px; margin-bottom:18px; opacity:0; animation:fadeUp 0.7s 0.35s ease forwards; color:var(--text); }
        .lp-h1-outline { display:block; color:transparent; -webkit-text-stroke:1px var(--hero-stroke); }
        .lp-h1-accent  { color:var(--accent); position:relative; display:inline-block; }
        .lp-h1-accent::after { content:''; position:absolute; bottom:4px; left:0; right:0; height:3px; background:var(--accent); transform:scaleX(0); transform-origin:left; animation:ulIn 0.5s 1.2s ease forwards; }

        .lp-hero-sub { font-size:15px; color:var(--muted2); line-height:1.6; max-width:500px; font-weight:300; margin-bottom:26px; opacity:0; animation:fadeUp 0.7s 0.5s ease forwards; }
        .lp-hero-actions { display:flex; gap:12px; align-items:center; flex-wrap:wrap; opacity:0; animation:fadeUp 0.7s 0.65s ease forwards; }
        .lp-hero-btn-lg { background:var(--accent); color:var(--accent-fg); font-family:'DM Mono',monospace; font-size:13px; font-weight:500; padding:13px 28px; border:none; cursor:none; letter-spacing:0.05em; transition:opacity 0.2s,transform 0.15s,box-shadow 0.2s; text-decoration:none; display:inline-flex; align-items:center; gap:8px; }
        .lp-hero-btn-lg:hover { opacity:0.86; transform:translateY(-2px); box-shadow:0 12px 32px color-mix(in srgb,var(--accent) 22%,transparent); }
        .lp-hero-btn-outline { background:transparent; color:var(--muted2); font-family:'DM Mono',monospace; font-size:13px; padding:13px 20px; border:1px solid var(--border2); cursor:none; letter-spacing:0.05em; transition:color 0.2s,border-color 0.2s; text-decoration:none; }
        .lp-hero-btn-outline:hover { color:var(--text); border-color:var(--text); }

        /* scroll hint */
        .lp-hero-scroll { position:absolute; bottom:28px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:6px; opacity:0; animation:fadeUp 0.6s 1.4s ease forwards; }
        .lp-hero-scroll-line { width:1px; height:32px; background:linear-gradient(var(--accent),transparent); }
        .lp-hero-scroll-text { font-family:'DM Mono',monospace; font-size:9px; color:var(--muted); letter-spacing:0.15em; }

        .lp-logged-note { display:flex; align-items:center; gap:10px; margin-top:14px; font-family:'DM Mono',monospace; font-size:11px; color:var(--muted2); }
        .lp-logged-dot  { width:6px; height:6px; background:var(--accent); border-radius:50%; }

        /* Ticker */
        .lp-ticker-wrap  { border-top:1px solid var(--border); border-bottom:1px solid var(--border); overflow:hidden; padding:13px 0; background:var(--bg2); }
        .lp-ticker-track { display:flex; animation:ticker 30s linear infinite; width:max-content; }
        .lp-ticker-item  { display:flex; align-items:center; gap:10px; padding:0 36px; font-family:'DM Mono',monospace; font-size:12px; color:var(--muted); white-space:nowrap; border-right:1px solid var(--border); }
        .lp-price-tag    { font-size:11px; padding:2px 8px; font-weight:500; }
        .lp-price-down   { background:color-mix(in srgb,var(--accent) 13%,transparent); color:var(--accent); }
        .lp-price-up     { background:color-mix(in srgb,var(--accent2) 13%,transparent); color:var(--accent2); }

        /* Sections */
        .lp-section     { padding:88px 48px; position:relative; }
        .lp-section-alt { background:var(--bg2); }
        .lp-section-label { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); letter-spacing:0.15em; text-transform:uppercase; margin-bottom:14px; }
        .lp-section-label::before { content:'// '; color:var(--accent); }
        .lp-section-title { font-family:'Syne',sans-serif; font-weight:700; font-size:clamp(26px,4vw,48px); letter-spacing:-2px; margin-bottom:48px; line-height:1.05; color:var(--text); }

        /* Features */
        .lp-features-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:var(--border); border:1px solid var(--border); }
        .lp-feature-card  { background:var(--card); padding:32px 28px; position:relative; overflow:hidden; transition:background 0.25s; }
        .lp-feature-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--accent); transform:scaleX(0); transform-origin:left; transition:transform 0.4s ease; }
        .lp-feature-card:hover { background:var(--bg3); }
        .lp-feature-card:hover::before { transform:scaleX(1); }
        .lp-feature-icon  { width:38px; height:38px; border:1px solid var(--border2); display:flex; align-items:center; justify-content:center; margin-bottom:16px; font-size:17px; }
        .lp-feature-num   { position:absolute; top:18px; right:20px; font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); letter-spacing:0.1em; }
        .lp-feature-title { font-family:'Syne',sans-serif; font-weight:700; font-size:16px; margin-bottom:10px; letter-spacing:-0.3px; color:var(--text); }
        .lp-feature-desc  { font-size:13px; color:var(--muted2); line-height:1.65; font-weight:300; }

        /* How it works */
        .lp-steps-grid { display:grid; grid-template-columns:repeat(4,1fr); position:relative; }
        .lp-steps-grid::before { content:''; position:absolute; top:28px; left:12.5%; right:12.5%; height:1px; background:linear-gradient(90deg,transparent,var(--border2) 20%,var(--border2) 80%,transparent); }
        .lp-step { padding:0 16px; display:flex; flex-direction:column; gap:14px; opacity:0; transform:translateY(20px); transition:opacity 0.6s,transform 0.6s; }
        .lp-step.visible { opacity:1; transform:translateY(0); }
        .lp-step-num { width:56px; height:56px; border:1px solid var(--border2); display:flex; align-items:center; justify-content:center; font-family:'DM Mono',monospace; font-size:13px; color:var(--muted2); background:var(--bg2); position:relative; z-index:1; }
        .lp-step.step-active .lp-step-num { border-color:var(--accent); color:var(--accent); background:color-mix(in srgb,var(--accent) 8%,transparent); }
        .lp-step-title { font-family:'Syne',sans-serif; font-weight:700; font-size:15px; color:var(--text); }
        .lp-step-desc  { font-size:13px; color:var(--muted2); line-height:1.6; font-weight:300; }

        /* Analytics stats */
        .lp-analytics-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:36px; }
        .lp-analytics-card { background:var(--card); border:1px solid var(--border); padding:24px 18px; text-align:center; transition:background 0.25s,border-color 0.25s,transform 0.2s; }
        .lp-analytics-card:hover { transform:translateY(-3px); border-color:var(--border2); }
        .lp-analytics-icon  { font-size:24px; margin-bottom:10px; display:block; }
        .lp-analytics-value { font-family:'Syne',sans-serif; font-weight:800; font-size:clamp(20px,3vw,32px); letter-spacing:-1.5px; color:var(--accent); margin-bottom:5px; }
        .lp-analytics-label { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted2); letter-spacing:0.1em; }
        .lp-analytics-desc  { font-size:14px; color:var(--muted2); line-height:1.7; max-width:560px; font-weight:300; }

        /* Pricing */
        .lp-pricing-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        .lp-pricing-card { background:var(--card); border:1px solid var(--border); padding:28px 24px; position:relative; transition:border-color 0.25s,transform 0.2s; }
        .lp-pricing-card:hover { transform:translateY(-4px); }
        .lp-pricing-card.featured { border-color:var(--accent); border-width:2px; }
        .lp-pricing-badge { position:absolute; top:-1px; left:50%; transform:translateX(-50%); background:var(--accent); color:var(--accent-fg); font-family:'DM Mono',monospace; font-size:9px; font-weight:700; padding:3px 14px; letter-spacing:0.12em; white-space:nowrap; }
        .lp-plan-name   { font-family:'Syne',sans-serif; font-weight:800; font-size:19px; letter-spacing:-0.5px; color:var(--text); margin-bottom:8px; }
        .lp-plan-price  { display:flex; align-items:baseline; gap:4px; margin-bottom:4px; }
        .lp-plan-amount { font-family:'Syne',sans-serif; font-weight:800; font-size:32px; letter-spacing:-2px; color:var(--text); }
        .lp-plan-period { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); }
        .lp-plan-desc   { font-size:13px; color:var(--muted2); margin-bottom:20px; line-height:1.6; font-weight:300; min-height:40px; }
        .lp-plan-features { list-style:none; display:flex; flex-direction:column; gap:9px; margin-bottom:24px; }
        .lp-plan-features li { display:flex; align-items:center; gap:9px; font-size:13px; color:var(--text2); }
        .lp-plan-features li::before { content:'✓'; color:var(--accent); font-weight:700; flex-shrink:0; font-family:'DM Mono',monospace; font-size:12px; }
        .lp-plan-cta { display:block; text-align:center; text-decoration:none; font-family:'DM Mono',monospace; font-size:12px; font-weight:500; padding:10px; letter-spacing:0.08em; transition:all 0.2s; border:1px solid var(--border2); color:var(--muted2); }
        .lp-plan-cta:hover { border-color:var(--text); color:var(--text); }
        .lp-plan-cta.featured-cta { background:var(--accent); color:var(--accent-fg); border:none; }
        .lp-plan-cta.featured-cta:hover { opacity:0.86; }

        /* Preview */
        .lp-preview-window { background:var(--card); border:1px solid var(--border); overflow:hidden; transform:perspective(1200px) rotateX(3deg); box-shadow:0 40px 80px color-mix(in srgb,var(--text) 8%,transparent); }
        .lp-preview-bar    { background:var(--bg3); padding:11px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px; }
        .lp-dot { width:10px; height:10px; border-radius:50%; }
        .lp-preview-content { padding:18px; display:grid; grid-template-columns:190px 1fr; gap:14px; min-height:280px; }
        .lp-preview-sidebar { background:var(--bg3); border:1px solid var(--border); padding:13px; display:flex; flex-direction:column; gap:6px; }
        .lp-sidebar-title   { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.12em; text-transform:uppercase; margin-bottom:5px; }
        .lp-product-row     { padding:8px 10px; border:1px solid transparent; }
        .lp-product-row.active { border-color:var(--border2); background:color-mix(in srgb,var(--accent) 5%,transparent); }
        .lp-product-name    { font-size:11px; font-weight:500; color:var(--text); margin-bottom:2px; }
        .lp-product-price   { font-family:'DM Mono',monospace; font-size:10px; color:var(--accent); }
        .lp-product-drop    { font-size:9px; color:var(--success); }
        .lp-preview-main    { display:flex; flex-direction:column; gap:10px; }
        .lp-preview-stats   { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .lp-stat-box { background:var(--bg3); border:1px solid var(--border); padding:10px; }
        .lp-stat-sl  { font-size:9px; color:var(--muted); font-family:'DM Mono',monospace; letter-spacing:0.1em; margin-bottom:4px; }
        .lp-stat-sv  { font-size:15px; font-weight:700; font-family:'Syne',sans-serif; color:var(--text); }
        .lp-preview-chart { background:var(--bg3); border:1px solid var(--border); padding:13px; flex:1; min-height:120px; }
        .lp-chart-label   { font-size:9px; color:var(--muted); font-family:'DM Mono',monospace; letter-spacing:0.1em; margin-bottom:8px; }

        /* CTA */
        .lp-cta { padding:108px 48px; text-align:center; position:relative; overflow:hidden; }
        .lp-cta::before { content:''; position:absolute; width:700px; height:380px; background:radial-gradient(ellipse,color-mix(in srgb,var(--accent) 7%,transparent) 0%,transparent 70%); left:50%; top:50%; transform:translate(-50%,-50%); }
        .lp-cta-h2   { font-family:'Syne',sans-serif; font-weight:800; font-size:clamp(32px,6vw,72px); letter-spacing:-3px; margin-bottom:16px; position:relative; z-index:1; color:var(--text); }
        .lp-cta-p    { font-size:15px; color:var(--muted2); margin-bottom:36px; font-weight:300; position:relative; z-index:1; }
        .lp-cta-btns { display:flex; gap:12px; align-items:center; justify-content:center; flex-wrap:wrap; position:relative; z-index:1; }

        /* Footer */
        .lp-footer { padding:28px 48px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; background:var(--bg2); }
        .lp-footer-logo  { font-family:'Syne',sans-serif; font-weight:800; font-size:16px; display:flex; align-items:center; gap:6px; color:var(--text); text-decoration:none; }
        .lp-footer-copy  { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); }
        .lp-footer-links { display:flex; gap:20px; }
        .lp-footer-links a { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); text-decoration:none; transition:color 0.2s; letter-spacing:0.05em; cursor:none; }
        .lp-footer-links a:hover { color:var(--text); }

        /* ═══ RESPONSIVE ═══ */
        @media(min-width:1400px) {
          .lp-nav { padding:0 64px; }
          .lp-hero { padding:0 64px 32px; padding-top:62px; }
          .lp-section,.lp-cta { padding:104px 64px; }
          .lp-h1 { font-size:clamp(52px,5.5vw,80px); }
        }
        @media(max-width:1100px) {
          .lp-features-grid { grid-template-columns:repeat(2,1fr); }
          .lp-pricing-grid  { grid-template-columns:1fr 1fr; }
          .lp-analytics-grid { grid-template-columns:repeat(2,1fr); }
        }
        @media(max-width:1024px) {
          .lp-pricing-grid { grid-template-columns:1fr; max-width:460px; margin:0 auto; }
          .lp-section,.lp-cta { padding:76px 36px; }
          .lp-hero { padding:0 36px 32px; padding-top:62px; }
        }
        @media(max-width:900px) {
          .lp-nav { padding:0 28px; }
          .lp-hero { padding:0 28px 32px; padding-top:62px; }
          .lp-section,.lp-cta { padding:64px 28px; }
          .lp-features-grid { grid-template-columns:1fr; }
          .lp-steps-grid { grid-template-columns:1fr 1fr; gap:32px; }
          .lp-steps-grid::before { display:none; }
          .lp-h1 { font-size:clamp(34px,7vw,60px); letter-spacing:-2px; }
          .lp-hero-sub { font-size:15px; }
        }

        /* ═══ MOBILE ≤768px ═══
           Nav right column shows ONLY: [theme-icon] [theme-btn] [hamburger]
           Auth buttons / user pill / sign-out all hidden.
           theme-wrap + hamburger stay rightmost.
        ═══ */
        @media(max-width:768px) {
          /* Switch to flex: logo left, right group flush-right.
             3-col grid misbehaves when centre col is hidden. */
          .lp-nav { padding:0 18px; height:56px; display:flex; justify-content:space-between; }
          .lp-mobile-drawer { top:56px; max-height:calc(100vh - 56px); }
          .lp-nav-center { display:none; }
          .lp-user-pill, .lp-btn-ghost, .lp-btn-primary, .lp-btn-signout { display:none !important; }
          .lp-nav-right { gap:6px; justify-content:flex-end; flex:0 0 auto; }
          .lp-hamburger { display:flex; }

          .lp-hero { height:100dvh; min-height:560px; padding:0 20px 28px; padding-top:56px; }
          .lp-h1 { font-size:clamp(32px,9vw,56px); letter-spacing:-2px; }
          .lp-hero-sub { font-size:14px; max-width:100%; }
          .lp-hero-tag { font-size:10px; padding:5px 12px; margin-bottom:16px; }
          .lp-hero-btn-lg { font-size:12px; padding:12px 22px; }
          .lp-hero-btn-outline { font-size:12px; padding:12px 16px; }

          .lp-section,.lp-cta { padding:52px 20px; }
          .lp-section-title { font-size:clamp(22px,6vw,38px); letter-spacing:-1.5px; margin-bottom:32px; }
          .lp-features-grid { grid-template-columns:1fr; }
          .lp-steps-grid    { grid-template-columns:1fr 1fr; gap:24px; }
          .lp-analytics-grid { grid-template-columns:1fr 1fr; gap:10px; margin-bottom:24px; }
          .lp-pricing-grid  { grid-template-columns:1fr; max-width:100%; }
          .lp-preview-content { grid-template-columns:1fr; }
          .lp-preview-sidebar { display:none; }
          .lp-ticker-item { padding:0 22px; font-size:11px; }
          .lp-footer { padding:22px 20px; flex-direction:column; gap:14px; text-align:center; }
          .lp-footer-links { flex-wrap:wrap; justify-content:center; gap:14px; }
          .lp-footer-copy { order:3; }
        }
        @media(max-width:480px) {
          .lp-hero { padding:0 16px 24px; padding-top:56px; }
          .lp-section,.lp-cta { padding:44px 16px; }
          .lp-h1 { font-size:clamp(28px,10vw,48px); letter-spacing:-1.5px; }
          .lp-hero-actions { flex-direction:column; align-items:stretch; }
          .lp-hero-btn-lg,.lp-hero-btn-outline { text-align:center; justify-content:center; }
          .lp-steps-grid { grid-template-columns:1fr; gap:20px; }
          .lp-analytics-grid { grid-template-columns:1fr 1fr; gap:8px; }
          .lp-preview-stats { grid-template-columns:1fr; }
          .lp-footer { padding:18px 16px; }
        }
        @media(max-width:360px) {
          .lp-h1 { font-size:28px; }
          .lp-analytics-grid { grid-template-columns:1fr; }
        }
      `}</style>

      <div className="lp-cursor"      ref={cursorRef} />
      <div className="lp-cursor-ring" ref={ringRef} />

      {/* ── NAV ── */}
      <nav className={`lp-nav${scrolled ? " scrolled":""}`}>
        {/* Col 1: Logo */}
        <div className="lp-nav-left">
          <Link href="/" className="lp-logo">
            <div className="lp-logo-dot" /> PriceHound
          </Link>
        </div>

        {/* Col 2: Centre links */}
        <div className="lp-nav-center">
          <a href="#features"  className="lp-nav-link">Features</a>
          <a href="#analytics" className="lp-nav-link">Analytics</a>
          <a href="#how"       className="lp-nav-link">How it works</a>
          <a href="#pricing"   className="lp-nav-link">Pricing</a>
          <a href="#preview"   className="lp-nav-link">Preview</a>
        </div>

        {/* Col 3: Right
            Desktop: [auth] [theme-wrap] 
            Mobile:  [theme-wrap] [hamburger]   ← theme+hamburger rightmost */}
        <div className="lp-nav-right">

          {/* Theme toggle — always visible, beside auth on desktop, leftmost of [toggle+hamburger] on mobile */}
          <div className="lp-theme-wrap">
            <span className="lp-theme-icon">{dark ? "🌙" : "☀️"}</span>
            <button className={`lp-theme-btn ${theme}`} onClick={toggleTheme} aria-label="Toggle theme" style={{ cursor:"none" }} />
          </div>

          {isLoggedIn ? (
            <>
              <Link href="/profile" className="lp-user-pill">
                <div className="lp-user-avatar">{userEmail?.[0]?.toUpperCase()}</div>
                <span className="lp-user-email">{userEmail}</span>
              </Link>
              <Link href="/dashboard" className="lp-btn-primary">DASHBOARD →</Link>
              <button className="lp-btn-signout" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? "…" : "↪"}
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="lp-btn-ghost">SIGN IN</Link>
              <Link href="/auth/login" className="lp-btn-primary">GET STARTED →</Link>
            </>
          )}

          {/* Hamburger — rightmost, mobile only */}
          <button
            className={`lp-hamburger${mobileOpen ? " open":""}`}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div className={`lp-drawer-overlay${mobileOpen ? " open":""}`} onClick={() => setMobileOpen(false)} />
      <div className={`lp-mobile-drawer${mobileOpen ? " open":""}`}>
        <a href="#features"  className="lp-mobile-link" onClick={() => setMobileOpen(false)}>Features <span>→</span></a>
        <a href="#analytics" className="lp-mobile-link" onClick={() => setMobileOpen(false)}>Analytics <span>→</span></a>
        <a href="#how"       className="lp-mobile-link" onClick={() => setMobileOpen(false)}>How it works <span>→</span></a>
        <a href="#pricing"   className="lp-mobile-link" onClick={() => setMobileOpen(false)}>Pricing <span>→</span></a>
        <a href="#preview"   className="lp-mobile-link" onClick={() => setMobileOpen(false)}>Preview <span>→</span></a>
        {isLoggedIn && <Link href="/profile" className="lp-mobile-link" onClick={() => setMobileOpen(false)}>Profile <span>→</span></Link>}
        <div className="lp-mobile-actions">
          {isLoggedIn ? (
            <>
              <Link href="/dashboard" className="lp-btn-primary" onClick={() => setMobileOpen(false)} style={{ cursor:"pointer" }}>DASHBOARD →</Link>
              <button className="lp-btn-ghost" onClick={handleSignOut} style={{ cursor:"pointer", border:"1px solid var(--danger)", color:"var(--danger)" }}>SIGN OUT ↪</button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="lp-btn-primary" onClick={() => setMobileOpen(false)} style={{ cursor:"pointer" }}>GET STARTED →</Link>
              <Link href="/auth/login" className="lp-btn-ghost"   onClick={() => setMobileOpen(false)} style={{ cursor:"pointer" }}>SIGN IN</Link>
            </>
          )}
        </div>
      </div>

      {/* ── HERO — exactly 100dvh ── */}
      <section className="lp-hero">
        <div className="lp-hero-grid" />
        <div className="lp-hero-glow" />
        <div className="lp-hero-content">
          <div className="lp-hero-tag">PRICE INTELLIGENCE PLATFORM</div>
          <h1 className="lp-h1">
            Never overpay<br />
            <span className="lp-h1-outline">for anything</span>
            <span className="lp-h1-accent"> ever.</span>
          </h1>
          <p className="lp-hero-sub">
            PriceHound watches your favourite products across Amazon, Flipkart,
            Myntra &amp; Reliance Digital — and emails you the moment prices drop.
          </p>
          <div className="lp-hero-actions">
            {isLoggedIn ? (
              <>
                <Link href="/dashboard" className="lp-hero-btn-lg">LOAD DASHBOARD →</Link>
                <button onClick={handleSignOut} disabled={signingOut} style={{ background:"transparent", color:"var(--muted2)", fontFamily:"'DM Mono',monospace", fontSize:13, padding:"13px 20px", border:"1px solid var(--border2)", cursor:"none", letterSpacing:"0.05em", transition:"color 0.2s,border-color 0.2s" }}>
                  {signingOut ? "SIGNING OUT…" : "SIGN OUT ↪"}
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="lp-hero-btn-lg">START TRACKING FREE</Link>
                <Link href="/auth/login" className="lp-hero-btn-outline">SIGN IN →</Link>
              </>
            )}
          </div>
          {isLoggedIn && (
            <div className="lp-logged-note">
              <div className="lp-logged-dot" />
              Signed in as <Link href="/profile" style={{ color:"var(--accent)", textDecoration:"none", marginLeft:4 }}>{userEmail}</Link>
            </div>
          )}
        </div>
        {/* Scroll hint */}
        <div className="lp-hero-scroll">
          <div className="lp-hero-scroll-line" />
          <div className="lp-hero-scroll-text">SCROLL</div>
        </div>
      </section>

      {/* Ticker */}
      <div className="lp-ticker-wrap">
        <div className="lp-ticker-track">
          {[...TICKER_ITEMS,...TICKER_ITEMS].map((item,i) => (
            <div className="lp-ticker-item" key={i}>
              {item.name}
              <span className={`lp-price-tag ${item.dir==="down" ? "lp-price-down":"lp-price-up"}`}>
                {item.dir==="down" ? "↓" : "↑"} {item.price}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section className="lp-section" id="features">
        <div className="lp-section-label">features</div>
        <h2 className="lp-section-title">Everything you need<br />to track smarter.</h2>
        <div className="lp-features-grid">
          {FEATURES.map((f) => (
            <div className="lp-feature-card" key={f.num}>
              <div className="lp-feature-num">{f.num}</div>
              <div className="lp-feature-icon">{f.icon}</div>
              <div className="lp-feature-title">{f.title}</div>
              <p className="lp-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Analytics */}
      <section className="lp-section lp-section-alt" id="analytics">
        <div className="lp-section-label">by the numbers</div>
        <h2 className="lp-section-title">Trusted by thousands<br />of smart shoppers.</h2>
        <div className="lp-analytics-grid">
          {ANALYTICS_STATS.map((s) => (
            <div className="lp-analytics-card" key={s.label}>
              <span className="lp-analytics-icon">{s.icon}</span>
              <div className="lp-analytics-value">{s.value}</div>
              <div className="lp-analytics-label">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="lp-analytics-desc">PriceHound helps thousands of Indian shoppers save on Amazon, Flipkart, Myntra and Reliance Digital. Our scraper runs around the clock so you never have to check manually.</p>
      </section>

      {/* How it works */}
      <section className="lp-section" id="how">
        <div className="lp-section-label">how it works</div>
        <h2 className="lp-section-title">Four steps to<br />never miss a deal.</h2>
        <div className="lp-steps-grid">
          {STEPS.map((s,i) => (
            <div key={s.num} className={`lp-step${s.active?" step-active":""}${visibleSteps[i]?" visible":""}`} style={{ transitionDelay:`${i*0.15}s` }} ref={(el) => { stepRefs.current[i]=el; }}>
              <div className="lp-step-num">{s.num}</div>
              <div className="lp-step-title">{s.title}</div>
              <p className="lp-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="lp-section lp-section-alt" id="pricing">
        <div className="lp-section-label">pricing</div>
        <h2 className="lp-section-title">Simple, transparent<br />pricing.</h2>
        <div className="lp-pricing-grid">
          {PLANS.map((plan) => (
            <div key={plan.name} className={`lp-pricing-card${plan.accent?" featured":""}`}>
              {(plan as any).badge && <div className="lp-pricing-badge">{(plan as any).badge}</div>}
              <div className="lp-plan-name" style={{ marginTop:(plan as any).badge ? 14 : 0 }}>{plan.name}</div>
              <div className="lp-plan-price">
                <span className="lp-plan-amount">{plan.price}</span>
                <span className="lp-plan-period">/{plan.period}</span>
              </div>
              <p className="lp-plan-desc">{plan.desc}</p>
              <ul className="lp-plan-features">{plan.features.map((f) => <li key={f}>{f}</li>)}</ul>
              <Link href="/auth/login" className={`lp-plan-cta${plan.accent?" featured-cta":""}`} style={{ cursor:"none" }}>{plan.cta}</Link>
            </div>
          ))}
        </div>
      </section>

      {/* Preview */}
      <section className="lp-section" id="preview">
        <div className="lp-section-label">product preview</div>
        <h2 className="lp-section-title">Your dashboard,<br />beautifully simple.</h2>
        <div className="lp-preview-window">
          <div className="lp-preview-bar">
            <div className="lp-dot" style={{ background:"#ff5f57" }} />
            <div className="lp-dot" style={{ background:"#ffbd2e" }} />
            <div className="lp-dot" style={{ background:"#28c840" }} />
            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"var(--muted)", marginLeft:12 }}>pricehound.app/dashboard</span>
          </div>
          <div className="lp-preview-content">
            <div className="lp-preview-sidebar">
              <div className="lp-sidebar-title">Tracked Products</div>
              {PRODUCTS_PREVIEW.map((p) => (
                <div className={`lp-product-row${p.active?" active":""}`} key={p.name}>
                  <div className="lp-product-name">{p.name}</div>
                  <div className="lp-product-price">{p.price} {p.drop && <span className="lp-product-drop">{p.drop}</span>}</div>
                </div>
              ))}
            </div>
            <div className="lp-preview-main">
              <div className="lp-preview-stats">
                <div className="lp-stat-box"><div className="lp-stat-sl">CURRENT PRICE</div><div className="lp-stat-sv" style={{ color:"var(--accent)" }}>₹24,990</div></div>
                <div className="lp-stat-box"><div className="lp-stat-sl">YOUR TARGET</div><div className="lp-stat-sv">₹22,000</div></div>
                <div className="lp-stat-box"><div className="lp-stat-sl">ALL-TIME LOW</div><div className="lp-stat-sv" style={{ color:"var(--success)" }}>₹21,490</div></div>
              </div>
              <div className="lp-preview-chart">
                <div className="lp-chart-label">PRICE HISTORY — LAST 30 DAYS</div>
                <svg viewBox="0 0 500 120" preserveAspectRatio="none" style={{ width:"100%", height:80 }}>
                  <defs><linearGradient id="lpg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
                  <path d="M0,60 L45,70 L95,80 L145,60 L195,55 L245,50 L295,48 L345,42 L395,30 L445,32 L500,22" fill="none" stroke="var(--accent)" strokeWidth="2" />
                  <path d="M0,60 L45,70 L95,80 L145,60 L195,55 L245,50 L295,48 L345,42 L395,30 L445,32 L500,22 L500,120 L0,120 Z" fill="url(#lpg)" />
                  <line x1="0" y1="45" x2="500" y2="45" stroke="var(--accent2)" strokeWidth="1" strokeDasharray="6,4" opacity="0.6" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-cta">
        <h2 className="lp-cta-h2">{isLoggedIn ? "Ready to hunt\nbetter prices?" : "Ready to start\nsaving?"}</h2>
        <p className="lp-cta-p">{isLoggedIn ? "Your dashboard is waiting." : "Sign in with Google and start tracking in under 60 seconds."}</p>
        <div className="lp-cta-btns">
          {isLoggedIn
            ? <Link href="/dashboard" className="lp-hero-btn-lg">LOAD DASHBOARD →</Link>
            : <><Link href="/auth/login" className="lp-hero-btn-lg">SIGN UP FREE →</Link><Link href="/auth/login" className="lp-hero-btn-outline">SIGN IN</Link></>
          }
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <Link href="/" className="lp-footer-logo"><div className="lp-logo-dot" /> PriceHound</Link>
        <span className="lp-footer-copy">© {new Date().getFullYear()} PriceHound. All rights reserved.</span>
        <div className="lp-footer-links">
          <Link href="/privacy">Privacy</Link>
          {isLoggedIn ? <Link href="/profile">Profile</Link> : <Link href="/auth/login">Sign In</Link>}
          <Link href="/dashboard">Dashboard</Link>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </footer>
    </>
  );
}