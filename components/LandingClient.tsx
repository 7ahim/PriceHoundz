"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const TICKER_ITEMS = [
  { name: "Sony WH-1000XM5",  price: "₹3,200", dir: "down" },
  { name: "Apple AirPods Pro", price: "₹1,800", dir: "down" },
  { name: "Samsung Galaxy S24",price: "₹500",   dir: "up"   },
  { name: "LG 27\" 4K Monitor",price: "₹4,100", dir: "down" },
  { name: "Kindle Paperwhite", price: "₹890",   dir: "down" },
  { name: "DJI Mini 3 Pro",    price: "₹2,200", dir: "up"   },
  { name: "MacBook Air M3",    price: "₹6,500", dir: "down" },
  { name: "Bose QC45",         price: "₹2,400", dir: "down" },
];

const FEATURES = [
  { num: "01", icon: "↓", title: "Price Drop Alerts",   desc: "Set your target price. The moment it's hit, you get an instant Gmail notification — before stock runs out." },
  { num: "02", icon: "📈", title: "Price History Graphs", desc: "See the full price timeline of every product you track. Know if that \"sale\" is actually a sale." },
  { num: "03", icon: "⚙",  title: "Auto Scraping",       desc: "Cron-powered scrapers check prices every 4 hours. Flip-resistant and bot-aware." },
  { num: "04", icon: "🔒", title: "Gmail OAuth",         desc: "One-click sign in with Google. Your credentials never touch our servers." },
  { num: "05", icon: "📊", title: "Analytics Dashboard", desc: "Total savings, best deals, most volatile products — your personal price intelligence HQ." },
  { num: "06", icon: "🌐", title: "Multi-Platform",      desc: "Amazon, Flipkart, Myntra and more. Paste any product URL and we handle the rest." },
];

const STEPS = [
  { num: "01", title: "Sign in with Google",   desc: "OAuth via Supabase. Your Gmail is your identity and your notification inbox.", active: true },
  { num: "02", title: "Paste a product URL",   desc: "Drop any e-commerce link from Amazon, Flipkart, or Myntra into your dashboard." },
  { num: "03", title: "Set your target price", desc: "Tell us when to alert you. We'll check the price on a schedule automatically." },
  { num: "04", title: "Sit back & save",       desc: "Get an email the moment the price drops. Click, buy, celebrate." },
];

