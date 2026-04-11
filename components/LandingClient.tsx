"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ── Data ──────────────────────────────────────────────────────
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
  { num: "01", icon: "↓", title: "Price Drop Alerts",    desc: "Set your target price. The moment it's hit, you get an instant Gmail notification — before stock runs out." },
  { num: "02", icon: "📈", title: "Price History Graphs", desc: "See the full price timeline of every product you track. Know if that \"sale\" is actually a sale." },
  { num: "03", icon: "⚙",  title: "Auto Scraping",        desc: "Cron-powered scrapers check prices every 4 hours. Flip-resistant and bot-aware." },
  { num: "04", icon: "🔒", title: "Gmail OAuth",          desc: "One-click sign in with Google. Your credentials never touch our servers." },
  { num: "05", icon: "📊", title: "Analytics Dashboard",  desc: "Total savings, best deals, most volatile products — your personal price intelligence HQ." },
  { num: "06", icon: "🌐", title: "Multi-Platform",       desc: "Amazon, Flipkart, Myntra and more. Paste any product URL and we handle the rest." },
];

const STEPS = [
  { num: "01", title: "Sign in with Google",   desc: "OAuth via Supabase. Your Gmail is your identity and your notification inbox.", active: true },
  { num: "02", title: "Paste a product URL",   desc: "Drop any e-commerce link from Amazon, Flipkart, or Myntra into your dashboard." },
  { num: "03", title: "Set your target price", desc: "Tell us when to alert you. We'll check the price on a schedule automatically." },
  { num: "04", title: "Sit back & save",       desc: "Get an email the moment the price drops. Click, buy, celebrate." },
];

const PLANS = [
  {
    name: "Free",
    price: "₹0",
    period: "forever",
    desc: "Perfect for personal use — track your wishlist and save smarter.",
    features: ["Up to 5 products", "Price checks every 4 hours", "Gmail alerts", "30-day price history", "Basic analytics"],
    cta: "GET STARTED FREE",
    accent: false,
  },
  {
    name: "Pro",
    price: "₹199",
    period: "per month",
    desc: "For serious shoppers and deal hunters who never want to miss a price drop.",
    features: ["Unlimited products", "Price checks every hour", "Instant alerts", "Full price history", "Advanced analytics", "Priority scraping", "Export data (CSV)"],
    cta: "START PRO TRIAL",
    accent: true,
    badge: "MOST POPULAR",
  },
  {
    name: "Family",
    price: "₹349",
    period: "per month",
    desc: "Share PriceHound with up to 4 family members under one plan.",
    features: ["Everything in Pro", "Up to 4 members", "Shared dashboard", "Family savings report", "Dedicated support"],
    cta: "GET FAMILY PLAN",
    accent: false,
  },
];

const ANALYTICS_STATS = [
  { value: "₹2.4Cr+",  label: "Total savings by users",    icon: "💰" },
  { value: "1.2M+",    label: "Price data points collected", icon: "📊" },
  { value: "48,000+",  label: "Products tracked",           icon: "📦" },
  { value: "99.2%",    label: "Alert delivery rate",        icon: "🔔" },
];

const PRODUCTS_PREVIEW = [
  { name: "Sony WH-1000XM5",  price: "₹24,990", drop: "↓ ₹3,200", active: true },
  { name: "Apple AirPods Pro", price: "₹19,900", drop: null },
  { name: "MacBook Air M3",    price: "₹1,09,990", drop: null },
  { name: "Kindle Paperwhite", price: "₹13,999", drop: null },
];

interface Props {
  isLoggedIn: boolean;
  userEmail:  string | null;
}

export default function LandingClient({ isLoggedIn, userEmail }: Props) {
  const cursorRef  = useRef<HTMLDivElement>(null);
  const ringRef    = useRef<HTMLDivElement>(null);
  const mousePos   = useRef({ x: 0, y: 0 });
  const ringPos    = useRef({ x: 0, y: 0 });
  const rafRef     = useRef<number>(0);
  const stepRefs   = useRef<(HTMLDivElement | null)[]>([]);

  const [scrolled,      setScrolled]      = useState(false);
  const [signingOut,    setSigningOut]    = useState(false);
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [theme,         setTheme]         = useState<"dark"|"light">("dark");
  const [visibleSteps,  setVisibleSteps]  = useState([false,false,false,false]);

  // ── Theme persistence ─────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("ph_lp_theme") as "dark"|"light"|null;
    if (saved) setTheme(saved);
  }, []);

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("ph_lp_theme", next);
      return next;
    });
  };

  // ── Cursor (desktop only) ─────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      if (cursorRef.current) {
        cursorRef.current.style.left = e.clientX + "px";
        cursorRef.current.style.top  = e.clientY + "px";
      }
    };
    document.addEventListener("mousemove", onMove);
    const animRing = () => {
      ringPos.current.x += (mousePos.current.x - ringPos.current.x) * 0.12;
      ringPos.current.y += (mousePos.current.y - ringPos.current.y) * 0.12;
      if (ringRef.current) {
        ringRef.current.style.left = ringPos.current.x + "px";
        ringRef.current.style.top  = ringPos.current.y + "px";
      }
      rafRef.current = requestAnimationFrame(animRing);
    };
    rafRef.current = requestAnimationFrame(animRing);
    return () => { document.removeEventListener("mousemove", onMove); cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── Scroll ────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // ── Step reveal ───────────────────────────────────────────
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        const idx = stepRefs.current.indexOf(e.target as HTMLDivElement);
        if (idx !== -1 && e.isIntersecting)
          setVisibleSteps((p) => { const n=[...p]; n[idx]=true; return n; });
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

  // ── CSS variables per theme ───────────────────────────────
  const dark = theme === "dark";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

        :root {
          ${dark ? `
            --bg:#0a0a0a; --bg2:#111111; --bg3:#181818; --card:#141414;
            --border:rgba(255,255,255,0.08); --border2:rgba(255,255,255,0.14);
            --accent:#e8ff47; --accent-txt:#0a0a0a; --accent2:#ff6b35;
            --text:#f0ede8; --text2:#c8c4be; --muted:#6b6b6b; --muted2:#9a9a9a;
            --success:#6ee7b7; --danger:#f87171;
            --nav-bg:rgba(10,10,10,0.9);
            --hero-stroke:rgba(240,237,232,0.25);
            --grid-line:rgba(255,255,255,0.06);
          ` : `
            --bg:#f7f6f2; --bg2:#ffffff; --bg3:#eeecea; --card:#ffffff;
            --border:rgba(0,0,0,0.09); --border2:rgba(0,0,0,0.16);
            --accent:#4a7400; --accent-txt:#ffffff; --accent2:#c4430a;
            --text:#1a1a1a; --text2:#3d3d3d; --muted:#888; --muted2:#555;
            --success:#0a6640; --danger:#c0392b;
            --nav-bg:rgba(247,246,242,0.94);
            --hero-stroke:rgba(26,26,26,0.2);
            --grid-line:rgba(0,0,0,0.04);
          `}
        }

        html { scroll-behavior:smooth; }
        body {
          background:var(--bg); color:var(--text);
          font-family:'DM Sans',sans-serif; overflow-x:hidden;
          cursor:none; transition:background 0.3s,color 0.3s;
        }
        @media(max-width:768px){ body { cursor:auto; } }

        @keyframes pulse    { 0%,100%{box-shadow:0 0 0 0 rgba(74,116,0,0.4)} 50%{box-shadow:0 0 0 8px rgba(74,116,0,0)} }
        @keyframes ticker   { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:none} }
        @keyframes ulIn     { to{transform:scaleX(1)} }
        @keyframes spinAnim { to{transform:rotate(360deg)} }
        @keyframes slideDown{ from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }

        /* ── Custom cursor ── */
        .lp-cursor {
          position:fixed; width:10px; height:10px; background:var(--accent);
          border-radius:50%; pointer-events:none; z-index:9999;
          transform:translate(-50%,-50%); transition:transform 0.15s;
          mix-blend-mode:${dark ? "difference" : "multiply"};
        }
        .lp-cursor-ring {
          position:fixed; width:36px; height:36px;
          border:1.5px solid var(--accent); border-radius:50%; opacity:0.5;
          pointer-events:none; z-index:9998; transform:translate(-50%,-50%);
        }

        /* ── NAVBAR — CSS Grid for perfect centering ── */
        .lp-nav {
          position:fixed; top:0; left:0; right:0; z-index:200;
          /* 3-column grid: left | center | right */
          display:grid;
          grid-template-columns:1fr auto 1fr;
          align-items:center;
          padding:0 48px;
          height:64px;
          border-bottom:1px solid transparent;
          transition:border-color 0.3s, background 0.3s, backdrop-filter 0.3s;
        }
        .lp-nav.scrolled {
          border-bottom-color:var(--border);
          background:var(--nav-bg);
          backdrop-filter:blur(16px);
          -webkit-backdrop-filter:blur(16px);
        }

        /* Left column — logo */
        .lp-nav-left { display:flex; align-items:center; }
        .lp-logo {
          font-family:'Syne',sans-serif; font-weight:800; font-size:20px;
          letter-spacing:-0.5px; display:flex; align-items:center; gap:8px;
          color:var(--text); text-decoration:none; transition:opacity 0.2s;
        }
        .lp-logo:hover { opacity:0.8; }
        .lp-logo-dot { width:8px; height:8px; background:var(--accent); border-radius:50%; flex-shrink:0; animation:pulse 2s ease-in-out infinite; }

        /* Center column — nav links */
        .lp-nav-center { display:flex; align-items:center; gap:8px; }
        .lp-nav-link {
          font-family:'DM Mono',monospace; font-size:12px; color:var(--muted2);
          text-decoration:none; letter-spacing:0.04em; padding:6px 12px;
          transition:color 0.2s; cursor:none; border-radius:2px;
          white-space:nowrap;
        }
        .lp-nav-link:hover { color:var(--text); }

        /* Right column — actions */
        .lp-nav-right {
          display:flex; align-items:center; gap:8px; justify-content:flex-end;
        }

        /* Theme toggle */
        .lp-theme-btn {
          width:36px; height:22px; background:var(--border2);
          border:1px solid var(--border2); border-radius:11px;
          position:relative; cursor:none; flex-shrink:0; padding:0;
          transition:background 0.25s;
        }
        .lp-theme-btn::after {
          content:''; position:absolute; top:3px;
          width:14px; height:14px; border-radius:50%;
          background:var(--accent); transition:left 0.2s;
        }
        .lp-theme-btn.dark::after  { left:3px; }
        .lp-theme-btn.light::after { left:17px; }
        .lp-theme-icon { font-size:13px; line-height:1; user-select:none; }

        /* Nav buttons */
        .lp-btn-ghost {
          background:transparent; border:1px solid var(--border2); color:var(--muted2);
          font-family:'DM Mono',monospace; font-size:11px; font-weight:500;
          padding:8px 16px; cursor:none; letter-spacing:0.05em;
          transition:all 0.2s; text-decoration:none;
          display:inline-flex; align-items:center; gap:6px; white-space:nowrap;
        }
        .lp-btn-ghost:hover { color:var(--text); border-color:var(--text); }
        .lp-btn-primary {
          background:var(--accent); color:var(--accent-txt);
          font-family:'DM Mono',monospace; font-size:11px; font-weight:500;
          padding:8px 16px; border:none; cursor:none; letter-spacing:0.05em;
          transition:opacity 0.2s, transform 0.15s;
          text-decoration:none; display:inline-flex; align-items:center; gap:6px; white-space:nowrap;
        }
        .lp-btn-primary:hover { opacity:0.85; transform:translateY(-1px); }

        /* User pill — clickable link to profile */
        .lp-user-pill {
          display:flex; align-items:center; gap:8px;
          background:var(--bg2); border:1px solid var(--border2);
          padding:4px 10px 4px 5px; text-decoration:none;
          transition:border-color 0.2s;
        }
        .lp-user-pill:hover { border-color:var(--accent); }
        .lp-user-avatar {
          width:22px; height:22px; border-radius:50%;
          background:color-mix(in srgb, var(--accent) 15%, transparent);
          border:1px solid var(--accent);
          display:flex; align-items:center; justify-content:center;
          font-family:'DM Mono',monospace; font-size:9px; font-weight:600; color:var(--accent);
        }
        .lp-user-email { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted2); max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .lp-btn-signout {
          background:transparent; border:none; color:var(--muted2);
          font-family:'DM Mono',monospace; font-size:10px; cursor:none;
          padding:4px 2px; letter-spacing:0.06em; transition:color 0.2s;
        }
        .lp-btn-signout:hover { color:var(--danger); }

        /* ── Mobile hamburger ── */
        .lp-hamburger {
          display:none; flex-direction:column; gap:5px; cursor:pointer;
          background:none; border:none; padding:4px;
        }
        .lp-hamburger span {
          display:block; width:22px; height:2px; background:var(--text);
          border-radius:2px; transition:transform 0.2s, opacity 0.2s;
        }
        .lp-hamburger.open span:nth-child(1) { transform:rotate(45deg) translate(5px,5px); }
        .lp-hamburger.open span:nth-child(2) { opacity:0; }
        .lp-hamburger.open span:nth-child(3) { transform:rotate(-45deg) translate(5px,-5px); }

        /* ── Mobile nav drawer ── */
        .lp-mobile-nav {
          display:none; position:fixed; top:64px; left:0; right:0; z-index:199;
          background:var(--bg2); border-bottom:1px solid var(--border);
          padding:16px 24px 24px; animation:slideDown 0.2s ease;
          flex-direction:column; gap:4px;
        }
        .lp-mobile-nav.open { display:flex; }
        .lp-mobile-link {
          font-family:'DM Mono',monospace; font-size:13px; color:var(--muted2);
          text-decoration:none; padding:12px 0;
          border-bottom:1px solid var(--border); letter-spacing:0.06em;
          transition:color 0.2s;
        }
        .lp-mobile-link:hover { color:var(--text); }
        .lp-mobile-actions { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; }

        /* ── Sections ── */
        .lp-hero {
          min-height:100vh; display:flex; align-items:center;
          padding:128px 48px 80px; position:relative; overflow:hidden;
        }
        .lp-hero-grid {
          position:absolute; inset:0; opacity:1;
          background-image:
            linear-gradient(var(--grid-line) 1px,transparent 1px),
            linear-gradient(90deg,var(--grid-line) 1px,transparent 1px);
          background-size:60px 60px;
          mask-image:radial-gradient(ellipse 80% 70% at 50% 50%,black 30%,transparent 100%);
        }
        .lp-hero-glow  { position:absolute; width:600px; height:600px; background:radial-gradient(circle,${dark ? "rgba(232,255,71,0.06)" : "rgba(74,116,0,0.06)"} 0%,transparent 70%); top:10%; left:50%; transform:translateX(-50%); pointer-events:none; }
        .lp-hero-content { position:relative; z-index:2; max-width:900px; }

        .lp-hero-tag {
          display:inline-flex; align-items:center; gap:8px;
          font-family:'DM Mono',monospace; font-size:11px; color:var(--accent);
          border:1px solid color-mix(in srgb, var(--accent) 30%, transparent);
          padding:6px 14px; margin-bottom:40px; letter-spacing:0.1em;
          opacity:0; animation:fadeUp 0.6s 0.2s ease forwards;
        }
        .lp-hero-tag::before { content:''; width:6px; height:6px; background:var(--accent); border-radius:50%; }

        .lp-h1 {
          font-family:'Syne',sans-serif; font-weight:800;
          font-size:clamp(48px,7vw,92px); line-height:0.95;
          letter-spacing:-3px; margin-bottom:32px;
          opacity:0; animation:fadeUp 0.7s 0.35s ease forwards; color:var(--text);
        }
        .lp-h1-outline { display:block; color:transparent; -webkit-text-stroke:1px var(--hero-stroke); }
        .lp-h1-accent  { color:var(--accent); position:relative; display:inline-block; }
        .lp-h1-accent::after {
          content:''; position:absolute; bottom:4px; left:0; right:0; height:3px;
          background:var(--accent); transform:scaleX(0); transform-origin:left;
          animation:ulIn 0.5s 1.2s ease forwards;
        }
        .lp-hero-sub {
          font-size:17px; color:var(--muted2); line-height:1.7;
          max-width:520px; font-weight:300; margin-bottom:48px;
          opacity:0; animation:fadeUp 0.7s 0.5s ease forwards;
        }
        .lp-hero-actions {
          display:flex; gap:14px; align-items:center; flex-wrap:wrap;
          opacity:0; animation:fadeUp 0.7s 0.65s ease forwards;
        }
        .lp-hero-btn-lg {
          background:var(--accent); color:var(--accent-txt);
          font-family:'DM Mono',monospace; font-size:13px; font-weight:500;
          padding:14px 32px; border:none; cursor:none; letter-spacing:0.05em;
          transition:opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          text-decoration:none; display:inline-flex; align-items:center; gap:8px;
        }
        .lp-hero-btn-lg:hover { opacity:0.85; transform:translateY(-2px); box-shadow:0 12px 32px color-mix(in srgb, var(--accent) 25%, transparent); }
        .lp-hero-btn-outline {
          background:transparent; color:var(--muted2);
          font-family:'DM Mono',monospace; font-size:13px;
          padding:14px 24px; border:1px solid var(--border2); cursor:none;
          letter-spacing:0.05em; transition:color 0.2s,border-color 0.2s; text-decoration:none;
        }
        .lp-hero-btn-outline:hover { color:var(--text); border-color:var(--text); }

        .lp-logged-note {
          display:flex; align-items:center; gap:10px; margin-top:16px;
          font-family:'DM Mono',monospace; font-size:11px; color:var(--muted2);
        }
        .lp-logged-dot { width:6px; height:6px; background:var(--accent); border-radius:50%; }

        /* ── Ticker ── */
        .lp-ticker-wrap { border-top:1px solid var(--border); border-bottom:1px solid var(--border); overflow:hidden; padding:14px 0; background:var(--bg2); }
        .lp-ticker-track { display:flex; animation:ticker 30s linear infinite; width:max-content; }
        .lp-ticker-item  { display:flex; align-items:center; gap:10px; padding:0 40px; font-family:'DM Mono',monospace; font-size:12px; color:var(--muted); white-space:nowrap; border-right:1px solid var(--border); }
        .lp-price-tag    { font-size:11px; padding:2px 8px; font-weight:500; }
        .lp-price-down   { background:color-mix(in srgb,var(--accent) 12%,transparent); color:var(--accent); }
        .lp-price-up     { background:color-mix(in srgb,var(--accent2) 12%,transparent); color:var(--accent2); }

        /* ── Section wrappers ── */
        .lp-section     { padding:100px 48px; position:relative; }
        .lp-section-alt { background:var(--bg2); }
        .lp-section-label { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); letter-spacing:0.15em; text-transform:uppercase; margin-bottom:16px; }
        .lp-section-label::before { content:'// '; color:var(--accent); }
        .lp-section-title { font-family:'Syne',sans-serif; font-weight:700; font-size:clamp(30px,4vw,50px); letter-spacing:-2px; margin-bottom:56px; line-height:1.05; color:var(--text); }

        /* ── Features ── */
        .lp-features-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:var(--border); border:1px solid var(--border); }
        .lp-feature-card  { background:var(--card); padding:36px 32px; position:relative; overflow:hidden; transition:background 0.25s; }
        .lp-feature-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--accent); transform:scaleX(0); transform-origin:left; transition:transform 0.4s ease; }
        .lp-feature-card:hover { background:var(--bg3); }
        .lp-feature-card:hover::before { transform:scaleX(1); }
        .lp-feature-icon  { width:40px; height:40px; border:1px solid var(--border2); display:flex; align-items:center; justify-content:center; margin-bottom:20px; font-size:18px; }
        .lp-feature-num   { position:absolute; top:20px; right:24px; font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); letter-spacing:0.1em; }
        .lp-feature-title { font-family:'Syne',sans-serif; font-weight:700; font-size:17px; margin-bottom:10px; letter-spacing:-0.3px; color:var(--text); }
        .lp-feature-desc  { font-size:13px; color:var(--muted2); line-height:1.65; font-weight:300; }

        /* ── How it works ── */
        .lp-steps-grid { display:grid; grid-template-columns:repeat(4,1fr); position:relative; }
        .lp-steps-grid::before { content:''; position:absolute; top:28px; left:12.5%; right:12.5%; height:1px; background:linear-gradient(90deg,transparent,var(--border2) 20%,var(--border2) 80%,transparent); }
        .lp-step { padding:0 20px; display:flex; flex-direction:column; gap:18px; opacity:0; transform:translateY(20px); transition:opacity 0.6s,transform 0.6s; }
        .lp-step.visible { opacity:1; transform:translateY(0); }
        .lp-step-num { width:56px; height:56px; border:1px solid var(--border2); display:flex; align-items:center; justify-content:center; font-family:'DM Mono',monospace; font-size:13px; font-weight:500; color:var(--muted2); background:var(--bg2); position:relative; z-index:1; transition:all 0.25s; }
        .lp-step.step-active .lp-step-num { border-color:var(--accent); color:var(--accent); background:color-mix(in srgb,var(--accent) 8%,transparent); }
        .lp-step-title { font-family:'Syne',sans-serif; font-weight:700; font-size:15px; letter-spacing:-0.3px; color:var(--text); }
        .lp-step-desc  { font-size:13px; color:var(--muted2); line-height:1.6; font-weight:300; }

        /* ── Analytics section ── */
        .lp-analytics-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:48px; }
        .lp-analytics-card {
          background:var(--card); border:1px solid var(--border);
          padding:28px 24px; text-align:center; position:relative; overflow:hidden;
          transition:background 0.25s, border-color 0.25s, transform 0.2s;
        }
        .lp-analytics-card:hover { transform:translateY(-3px); border-color:var(--border2); }
        .lp-analytics-icon  { font-size:28px; margin-bottom:12px; display:block; }
        .lp-analytics-value { font-family:'Syne',sans-serif; font-weight:800; font-size:clamp(24px,3vw,36px); letter-spacing:-1.5px; color:var(--accent); margin-bottom:6px; }
        .lp-analytics-label { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted2); letter-spacing:0.1em; }
        .lp-analytics-desc { font-size:14px; color:var(--muted2); line-height:1.7; max-width:600px; font-weight:300; }

        /* ── Preview mockup ── */
        .lp-preview-window { background:var(--card); border:1px solid var(--border); overflow:hidden; position:relative; transform:perspective(1200px) rotateX(3deg); box-shadow:0 40px 80px ${dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)"},0 0 0 1px var(--border); }
        .lp-preview-bar    { background:var(--bg3); padding:12px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px; }
        .lp-dot { width:10px; height:10px; border-radius:50%; }
        .lp-preview-content { padding:24px; display:grid; grid-template-columns:200px 1fr; gap:16px; min-height:320px; }
        .lp-preview-sidebar { background:var(--bg3); border:1px solid var(--border); padding:14px; display:flex; flex-direction:column; gap:8px; }
        .lp-sidebar-title { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.12em; text-transform:uppercase; margin-bottom:6px; }
        .lp-product-row { padding:8px 10px; border:1px solid transparent; transition:all 0.2s; }
        .lp-product-row.active { border-color:var(--border2); background:color-mix(in srgb,var(--accent) 4%,transparent); }
        .lp-product-name  { font-size:11px; font-weight:500; color:var(--text); margin-bottom:2px; }
        .lp-product-price { font-family:'DM Mono',monospace; font-size:10px; color:var(--accent); }
        .lp-product-drop  { font-size:9px; color:var(--success); }
        .lp-preview-main  { display:flex; flex-direction:column; gap:12px; }
        .lp-preview-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .lp-stat-box { background:var(--bg3); border:1px solid var(--border); padding:12px; }
        .lp-stat-sl  { font-size:9px; color:var(--muted); font-family:'DM Mono',monospace; letter-spacing:0.1em; margin-bottom:4px; }
        .lp-stat-sv  { font-size:16px; font-weight:700; font-family:'Syne',sans-serif; color:var(--text); }
        .lp-preview-chart { background:var(--bg3); border:1px solid var(--border); padding:14px; flex:1; min-height:140px; }
        .lp-chart-label   { font-size:9px; color:var(--muted); font-family:'DM Mono',monospace; letter-spacing:0.1em; margin-bottom:10px; }

        /* ── Pricing ── */
        .lp-pricing-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        .lp-pricing-card {
          background:var(--card); border:1px solid var(--border);
          padding:32px 28px; position:relative; transition:border-color 0.25s, transform 0.2s;
        }
        .lp-pricing-card:hover { transform:translateY(-4px); }
        .lp-pricing-card.featured { border-color:var(--accent); border-width:2px; }
        .lp-pricing-badge {
          position:absolute; top:-1px; left:50%; transform:translateX(-50%);
          background:var(--accent); color:var(--accent-txt);
          font-family:'DM Mono',monospace; font-size:9px; font-weight:700;
          padding:3px 14px; letter-spacing:0.12em; white-space:nowrap;
        }
        .lp-plan-name  { font-family:'Syne',sans-serif; font-weight:800; font-size:20px; letter-spacing:-0.5px; color:var(--text); margin-bottom:8px; }
        .lp-plan-price { display:flex; align-items:baseline; gap:4px; margin-bottom:4px; }
        .lp-plan-amount { font-family:'Syne',sans-serif; font-weight:800; font-size:36px; letter-spacing:-2px; color:var(--text); }
        .lp-plan-period { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); }
        .lp-plan-desc  { font-size:13px; color:var(--muted2); margin-bottom:24px; line-height:1.6; font-weight:300; min-height:48px; }
        .lp-plan-features { list-style:none; display:flex; flex-direction:column; gap:10px; margin-bottom:28px; }
        .lp-plan-features li {
          display:flex; align-items:center; gap:10px;
          font-size:13px; color:var(--text2);
        }
        .lp-plan-features li::before { content:'✓'; color:var(--accent); font-weight:700; flex-shrink:0; font-family:'DM Mono',monospace; font-size:12px; }
        .lp-plan-cta {
          display:block; text-align:center; text-decoration:none;
          font-family:'DM Mono',monospace; font-size:12px; font-weight:500;
          padding:12px; letter-spacing:0.08em; transition:all 0.2s;
          border:1px solid var(--border2); color:var(--muted2);
        }
        .lp-plan-cta:hover { border-color:var(--text); color:var(--text); }
        .lp-plan-cta.featured-cta {
          background:var(--accent); color:var(--accent-txt); border:none;
        }
        .lp-plan-cta.featured-cta:hover { opacity:0.85; }

        /* ── CTA ── */
        .lp-cta { padding:120px 48px; text-align:center; position:relative; overflow:hidden; }
        .lp-cta::before { content:''; position:absolute; width:800px; height:400px; background:radial-gradient(ellipse,color-mix(in srgb,var(--accent) 6%,transparent) 0%,transparent 70%); left:50%; top:50%; transform:translate(-50%,-50%); }
        .lp-cta-h2 { font-family:'Syne',sans-serif; font-weight:800; font-size:clamp(36px,6vw,76px); letter-spacing:-3px; margin-bottom:20px; position:relative; z-index:1; color:var(--text); }
        .lp-cta-p  { font-size:16px; color:var(--muted2); margin-bottom:44px; font-weight:300; position:relative; z-index:1; }
        .lp-cta-btns { display:flex; gap:12px; align-items:center; justify-content:center; flex-wrap:wrap; position:relative; z-index:1; }

        /* ── Footer ── */
        .lp-footer { padding:32px 48px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; background:var(--bg2); }
        .lp-footer-logo  { font-family:'Syne',sans-serif; font-weight:800; font-size:16px; display:flex; align-items:center; gap:6px; color:var(--text); text-decoration:none; }
        .lp-footer-copy  { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); }
        .lp-footer-links { display:flex; gap:24px; }
        .lp-footer-links a { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); text-decoration:none; transition:color 0.2s; letter-spacing:0.05em; cursor:none; }
        .lp-footer-links a:hover { color:var(--text); }

        /* ── Responsive ── */
        @media(max-width:1024px) {
          .lp-pricing-grid  { grid-template-columns:1fr; max-width:420px; margin:0 auto; }
          .lp-analytics-grid { grid-template-columns:repeat(2,1fr); }
        }
        @media(max-width:768px) {
          .lp-nav { padding:0 20px; height:56px; grid-template-columns:1fr auto 1fr; }
          .lp-nav-center { display:none; }
          .lp-nav-right .lp-btn-ghost,
          .lp-nav-right .lp-btn-primary,
          .lp-nav-right .lp-btn-signout,
          .lp-nav-right .lp-user-email { display:none; }
          .lp-nav-right { gap:4px; }
          .lp-hamburger { display:flex; }
          .lp-mobile-nav { top:56px; }

          .lp-hero { padding:90px 20px 60px; }
          .lp-section, .lp-cta { padding:64px 20px; }
          .lp-features-grid { grid-template-columns:1fr; }
          .lp-steps-grid { grid-template-columns:1fr 1fr; gap:36px; }
          .lp-steps-grid::before { display:none; }
          .lp-analytics-grid { grid-template-columns:repeat(2,1fr); gap:12px; }
          .lp-preview-content { grid-template-columns:1fr; }
          .lp-preview-sidebar { display:none; }
          .lp-footer { padding:24px 20px; flex-direction:column; gap:16px; text-align:center; }
          .lp-footer-links { flex-wrap:wrap; justify-content:center; }
        }
        @media(max-width:480px) {
          .lp-steps-grid { grid-template-columns:1fr; }
          .lp-analytics-grid { grid-template-columns:repeat(2,1fr); }
        }
      `}</style>

      {/* Custom cursor */}
      <div className="lp-cursor"      ref={cursorRef} />
      <div className="lp-cursor-ring" ref={ringRef} />

      {/* ── NAVBAR ── CSS Grid: left | center | right ── */}
      <nav className={`lp-nav${scrolled ? " scrolled" : ""}`}>

        {/* Left — Logo */}
        <div className="lp-nav-left">
          <Link href="/" className="lp-logo">
            <div className="lp-logo-dot" />
            PriceHound
          </Link>
        </div>

        {/* Centre — Nav links (always centred via grid) */}
        <div className="lp-nav-center">
          <a href="#features" className="lp-nav-link">Features</a>
          <a href="#analytics" className="lp-nav-link">Analytics</a>
          <a href="#how"      className="lp-nav-link">How it works</a>
          <a href="#pricing"  className="lp-nav-link">Pricing</a>
          <a href="#preview"  className="lp-nav-link">Preview</a>
        </div>

        {/* Right — Actions */}
        <div className="lp-nav-right">
          {/* Theme toggle */}
          <span className="lp-theme-icon">{dark ? "🌙" : "☀️"}</span>
          <button className={`lp-theme-btn ${theme}`} onClick={toggleTheme} aria-label="Toggle theme" />

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

          {/* Hamburger — mobile only */}
          <button
            className={`lp-hamburger${mobileOpen ? " open" : ""}`}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>

      {/* ── Mobile nav drawer ── */}
      <div className={`lp-mobile-nav${mobileOpen ? " open" : ""}`}>
        <a href="#features"  className="lp-mobile-link" onClick={() => setMobileOpen(false)}>Features</a>
        <a href="#analytics" className="lp-mobile-link" onClick={() => setMobileOpen(false)}>Analytics</a>
        <a href="#how"       className="lp-mobile-link" onClick={() => setMobileOpen(false)}>How it works</a>
        <a href="#pricing"   className="lp-mobile-link" onClick={() => setMobileOpen(false)}>Pricing</a>
        <a href="#preview"   className="lp-mobile-link" onClick={() => setMobileOpen(false)}>Preview</a>
        <div className="lp-mobile-actions">
          {isLoggedIn ? (
            <>
              <Link href="/dashboard" className="lp-btn-primary" onClick={() => setMobileOpen(false)}>DASHBOARD →</Link>
              <Link href="/profile"   className="lp-btn-ghost"   onClick={() => setMobileOpen(false)}>PROFILE</Link>
              <button className="lp-btn-ghost" onClick={handleSignOut}>SIGN OUT ↪</button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="lp-btn-primary" onClick={() => setMobileOpen(false)}>GET STARTED →</Link>
              <Link href="/auth/login" className="lp-btn-ghost"   onClick={() => setMobileOpen(false)}>SIGN IN</Link>
            </>
          )}
        </div>
      </div>

      {/* ── Hero ── */}
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
            PriceHound watches your favourite products 24/7 and hits your inbox
            the moment prices drop below your target.
          </p>
          <div className="lp-hero-actions">
            {isLoggedIn ? (
              <>
                <Link href="/dashboard" className="lp-hero-btn-lg">LOAD DASHBOARD →</Link>
                <button
                  className="lp-hero-btn-outline"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  style={{ cursor: "none", fontFamily: "'DM Mono',monospace", fontSize: 13, border: "1px solid var(--border2)", color: "var(--muted2)", background: "transparent", padding: "14px 24px" }}
                >
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
              Signed in as <Link href="/profile" style={{ color: "var(--accent)", textDecoration: "none", marginLeft: 4 }}>{userEmail}</Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Ticker ── */}
      <div className="lp-ticker-wrap">
        <div className="lp-ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <div className="lp-ticker-item" key={i}>
              {item.name}
              <span className={`lp-price-tag ${item.dir === "down" ? "lp-price-down" : "lp-price-up"}`}>
                {item.dir === "down" ? "↓" : "↑"} {item.price}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
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

      {/* ── Analytics section ── */}
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
        <p className="lp-analytics-desc">
          PriceHound has helped thousands of users across India save on Amazon, Flipkart, and Myntra.
          Our real-time price tracker runs 24/7 so you never have to.
        </p>
      </section>

      {/* ── How it works ── */}
      <section className="lp-section" id="how">
        <div className="lp-section-label">how it works</div>
        <h2 className="lp-section-title">Four steps to<br />never miss a deal.</h2>
        <div className="lp-steps-grid">
          {STEPS.map((s, i) => (
            <div
              key={s.num}
              className={`lp-step${s.active ? " step-active" : ""}${visibleSteps[i] ? " visible" : ""}`}
              style={{ transitionDelay: `${i * 0.15}s` }}
              ref={(el) => { stepRefs.current[i] = el; }}
            >
              <div className="lp-step-num">{s.num}</div>
              <div className="lp-step-title">{s.title}</div>
              <p className="lp-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="lp-section lp-section-alt" id="pricing">
        <div className="lp-section-label">pricing</div>
        <h2 className="lp-section-title">Simple, transparent<br />pricing.</h2>
        <div className="lp-pricing-grid">
          {PLANS.map((plan) => (
            <div key={plan.name} className={`lp-pricing-card${plan.accent ? " featured" : ""}`}>
              {plan.badge && <div className="lp-pricing-badge">{plan.badge}</div>}
              <div className="lp-plan-name" style={{ marginTop: plan.badge ? 16 : 0 }}>{plan.name}</div>
              <div className="lp-plan-price">
                <span className="lp-plan-amount">{plan.price}</span>
                <span className="lp-plan-period">/{plan.period}</span>
              </div>
              <p className="lp-plan-desc">{plan.desc}</p>
              <ul className="lp-plan-features">
                {plan.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <Link href="/auth/login" className={`lp-plan-cta${plan.accent ? " featured-cta" : ""}`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Dashboard Preview ── */}
      <section className="lp-section" id="preview">
        <div className="lp-section-label">product preview</div>
        <h2 className="lp-section-title">Your dashboard,<br />beautifully simple.</h2>
        <div className="lp-preview-window">
          <div className="lp-preview-bar">
            <div className="lp-dot" style={{ background: "#ff5f57" }} />
            <div className="lp-dot" style={{ background: "#ffbd2e" }} />
            <div className="lp-dot" style={{ background: "#28c840" }} />
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--muted)", marginLeft: 12 }}>
              pricehound.app/dashboard
            </span>
          </div>
          <div className="lp-preview-content">
            <div className="lp-preview-sidebar">
              <div className="lp-sidebar-title">Tracked Products</div>
              {PRODUCTS_PREVIEW.map((p) => (
                <div className={`lp-product-row${p.active ? " active" : ""}`} key={p.name}>
                  <div className="lp-product-name">{p.name}</div>
                  <div className="lp-product-price">{p.price} {p.drop && <span className="lp-product-drop">{p.drop}</span>}</div>
                </div>
              ))}
            </div>
            <div className="lp-preview-main">
              <div className="lp-preview-stats">
                <div className="lp-stat-box"><div className="lp-stat-sl">CURRENT PRICE</div><div className="lp-stat-sv" style={{ color: "var(--accent)" }}>₹24,990</div></div>
                <div className="lp-stat-box"><div className="lp-stat-sl">YOUR TARGET</div><div className="lp-stat-sv">₹22,000</div></div>
                <div className="lp-stat-box"><div className="lp-stat-sl">ALL-TIME LOW</div><div className="lp-stat-sv" style={{ color: "var(--success)" }}>₹21,490</div></div>
              </div>
              <div className="lp-preview-chart">
                <div className="lp-chart-label">PRICE HISTORY — LAST 30 DAYS</div>
                <svg viewBox="0 0 500 120" preserveAspectRatio="none" style={{ width: "100%", height: 90 }}>
                  <defs>
                    <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,60 L45,70 L95,80 L145,60 L195,55 L245,50 L295,48 L345,42 L395,30 L445,32 L500,22" fill="none" stroke="var(--accent)" strokeWidth="2" />
                  <path d="M0,60 L45,70 L95,80 L145,60 L195,55 L245,50 L295,48 L345,42 L395,30 L445,32 L500,22 L500,120 L0,120 Z" fill="url(#cg2)" />
                  <line x1="0" y1="45" x2="500" y2="45" stroke="var(--accent2)" strokeWidth="1" strokeDasharray="6,4" opacity="0.6" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta">
        <h2 className="lp-cta-h2">{isLoggedIn ? "Ready to hunt\nbetter prices?" : "Ready to start\nsaving?"}</h2>
        <p className="lp-cta-p">
          {isLoggedIn
            ? "Your dashboard is waiting. Track products and get alerted the moment prices drop."
            : "Sign in with Google and start tracking in under 60 seconds. No credit card required."}
        </p>
        <div className="lp-cta-btns">
          {isLoggedIn ? (
            <Link href="/dashboard" className="lp-hero-btn-lg">LOAD DASHBOARD →</Link>
          ) : (
            <>
              <Link href="/auth/login" className="lp-hero-btn-lg">SIGN UP FREE →</Link>
              <Link href="/auth/login" className="lp-hero-btn-outline">SIGN IN</Link>
            </>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <Link href="/" className="lp-footer-logo">
          <div className="lp-logo-dot" />
          PriceHound
        </Link>
        <span className="lp-footer-copy">© {new Date().getFullYear()} PriceHound. All rights reserved.</span>
        <div className="lp-footer-links">
          <Link href="/privacy">Privacy</Link>
          {isLoggedIn
            ? <Link href="/profile">Profile</Link>
            : <Link href="/auth/login">Sign In</Link>
          }
          <Link href="/dashboard">Dashboard</Link>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </footer>
    </>
  );
}