const PRODUCTS = [
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
  const cursorRef    = useRef<HTMLDivElement>(null);
  const ringRef      = useRef<HTMLDivElement>(null);
  const mousePos     = useRef({ x: 0, y: 0 });
  const ringPos      = useRef({ x: 0, y: 0 });
  const rafRef       = useRef<number>(0);
  const [scrolled,   setScrolled]   = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState<boolean[]>([false, false, false, false]);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Cursor ────────────────────────────────────────────────
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
    return () => {
      document.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onEnter = () => {
    if (cursorRef.current) cursorRef.current.style.transform = "translate(-50%,-50%) scale(2.5)";
    if (ringRef.current)   ringRef.current.style.transform   = "translate(-50%,-50%) scale(1.3)";
  };
  const onLeave = () => {
    if (cursorRef.current) cursorRef.current.style.transform = "translate(-50%,-50%) scale(1)";
    if (ringRef.current)   ringRef.current.style.transform   = "translate(-50%,-50%) scale(1)";
  };

  // ── Scroll nav ────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Step reveal ───────────────────────────────────────────
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        const idx = stepRefs.current.indexOf(e.target as HTMLDivElement);
        if (idx !== -1 && e.isIntersecting)
          setVisibleSteps((p) => { const n = [...p]; n[idx] = true; return n; });
      }),
      { threshold: 0.2 }
    );
    stepRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // ── Sign out ──────────────────────────────────────────────
  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        :root {
          --bg:#0a0a0a; --bg2:#111111; --bg3:#181818;
          --border:rgba(255,255,255,0.08); --border2:rgba(255,255,255,0.14);
          --accent:#e8ff47; --accent2:#ff6b35;
          --text:#f0ede8; --muted:#6b6b6b; --muted2:#9a9a9a; --card:#141414;
        }
        html { scroll-behavior:smooth; }
        body { background:var(--bg); color:var(--text); font-family:'DM Sans',sans-serif; overflow-x:hidden; cursor:none; }

        body::before {
          content:''; position:fixed; inset:0; pointer-events:none; z-index:1000; opacity:0.6;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
        }

        @keyframes pulse       { 0%,100%{box-shadow:0 0 0 0 rgba(232,255,71,0.4)} 50%{box-shadow:0 0 0 8px rgba(232,255,71,0)} }
        @keyframes ticker      { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes fadeUp      { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes underlineIn { to{transform:scaleX(1)} }
        @keyframes spin        { to{transform:rotate(360deg)} }

        /* ── Cursor ── */
        .lp-cursor {
          position:fixed; width:10px; height:10px; background:var(--accent);
          border-radius:50%; pointer-events:none; z-index:9999;
          transform:translate(-50%,-50%);
          transition:transform 0.15s, width 0.2s, height 0.2s;
          mix-blend-mode:difference;
        }
        .lp-cursor-ring {
          position:fixed; width:36px; height:36px;
          border:1px solid rgba(232,255,71,0.5); border-radius:50%;
          pointer-events:none; z-index:9998;
          transform:translate(-50%,-50%); transition:transform 0.2s;
        }

        /* ── Nav ── */
        .lp-nav {
          position:fixed; top:0; left:0; right:0; z-index:100;
          display:flex; align-items:center; justify-content:space-between;
          padding:20px 48px;
          border-bottom:1px solid transparent;
          transition:border-color 0.3s, background 0.3s, backdrop-filter 0.3s;
        }
        .lp-nav.scrolled {
          border-bottom-color:var(--border);
          background:rgba(10,10,10,0.85);
          backdrop-filter:blur(12px);
        }
        .lp-logo {
          font-family:'Syne',sans-serif; font-weight:800; font-size:22px;
          letter-spacing:-0.5px; display:flex; align-items:center; gap:8px;
          color:var(--text); text-decoration:none;
        }
        .lp-logo-dot { width:8px; height:8px; background:var(--accent); border-radius:50%; animation:pulse 2s ease-in-out infinite; }
        .lp-nav-links { display:flex; gap:32px; }
        .lp-nav-links a {
          font-size:13px; font-weight:500; color:var(--muted2);
          text-decoration:none; letter-spacing:0.02em; transition:color 0.2s;
          font-family:'DM Mono',monospace; cursor:none;
        }
        .lp-nav-links a:hover { color:var(--text); }
        .lp-nav-right { display:flex; align-items:center; gap:10px; }

        /* ── Nav buttons ── */
        .lp-btn-ghost {
          background:transparent; border:1px solid var(--border2);
          color:var(--muted2); font-family:'DM Mono',monospace;
          font-size:11px; font-weight:500; padding:8px 18px;
          cursor:none; letter-spacing:0.05em;
          transition:all 0.2s; text-decoration:none;
          display:inline-flex; align-items:center; gap:6px;
        }
        .lp-btn-ghost:hover { color:var(--text); border-color:rgba(255,255,255,0.3); }
        .lp-btn-primary {
          background:var(--accent); color:#0a0a0a;
          font-family:'DM Mono',monospace; font-size:11px; font-weight:500;
          padding:8px 18px; border:none; cursor:none; letter-spacing:0.05em;
          transition:background 0.2s, transform 0.15s;
          text-decoration:none; display:inline-flex; align-items:center; gap:6px;
        }
        .lp-btn-primary:hover { background:#d4eb30; transform:translateY(-1px); }
        .lp-btn-danger {
          background:transparent; border:1px solid rgba(248,113,113,0.3);
          color:#f87171; font-family:'DM Mono',monospace;
          font-size:11px; padding:8px 14px; cursor:none; letter-spacing:0.05em;
          transition:all 0.2s;
        }
        .lp-btn-danger:hover { background:rgba(248,113,113,0.08); border-color:#f87171; }
        .lp-btn-danger:disabled { opacity:0.5; cursor:not-allowed; }

        /* ── User pill ── */
        .lp-user-pill {
          display:flex; align-items:center; gap:8px;
          background:var(--bg2); border:1px solid var(--border2);
          padding:5px 12px 5px 6px;
        }
        .lp-user-avatar {
          width:22px; height:22px; border-radius:50%;
          background:rgba(232,255,71,0.15); border:1px solid rgba(232,255,71,0.3);
          display:flex; align-items:center; justify-content:center;
          font-family:'DM Mono',monospace; font-size:9px; font-weight:500; color:var(--accent);
        }
        .lp-user-email { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted2); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        /* ── Hero ── */
        .lp-hero {
          min-height:100vh; display:flex; align-items:center;
          padding:120px 48px 80px; position:relative; overflow:hidden;
        }
        .lp-hero-grid {
          position:absolute; inset:0; opacity:0.5;
          background-image:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px);
          background-size:60px 60px;
          mask-image:radial-gradient(ellipse 80% 70% at 50% 50%,black 40%,transparent 100%);
        }
        .lp-hero-glow  { position:absolute; width:600px; height:600px; background:radial-gradient(circle,rgba(232,255,71,0.06) 0%,transparent 70%); top:10%; left:50%; transform:translateX(-50%); pointer-events:none; }
        .lp-hero-glow2 { position:absolute; width:400px; height:400px; background:radial-gradient(circle,rgba(255,107,53,0.05) 0%,transparent 70%); bottom:10%; right:10%; pointer-events:none; }
        .lp-hero-content { position:relative; z-index:2; max-width:900px; }
        .lp-hero-tag {
          display:inline-flex; align-items:center; gap:8px;
          font-family:'DM Mono',monospace; font-size:11px; color:var(--accent);
          border:1px solid rgba(232,255,71,0.25); padding:6px 14px;
          margin-bottom:40px; letter-spacing:0.1em;
          opacity:0; animation:fadeUp 0.6s 0.2s ease forwards;
        }
        .lp-hero-tag::before { content:''; width:6px; height:6px; background:var(--accent); border-radius:50%; }
        .lp-h1 {
          font-family:'Syne',sans-serif; font-weight:800;
          font-size:clamp(52px,7vw,96px); line-height:0.95;
          letter-spacing:-3px; margin-bottom:32px;
          opacity:0; animation:fadeUp 0.7s 0.35s ease forwards;
        }
        .lp-h1-outline { display:block; color:transparent; -webkit-text-stroke:1px rgba(240,237,232,0.35); }
        .lp-h1-accent  { color:var(--accent); position:relative; display:inline-block; }
        .lp-h1-accent::after {
          content:''; position:absolute; bottom:4px; left:0; right:0; height:3px;
          background:var(--accent); transform:scaleX(0); transform-origin:left;
          animation:underlineIn 0.5s 1.2s ease forwards;
        }
        .lp-hero-sub {
          font-size:17px; color:var(--muted2); line-height:1.65;
          max-width:500px; font-weight:300; margin-bottom:48px;
          opacity:0; animation:fadeUp 0.7s 0.5s ease forwards;
        }
        .lp-hero-actions {
          display:flex; gap:16px; align-items:center; flex-wrap:wrap;
          opacity:0; animation:fadeUp 0.7s 0.65s ease forwards;
        }
        .lp-hero-btn-lg {
          background:var(--accent); color:#0a0a0a;
          font-family:'DM Mono',monospace; font-size:13px; font-weight:500;
          padding:14px 32px; border:none; cursor:none; letter-spacing:0.05em;
          transition:background 0.2s, transform 0.15s, box-shadow 0.2s;
          text-decoration:none; display:inline-flex; align-items:center; gap:8px;
        }
        .lp-hero-btn-lg:hover { transform:translateY(-2px); box-shadow:0 12px 32px rgba(232,255,71,0.25); background:#d4eb30; }
        .lp-hero-btn-outline {
          background:transparent; color:var(--muted2);
          font-family:'DM Mono',monospace; font-size:13px;
          padding:14px 24px; border:1px solid var(--border2);
          cursor:none; letter-spacing:0.05em;
          transition:color 0.2s, border-color 0.2s; text-decoration:none;
        }
        .lp-hero-btn-outline:hover { color:var(--text); border-color:rgba(255,255,255,0.3); }
        .lp-hero-btn-danger {
          background:transparent; color:#f87171;
          font-family:'DM Mono',monospace; font-size:13px;
          padding:14px 20px; border:1px solid rgba(248,113,113,0.3);
          cursor:none; letter-spacing:0.05em;
          transition:all 0.2s; display:inline-flex; align-items:center; gap:6px;
        }
        .lp-hero-btn-danger:hover { background:rgba(248,113,113,0.06); border-color:#f87171; }

        /* ── Logged in hero note ── */
        .lp-logged-note {
          display:flex; align-items:center; gap:10px;
          font-family:'DM Mono',monospace; font-size:11px; color:var(--muted2);
          margin-top:16px;
        }
        .lp-logged-note-dot { width:6px; height:6px; background:var(--accent); border-radius:50%; }

        /* ── Ticker ── */
        .lp-ticker-wrap { border-top:1px solid var(--border); border-bottom:1px solid var(--border); overflow:hidden; padding:14px 0; background:var(--bg2); position:relative; z-index:2; }
        .lp-ticker-track { display:flex; animation:ticker 28s linear infinite; width:max-content; }
        .lp-ticker-item  { display:flex; align-items:center; gap:10px; padding:0 40px; font-family:'DM Mono',monospace; font-size:12px; color:var(--muted); white-space:nowrap; border-right:1px solid var(--border); }
        .lp-price-tag    { font-size:11px; padding:2px 8px; font-weight:500; }
        .lp-price-down   { background:rgba(232,255,71,0.12); color:var(--accent); }
        .lp-price-up     { background:rgba(255,107,53,0.12); color:var(--accent2); }

        /* ── Sections ── */
        .lp-section     { padding:100px 48px; position:relative; }
        .lp-section-bg2 { background:var(--bg2); }
        .lp-section-label { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); letter-spacing:0.15em; text-transform:uppercase; margin-bottom:16px; }
        .lp-section-label::before { content:'// '; color:var(--accent); }
        .lp-section-title { font-family:'Syne',sans-serif; font-weight:700; font-size:clamp(32px,4vw,52px); letter-spacing:-2px; margin-bottom:64px; line-height:1.05; }

        /* ── Features grid ── */
        .lp-features-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:var(--border); border:1px solid var(--border); }
        .lp-feature-card { background:var(--card); padding:40px 36px; position:relative; overflow:hidden; transition:background 0.3s; }
        .lp-feature-card::before { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:var(--accent); transform:scaleX(0); transform-origin:left; transition:transform 0.4s ease; }
        .lp-feature-card:hover { background:var(--bg3); }
        .lp-feature-card:hover::before { transform:scaleX(1); }
        .lp-feature-icon  { width:40px; height:40px; border:1px solid var(--border2); display:flex; align-items:center; justify-content:center; margin-bottom:24px; font-size:18px; color:var(--accent); }
        .lp-feature-num   { position:absolute; top:24px; right:28px; font-family:'DM Mono',monospace; font-size:11px; color:var(--border2); letter-spacing:0.1em; }
        .lp-feature-title { font-family:'Syne',sans-serif; font-weight:700; font-size:18px; margin-bottom:12px; letter-spacing:-0.5px; }
        .lp-feature-desc  { font-size:14px; color:var(--muted2); line-height:1.65; font-weight:300; }

        /* ── Steps ── */
        .lp-steps-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:0; position:relative; }
        .lp-steps-grid::before { content:''; position:absolute; top:28px; left:12.5%; right:12.5%; height:1px; background:linear-gradient(90deg,transparent,var(--border2) 20%,var(--border2) 80%,transparent); }
        .lp-step { padding:0 24px; display:flex; flex-direction:column; gap:20px; opacity:0; transform:translateY(20px); transition:opacity 0.6s, transform 0.6s; }
        .lp-step.visible { opacity:1; transform:translateY(0); }
        .lp-step-num { width:56px; height:56px; border:1px solid var(--border2); display:flex; align-items:center; justify-content:center; font-family:'DM Mono',monospace; font-size:13px; font-weight:500; color:var(--muted2); background:var(--bg2); position:relative; z-index:1; }
        .lp-step.step-active .lp-step-num { border-color:var(--accent); color:var(--accent); background:rgba(232,255,71,0.05); }
        .lp-step-title { font-family:'Syne',sans-serif; font-weight:700; font-size:16px; letter-spacing:-0.3px; color:var(--text); }
        .lp-step-desc  { font-size:13px; color:var(--muted2); line-height:1.6; font-weight:300; }

        /* ── Preview ── */
        .lp-preview-window { background:var(--card); border:1px solid var(--border); overflow:hidden; position:relative; transform:perspective(1200px) rotateX(3deg); box-shadow:0 60px 120px rgba(0,0,0,0.6),0 0 0 1px var(--border); }
        .lp-preview-bar { background:var(--bg3); padding:12px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px; }
        .lp-dot { width:10px; height:10px; border-radius:50%; }
        .lp-preview-content { padding:24px; display:grid; grid-template-columns:220px 1fr; gap:16px; min-height:360px; }
        .lp-preview-sidebar { background:var(--bg3); border:1px solid var(--border); padding:16px; display:flex; flex-direction:column; gap:10px; }
        .lp-sidebar-title { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.12em; text-transform:uppercase; margin-bottom:8px; }
        .lp-product-row { padding:10px 12px; border:1px solid transparent; cursor:none; transition:all 0.2s; }
        .lp-product-row.active { border-color:var(--border2); background:rgba(255,255,255,0.03); }
        .lp-product-name  { font-size:11px; font-weight:500; color:var(--text); margin-bottom:3px; }
        .lp-product-price { font-family:'DM Mono',monospace; font-size:11px; color:var(--accent); }
        .lp-product-drop  { font-size:10px; color:#6ee7b7; }
        .lp-preview-main  { display:flex; flex-direction:column; gap:14px; }
        .lp-preview-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
        .lp-stat-box { background:var(--bg3); border:1px solid var(--border); padding:14px 16px; }
        .lp-stat-sl  { font-size:10px; color:var(--muted); font-family:'DM Mono',monospace; letter-spacing:0.1em; margin-bottom:6px; }
        .lp-stat-sv  { font-size:18px; font-weight:700; font-family:'Syne',sans-serif; }
        .lp-preview-chart { background:var(--bg3); border:1px solid var(--border); padding:16px; flex:1; min-height:160px; }
        .lp-chart-label   { font-size:10px; color:var(--muted); font-family:'DM Mono',monospace; letter-spacing:0.1em; margin-bottom:12px; }

        /* ── CTA ── */
        .lp-cta-section { padding:120px 48px; text-align:center; position:relative; overflow:hidden; }
        .lp-cta-section::before { content:''; position:absolute; width:800px; height:400px; background:radial-gradient(ellipse,rgba(232,255,71,0.05) 0%,transparent 70%); left:50%; top:50%; transform:translate(-50%,-50%); }
        .lp-cta-h2 { font-family:'Syne',sans-serif; font-weight:800; font-size:clamp(40px,6vw,80px); letter-spacing:-3px; margin-bottom:24px; position:relative; z-index:1; color:var(--text); }
        .lp-cta-p  { font-size:16px; color:var(--muted2); margin-bottom:48px; font-weight:300; position:relative; z-index:1; }
        .lp-cta-actions { display:flex; gap:12px; align-items:center; justify-content:center; flex-wrap:wrap; position:relative; z-index:1; }

        /* ── Footer ── */
        .lp-footer { padding:32px 48px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
        .lp-footer-logo  { font-family:'Syne',sans-serif; font-weight:800; font-size:16px; display:flex; align-items:center; gap:6px; color:var(--text); text-decoration:none; }
        .lp-footer-copy  { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); }
        .lp-footer-links { display:flex; gap:24px; }
        .lp-footer-links a { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); text-decoration:none; transition:color 0.2s; letter-spacing:0.05em; cursor:none; }
        .lp-footer-links a:hover { color:var(--text); }

        @media(max-width:900px) {
          .lp-nav { padding:18px 24px; }
          .lp-nav-links { display:none; }
          .lp-hero { padding:100px 24px 60px; }
          .lp-section, .lp-cta-section { padding:72px 24px; }
          .lp-features-grid { grid-template-columns:1fr; }
          .lp-steps-grid    { grid-template-columns:1fr 1fr; gap:40px; }
          .lp-steps-grid::before { display:none; }
          .lp-footer { padding:24px; flex-direction:column; gap:16px; text-align:center; }
          .lp-preview-content { grid-template-columns:1fr; }
          .lp-preview-sidebar { display:none; }
          .lp-user-email { display:none; }
        }
      `}</style>

      {/* Cursor */}
      <div className="lp-cursor"      ref={cursorRef} />
      <div className="lp-cursor-ring" ref={ringRef} />

      {/* ── Nav ── */}
      <nav className={`lp-nav${scrolled ? " scrolled" : ""}`}>
        <Link href="/" className="lp-logo" onMouseEnter={onEnter} onMouseLeave={onLeave}>
          <div className="lp-logo-dot" />
          PriceHound
        </Link>

        <div className="lp-nav-links">
          <a href="#features" onMouseEnter={onEnter} onMouseLeave={onLeave}>Features</a>
          <a href="#how"      onMouseEnter={onEnter} onMouseLeave={onLeave}>How it works</a>
          <a href="#preview"  onMouseEnter={onEnter} onMouseLeave={onLeave}>Preview</a>
        </div>

        <div className="lp-nav-right">
          {isLoggedIn ? (
            <>
              {/* User pill */}
              {userEmail && (
                <div className="lp-user-pill">
                  <div className="lp-user-avatar">
                    {userEmail[0].toUpperCase()}
                  </div>
                  <span className="lp-user-email">{userEmail}</span>
                </div>
              )}
              <Link
                href="/dashboard"
                className="lp-btn-primary"
                onMouseEnter={onEnter} onMouseLeave={onLeave}
              >
                LOAD DASHBOARD →
              </Link>
              <button
                className="lp-btn-danger"
                onClick={handleSignOut}
                disabled={signingOut}
                onMouseEnter={onEnter} onMouseLeave={onLeave}
              >
                {signingOut ? (
                  <span style={{ width:10,height:10,border:"2px solid rgba(248,113,113,0.3)",borderTopColor:"#f87171",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite" }} />
                ) : "↪"} {signingOut ? "" : "SIGN OUT"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="lp-btn-ghost"
                onMouseEnter={onEnter} onMouseLeave={onLeave}
              >
                SIGN IN
              </Link>
              <Link
                href="/auth/login"
                className="lp-btn-primary"
                onMouseEnter={onEnter} onMouseLeave={onLeave}
              >
                GET STARTED →
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero-grid" />
        <div className="lp-hero-glow" />
        <div className="lp-hero-glow2" />
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
                <Link
                  href="/dashboard"
                  className="lp-hero-btn-lg"
                  onMouseEnter={onEnter} onMouseLeave={onLeave}
                >
                  LOAD DASHBOARD →
                </Link>
                <button
                  className="lp-hero-btn-danger"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  onMouseEnter={onEnter} onMouseLeave={onLeave}
                >
                  {signingOut
                    ? <span style={{ width:12,height:12,border:"2px solid rgba(248,113,113,0.3)",borderTopColor:"#f87171",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite" }} />
                    : "↪"
                  }
                  {signingOut ? "SIGNING OUT…" : "SIGN OUT"}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="lp-hero-btn-lg"
                  onMouseEnter={onEnter} onMouseLeave={onLeave}
                >
                  START TRACKING FREE
                </Link>
                <Link
                  href="/auth/login"
                  className="lp-hero-btn-outline"
                  onMouseEnter={onEnter} onMouseLeave={onLeave}
                >
                  SIGN IN →
                </Link>
              </>
            )}
          </div>

          {isLoggedIn && (
            <div className="lp-logged-note">
              <div className="lp-logged-note-dot" />
              Signed in as <strong style={{ color: "var(--text)", marginLeft: 4 }}>{userEmail}</strong>
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

      {/* ── How it works ── */}
      <section className="lp-section lp-section-bg2" id="how">
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
              {PRODUCTS.map((p) => (
                <div className={`lp-product-row${p.active ? " active" : ""}`} key={p.name}>
                  <div className="lp-product-name">{p.name}</div>
                  <div className="lp-product-price">
                    {p.price} {p.drop && <span className="lp-product-drop">{p.drop}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="lp-preview-main">
              <div className="lp-preview-stats">
                <div className="lp-stat-box"><div className="lp-stat-sl">CURRENT PRICE</div><div className="lp-stat-sv" style={{ color: "var(--accent)" }}>₹24,990</div></div>
                <div className="lp-stat-box"><div className="lp-stat-sl">YOUR TARGET</div><div className="lp-stat-sv">₹22,000</div></div>
                <div className="lp-stat-box"><div className="lp-stat-sl">ALL-TIME LOW</div><div className="lp-stat-sv" style={{ color: "#6ee7b7" }}>₹21,490</div></div>
              </div>
              <div className="lp-preview-chart">
                <div className="lp-chart-label">PRICE HISTORY — LAST 30 DAYS</div>
                <svg viewBox="0 0 500 120" preserveAspectRatio="none" style={{ width: "100%", height: 100 }}>
                  <defs>
                    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e8ff47" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#e8ff47" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,60 L45,70 L95,80 L145,60 L195,55 L245,50 L295,48 L345,42 L395,30 L445,32 L500,22" fill="none" stroke="#e8ff47" strokeWidth="2" />
                  <path d="M0,60 L45,70 L95,80 L145,60 L195,55 L245,50 L295,48 L345,42 L395,30 L445,32 L500,22 L500,120 L0,120 Z" fill="url(#cg)" />
                  <line x1="0" y1="45" x2="500" y2="45" stroke="#ff6b35" strokeWidth="1" strokeDasharray="6,4" opacity="0.6" />
                  <text x="4" y="41" fontFamily="DM Mono,monospace" fontSize="8" fill="#ff6b35" opacity="0.8">TARGET ₹22K</text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta-section">
        <h2 className="lp-cta-h2">
          {isLoggedIn ? "Ready to hunt\nbetter prices?" : "Ready to start\nsaving?"}
        </h2>
        <p className="lp-cta-p">
          {isLoggedIn
            ? "Your dashboard is waiting. Track products and get alerted the moment prices drop."
            : "Sign in with Google and start tracking in under 60 seconds. No credit card required."
          }
        </p>
        <div className="lp-cta-actions">
          {isLoggedIn ? (
            <>
              <Link href="/dashboard" className="lp-hero-btn-lg" onMouseEnter={onEnter} onMouseLeave={onLeave}>
                LOAD DASHBOARD →
              </Link>
              <button className="lp-hero-btn-danger" onClick={handleSignOut} disabled={signingOut} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                {signingOut ? "SIGNING OUT…" : "↪ SIGN OUT"}
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="lp-hero-btn-lg" onMouseEnter={onEnter} onMouseLeave={onLeave}>
                SIGN UP FREE →
              </Link>
              <Link href="/auth/login" className="lp-hero-btn-outline" onMouseEnter={onEnter} onMouseLeave={onLeave}>
                SIGN IN
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <Link href="/" className="lp-footer-logo" onMouseEnter={onEnter} onMouseLeave={onLeave}>
          <div className="lp-logo-dot" />
          PriceHound
        </Link>
        <span className="lp-footer-copy">© {new Date().getFullYear()} PriceHound. All rights reserved.</span>
        <div className="lp-footer-links">
          <Link href="/privacy" onMouseEnter={onEnter} onMouseLeave={onLeave}>Privacy</Link>
          {isLoggedIn
            ? <Link href="/dashboard" onMouseEnter={onEnter} onMouseLeave={onLeave}>Dashboard</Link>
            : <Link href="/auth/login" onMouseEnter={onEnter} onMouseLeave={onLeave}>Sign In</Link>
          }
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" onMouseEnter={onEnter} onMouseLeave={onLeave}>GitHub</a>
        </div>
      </footer>
    </>
  );
}