"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  addProduct, deleteProduct, toggleProduct,
  updateTargetPrice, revalidateDashboard,
} from "@/lib/actions";
import { formatPrice, getPlatformLabel, getPlatformColor, timeAgo, detectPlatform } from "@/lib/utils";
import { DashboardNav } from "@/components/DashboardNav";
import type { Profile, TrackedProduct, PriceHistory, CrossPlatformPrice, CrossPriceHistory } from "@/types/supabase";

interface Props {
  profile:             Profile | null;
  products:            TrackedProduct[];
  allHistory:          PriceHistory[];
  crossPlatformPrices: CrossPlatformPrice[];
  crossHistory:        CrossPriceHistory[];
}
interface OptimisticProduct extends TrackedProduct { _scraping: boolean; }

// Cross-search candidate type
interface CrossCandidate {
  platform:      string;
  url:           string;
  name:          string | null;
  price:         number | null;
  imageUrl:      string | null;
  isSameProduct: boolean;
  confidence:    number;
  reasoning:     string;
  selected:      boolean; // user toggled
}

type AddStep =
  | "form"          // Step 1: enter URL + target price
  | "searching"     // Step 2: calling /api/cross-search
  | "confirm"       // Step 3: show AI-verified candidates
  | "saving";       // Step 4: saving confirmed matches

// Security: HTML-encode output to prevent XSS in rendered strings
function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
          .replace(/"/g,"&quot;").replace(/'/g,"&#x27;");
}

function PriceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"var(--card)", border:"1px solid var(--border2)", padding:"10px 14px", fontFamily:"'DM Mono',monospace", fontSize:12 }}>
      <div style={{ color:"var(--muted)", marginBottom:4 }}>{label}</div>
      <div style={{ color:"var(--accent)", fontWeight:500 }}>{formatPrice(payload[0].value)}</div>
    </div>
  );
}

function Spinner({ size=14 }: { size?: number }) {
  return (
    <span style={{
      display:"inline-block", width:size, height:size,
      border:"2px solid color-mix(in srgb,var(--text) 15%,transparent)",
      borderTopColor:"var(--accent)", borderRadius:"50%",
      animation:"ph-spin 0.7s linear infinite", flexShrink:0,
    }} />
  );
}

export default function DashboardClient({
  profile,
  products: initialProducts = [],
  allHistory: initialHistory = [],
  crossPlatformPrices: initialCrossPrices = [],
  crossHistory: initialCrossHistory = [],
}: Props) {
  const [localProducts, setLocalProducts] = useState<OptimisticProduct[]>(
    initialProducts.map((p) => ({ ...p, _scraping: false }))
  );
  const [localHistory,  setLocalHistory]  = useState<PriceHistory[]>(initialHistory);
  const [crossPrices]                     = useState<CrossPlatformPrice[]>(initialCrossPrices);
  const [crossHistory]                    = useState<CrossPriceHistory[]>(initialCrossHistory);
  const [selectedId,    setSelectedId]    = useState<string | null>(initialProducts[0]?.id ?? null);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editProduct,   setEditProduct]   = useState<OptimisticProduct | null>(null);
  const [addError,      setAddError]      = useState<string | null>(null);
  const [scrapeError,   setScrapeError]   = useState<string | null>(null);
  // Cross-platform search state
  const [findOnOthers,    setFindOnOthers]    = useState(true);   // opt-in toggle
  const [addStep,         setAddStep]         = useState<AddStep>("form");
  const [crossSource,     setCrossSource]     = useState<{ name: string; url: string; price: number | null; platform: string; imageUrl?: string | null } | null>(null);
  const [crossCandidates, setCrossCandidates] = useState<CrossCandidate[]>([]);
  const [savedProductId,  setSavedProductId]  = useState<string | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  // Mobile sidebar state — controls the collapsible sidebar overlay on mobile
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [isPending,     startTransition]  = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const selected      = localProducts.find((p) => p.id === selectedId) ?? null;
  const history       = localHistory
    .filter((h) => h.product_id === selectedId)
    .map((h) => ({ date: new Date(h.scraped_at).toLocaleDateString("en-IN",{month:"short",day:"numeric"}), price: h.price }));
  const historyPrices = history.map((h) => h.price);
  const allTimeLow    = historyPrices.length ? Math.min(...historyPrices) : null;
  const allTimeHigh   = historyPrices.length ? Math.max(...historyPrices) : null;
  const totalTracked  = localProducts.length;
  const totalAlerts   = localProducts.filter((p) => p.notify_sent).length;
  const activeCount   = localProducts.filter((p) => p.is_active).length;
  const initials      = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0,2).toUpperCase()
    : profile?.email?.[0]?.toUpperCase() ?? "?";

  // ── Cross-platform chart data for the selected product ───────
  // One entry per confirmed cross-platform tracker. Each becomes a Line in the chart.
  const selectedCrossPrices = crossPrices.filter((c) => c.product_id === selectedId);

  // Platform colour map for chart lines
  const PLATFORM_COLORS: Record<string, string> = {
    flipkart:        "#2874f0",
    croma:           "#00a6a0",
    reliancedigital: "#e2231a",
    poorvika:        "#e8251a",
    amazon:          "#ff9900",
    other:           "#9a9a9a",
  };

  // Build a unified timeline: merge primary history + all cross histories by date,
  // each platform gets its own key so Recharts can draw separate Lines.
  const chartData = (() => {
    // Collect all unique dates across primary + cross histories
    const primaryKey = "primary";
    const allDates   = new Set<string>();

    history.forEach((h) => allDates.add(h.date));
    selectedCrossPrices.forEach((cp) => {
      crossHistory
        .filter((ch) => ch.cross_platform_id === cp.id)
        .forEach((ch) => {
          const d = new Date(ch.scraped_at).toLocaleDateString("en-IN",{month:"short",day:"numeric"});
          allDates.add(d);
        });
    });

    // For each date build one row with price per platform
    const dateList = [...allDates].sort((a, b) => {
      // Sort by date — parse "3 Jan" style
      return new Date("2024 " + a).getTime() - new Date("2024 " + b).getTime();
    });

    return dateList.map((date) => {
      const row: Record<string, any> = { date };
      // Primary source price
      const primaryPoint = history.find((h) => h.date === date);
      if (primaryPoint) row[primaryKey] = primaryPoint.price;
      // Cross-platform prices
      selectedCrossPrices.forEach((cp) => {
        const key   = cp.platform;
        const point = crossHistory
          .filter((ch) => ch.cross_platform_id === cp.id)
          .find((ch) => new Date(ch.scraped_at).toLocaleDateString("en-IN",{month:"short",day:"numeric"}) === date);
        if (point) row[key] = point.price;
      });
      return row;
    });
  })();

  // Decide whether to show the merged chart or the simple single-line chart
  const hasCrossData = selectedCrossPrices.length > 0 && crossHistory.some((ch) => selectedCrossPrices.some((cp) => cp.id === ch.cross_platform_id));

  // ── scrapeNow ──────────────────────────────────────────────
  const scrapeNow = useCallback(async (productId: string) => {
    setScrapeError(null);
    setLocalProducts((prev) => prev.map((p) => p.id===productId ? {...p,_scraping:true} : p));
    try {
      const res  = await fetch("/api/scrape", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setScrapeError(data.error ?? "Scrape failed — will retry on next cron run.");
        setLocalProducts((prev) => prev.map((p) => p.id===productId ? {...p,_scraping:false} : p));
        return;
      }
      setLocalProducts((prev) => prev.map((p) =>
        p.id===productId
          ? {...p, _scraping:false, current_price:data.price??p.current_price, name:data.name??p.name, image_url:data.imageUrl??p.image_url}
          : p
      ));
      if (data.price) {
        setLocalHistory((prev) => [...prev, { id:`opt-${Date.now()}`, product_id:productId, price:data.price, scraped_at:new Date().toISOString() }]);
      }
      await revalidateDashboard();
    } catch {
      setScrapeError("Network error — scrape could not be reached.");
      setLocalProducts((prev) => prev.map((p) => p.id===productId ? {...p,_scraping:false} : p));
    }
  }, []);

  // ── helpers ───────────────────────────────────────────────
  const resetAddModal = () => {
    setAddStep("form"); setShowAddModal(false);
    setAddError(null); setCrossCandidates([]); setCrossSource(null);
    setSavedProductId(null); setPendingFormData(null);
  };

  // ── Step 1: validate → save to DB → [optionally] cross-search
  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setAddError(null);
    const fd    = new FormData(e.currentTarget);
    const url   = (fd.get("url") as string).trim();
    const name  = (fd.get("name") as string).trim();
    const tpRaw = fd.get("target_price") as string;

    if (!url.startsWith("http")) { setAddError("Please enter a valid URL starting with http."); return; }
    const tp = parseFloat(tpRaw);
    if (isNaN(tp) || tp <= 0) { setAddError("Target price must be a positive number."); return; }

    // Move to searching step immediately so the modal transitions
    setAddStep("searching");
    setPendingFormData(fd);
    setMobileSidebar(false);
    formRef.current?.reset();

    // ── Save the primary product to DB ───────────────────────
    const tempId = `temp-${Date.now()}`;
    const optimistic: OptimisticProduct = {
      id:tempId, user_id:profile?.id??"", url, name:name||null, image_url:null,
      platform:detectPlatform(url), target_price:tp, current_price:null,
      is_active:true, notify_sent:false,
      created_at:new Date().toISOString(), updated_at:new Date().toISOString(),
      _scraping:true,
    };
    setLocalProducts((prev) => [optimistic,...prev]);
    setSelectedId(tempId);

    let realProductId: string | null = null;
    try {
      const result = await addProduct(fd);
      if (result?.error) {
        setAddError(result.error);
        setLocalProducts((prev) => prev.filter((p) => p.id !== tempId));
        setSelectedId(localProducts[0]?.id ?? null);
        setAddStep("form"); setShowAddModal(true); return;
      }
      realProductId = result.productId!;
      setSavedProductId(realProductId);
      setLocalProducts((prev) => prev.map((p) => p.id===tempId ? {...p, id:realProductId!} : p));
      setSelectedId(realProductId);
    } catch (err) {
      console.error("[addProduct] request failed:", err);
      setAddError("Failed to save — the server did not respond. Restart the dev server and check the terminal for errors.");
      setLocalProducts((prev) => prev.filter((p) => p.id !== tempId));
      setSelectedId(localProducts[0]?.id ?? null);
      setAddStep("form"); setShowAddModal(true); return;
    }

    // ── Scrape primary product — we need name+price for cross-search
    // Run scrapeNow and capture its result for passing to cross-search
    let scrapedName:  string | null = name || null;
    let scrapedPrice: number | null = null;
    let scrapedPlatform = "other";

    try {
      const scrapeRes = await fetch("/api/scrape", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ productId: realProductId }),
      });
      const scrapeData = await scrapeRes.json();
      if (scrapeData.success && scrapeData.price) {
        scrapedPrice    = scrapeData.price;
        scrapedName     = scrapeData.name ?? scrapedName;
        // Update optimistic product with scraped data
        setLocalProducts((prev) => prev.map((p) =>
          p.id===realProductId
            ? { ...p, _scraping:false, current_price:scrapeData.price, name:scrapeData.name??p.name, image_url:scrapeData.imageUrl??p.image_url }
            : p
        ));
        if (scrapeData.price) {
          setLocalHistory((prev) => [...prev, {
            id: `opt-${Date.now()}`, product_id: realProductId!, price: scrapeData.price, scraped_at: new Date().toISOString(),
          }]);
        }
      } else {
        // Scrape failed — mark product as not scraping and tell the user why
        setScrapeError(scrapeData.error ?? "Could not read the price from this product page.");
        setLocalProducts((prev) => prev.map((p) => p.id===realProductId ? {...p, _scraping:false} : p));
      }

      // Detect platform from URL
      const { detectPlatform: dp } = await import("@/lib/utils");
      scrapedPlatform = dp(url);
    } catch {
      setScrapeError("Price check timed out or failed. Try Refresh again in a moment.");
      setLocalProducts((prev) => prev.map((p) => p.id===realProductId ? {...p, _scraping:false} : p));
    }

    // ── If user did not opt in, just close ───────────────────
    if (!findOnOthers) {
      await revalidateDashboard();
      setAddStep("form"); setShowAddModal(false);
      setSavedProductId(null); setPendingFormData(null);
      return;
    }

    // ── Cross-platform search — pass scraped data, no re-scrape ─
    // Build the best possible product name for search
    const searchName = (scrapedName || name || "").trim();

    // If we have no product name at all, we can't search other platforms
    if (!searchName) {
      await revalidateDashboard();
      resetAddModal();
      return;
    }

    try {
      const res = await fetch("/api/cross-search", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          productName:    searchName,
          productPrice:   scrapedPrice,
          sourcePlatform: scrapedPlatform,
          targetPrice:    tp,
        }),
      });

      let data: any = {};
      try { data = await res.json(); } catch {}

      const candidates: CrossCandidate[] = Array.isArray(data.candidates)
        ? data.candidates.map((c: any) => ({
            platform:      c.platform,
            url:           c.url,
            name:          c.name,
            price:         c.price,
            imageUrl:      c.imageUrl,
            isSameProduct: c.isSameProduct,
            confidence:    c.confidence,
            reasoning:     c.reasoning,
            selected:      c.isSameProduct && c.confidence >= 0.65,
          }))
        : [];

      if (candidates.length === 0) {
        // Nothing found — close normally
        await revalidateDashboard();
        resetAddModal();
        return;
      }

      // Set source + candidates BEFORE changing step so both are ready when confirm renders
      const source = data.source ?? {
        name:     searchName,
        url,
        price:    scrapedPrice,
        platform: scrapedPlatform,
      };
      setCrossSource(source);
      setCrossCandidates(candidates);
      // Small tick to let React commit the above state before we transition
      await new Promise((r) => setTimeout(r, 0));
      setAddStep("confirm");
    } catch (err) {
      console.error("[cross-search client] failed:", err);
      await revalidateDashboard();
      resetAddModal();
    }
  };

  // ── Step 3: confirm cross-platform choices → save ───────────
  const handleConfirmCross = async (saveSelected: boolean) => {
    if (!saveSelected || !savedProductId || crossCandidates.filter((c) => c.selected).length === 0) {
      await revalidateDashboard();
      resetAddModal(); return;
    }

    setAddStep("saving");

    try {
      await fetch("/api/cross-search/confirm", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          productId: savedProductId,
          confirmed: crossCandidates.filter((c) => c.selected).map((c) => ({
            platform:   c.platform,
            url:        c.url,
            name:       c.name,
            price:      c.price,
            imageUrl:   c.imageUrl,
            confidence: c.confidence,
            reasoning:  c.reasoning,
          })),
        }),
      });
    } catch {}

    await revalidateDashboard();
    resetAddModal();
  };

  const handleDelete = (id: string) => {
    const remaining = localProducts.filter((p) => p.id!==id);
    setLocalProducts(remaining);
    if (selectedId===id) setSelectedId(remaining[0]?.id ?? null);
    startTransition(async () => { await deleteProduct(id); });
  };

  const handleToggle = (id: string, isActive: boolean) => {
    setLocalProducts((prev) => prev.map((p) => p.id===id ? {...p,is_active:!isActive} : p));
    startTransition(async () => { await toggleProduct(id, isActive); });
  };

  const handleEditSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editProduct) return;
    const fd  = new FormData(e.currentTarget);
    const np  = parseFloat(fd.get("target_price") as string);
    if (isNaN(np) || np <= 0) return;
    setLocalProducts((prev) => prev.map((p) => p.id===editProduct.id ? {...p,target_price:np,notify_sent:false} : p));
    setShowEditModal(false); setEditProduct(null);
    startTransition(async () => { await updateTargetPrice(editProduct.id, np); });
  };

  // ── Sidebar content (shared between desktop fixed + mobile drawer) ──
  const sidebarInner = (
    <>
      <div className="db-sidebar-top">
        <button className="db-add-btn" onClick={() => { setAddStep("form"); setShowAddModal(true); setMobileSidebar(false); }}>
          + TRACK NEW PRODUCT
        </button>
      </div>
      <div className="db-sidebar-label">Tracked ({localProducts.length})</div>
      <div className="db-product-list ph-scrollbar">
        {localProducts.length === 0 && (
          <p style={{ padding:"16px 10px", fontFamily:"'DM Mono',monospace", fontSize:11, color:"var(--muted)", lineHeight:1.6 }}>
            No products yet. Add one to get started.
          </p>
        )}
        {localProducts.map((p) => {
          const isHit = !p._scraping && p.current_price != null && p.current_price <= p.target_price;
          let hostname = p.url;
          try { hostname = new URL(p.url).hostname.replace("www.",""); } catch {}
          return (
            <div
              key={p.id}
              className={`db-product-item${selectedId===p.id ? " active":""}`}
              onClick={() => { setSelectedId(p.id); setMobileSidebar(false); }}
            >
              {p._scraping
                ? <div style={{ position:"absolute",top:10,right:10 }}><Spinner size={8} /></div>
                : <div className="db-product-item-status" style={{ background:isHit?"var(--accent)":p.is_active?"var(--success)":"var(--muted)" }} />
              }
              <div className="db-product-item-name">{p.name || hostname}</div>
              <div className="db-product-item-meta">
                <div className="db-platform-dot" style={{ background:getPlatformColor(p.platform) }} />
                <div className="db-product-item-price">
                  {p._scraping
                    ? <span style={{ color:"var(--accent)", animation:"ph-pulse 1.5s infinite" }}>scraping…</span>
                    : <>{p.current_price ? formatPrice(p.current_price) : "—"} → <span style={{ color:"var(--accent)" }}>{formatPrice(p.target_price)}</span></>
                  }
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="db-sidebar-bottom">
        <div className="db-user">
          <Link href="/profile" style={{ display:"flex",alignItems:"center",gap:10,flex:1,overflow:"hidden",textDecoration:"none" }}>
            <div className="db-avatar">{initials}</div>
            <div className="db-user-info">
              <div className="db-user-name">{profile?.full_name ?? "User"}</div>
              <div className="db-user-email" style={{ color:"var(--accent)" }}>{profile?.email}</div>
            </div>
          </Link>
          <form action="/auth/signout" method="POST">
            <button type="submit" className="db-signout-btn" title="Sign out">↪</button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{`
        @keyframes ph-spin    { to{transform:rotate(360deg)} }
        @keyframes ph-pulse   { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes shimmer    { to{background-position:-200% 0} }
        @keyframes modalIn    { from{opacity:0;transform:scale(0.97) translateY(8px)} to{opacity:1;transform:none} }
        @keyframes slideInTop { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }
        @keyframes sidebarIn  { from{transform:translateX(-100%);opacity:0} to{transform:translateX(0);opacity:1} }

        /* ── Layout ──
           The parent (DashboardShell) is position:fixed covering top:52→bottom:0.
           db-wrap stretches to fill it completely using width/height 100%.
           Inside: sidebar is fixed-width, db-main takes everything else.
        ── */
        .db-wrap {
          display: flex;
          width: 100%;
          height: 100%;             /* fill the fixed parent exactly */
          overflow: hidden;
          background: var(--bg);
        }

        /* ── Desktop sidebar — fixed panel, never scrolls ── */
        .db-sidebar {
          width: 280px;
          min-width: 280px;
          flex-shrink: 0;
          height: 100%;             /* fill db-wrap height exactly */
          display: flex;
          flex-direction: column;
          background: var(--bg2);
          border-right: 1px solid var(--border);
          transition: background 0.25s, border-color 0.25s;
          overflow: hidden;         /* children manage their own scroll */
        }
        .db-sidebar-top   { padding: 20px 20px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .db-sidebar-label { padding: 20px 20px 10px; font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.12em; text-transform:uppercase; flex-shrink:0; }
        .db-product-list  {
          flex: 1;
          min-height: 0;            /* allow shrink inside flex column */
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0 12px 12px;
        }
        .db-sidebar-bottom {
          padding: 16px 20px;
          border-top: 1px solid var(--border);
          flex-shrink: 0;           /* always visible at bottom */
          background: var(--bg2);
          transition: background 0.25s;
        }

        /* Custom scrollbar on product list */
        .db-product-list { scrollbar-width:thin; scrollbar-color:var(--scrollbar-thumb) transparent; }
        .db-product-list::-webkit-scrollbar { width:4px; }
        .db-product-list::-webkit-scrollbar-track { background:transparent; }
        .db-product-list::-webkit-scrollbar-thumb { background:var(--scrollbar-thumb); border-radius:4px; }
        .db-product-list::-webkit-scrollbar-thumb:hover { background:var(--scrollbar-thumb-hover); }

        /* ── Mobile sidebar — full-screen overlay drawer ── */
        .db-mobile-overlay {
          display:none; position:fixed; inset:0; z-index:400;
          background:rgba(0,0,0,0.55); backdrop-filter:blur(3px);
        }
        .db-mobile-overlay.open { display:block; }

        .db-mobile-sidebar {
          display:none; position:fixed; top:52px; left:0; bottom:0; z-index:401;
          width:min(300px,85vw);
          flex-direction:column;
          background:var(--bg2); border-right:1px solid var(--border);
          animation:sidebarIn 0.22s ease;
          box-shadow:8px 0 24px rgba(0,0,0,0.3);
        }
        .db-mobile-sidebar.open { display:flex; }
        .db-mobile-sidebar .db-sidebar-top   { padding:14px 16px; border-bottom:1px solid var(--border); flex-shrink:0; }
        .db-mobile-sidebar .db-sidebar-label { padding:14px 20px 8px; font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.12em; text-transform:uppercase; flex-shrink:0; }
        .db-mobile-sidebar .db-product-list  { flex:1; overflow-y:auto; padding:0 10px 10px; }
        .db-mobile-sidebar .db-sidebar-bottom{ padding:14px 16px; border-top:1px solid var(--border); flex-shrink:0; background:var(--bg2); }

        /* ── Shared sidebar components ── */
        .db-add-btn {
          width:100%; background:var(--accent); color:var(--accent-fg,#0a0a0a);
          border:none; cursor:pointer; font-family:'DM Mono',monospace;
          font-size:11px; font-weight:500; padding:10px 14px; letter-spacing:0.08em;
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition:opacity 0.2s,transform 0.15s;
        }
        .db-add-btn:hover { opacity:0.88; transform:translateY(-1px); }
        .db-product-item {
          padding:10px; border:1px solid transparent; border-radius:3px;
          cursor:pointer; transition:all 0.15s; margin-bottom:3px; position:relative;
        }
        .db-product-item:hover  { background:color-mix(in srgb,var(--text) 4%,transparent); border-color:var(--border); }
        .db-product-item.active { background:color-mix(in srgb,var(--accent) 6%,transparent); border-color:color-mix(in srgb,var(--accent) 35%,transparent); }
        .db-product-item-name  { font-size:12px; font-weight:500; color:var(--text); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px; }
        .db-product-item-meta  { display:flex; align-items:center; gap:6px; }
        .db-platform-dot       { width:5px; height:5px; border-radius:50%; flex-shrink:0; }
        .db-product-item-price { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted2); }
        .db-product-item-status{ position:absolute; top:10px; right:10px; width:6px; height:6px; border-radius:50%; }
        .db-user     { display:flex; align-items:center; gap:10px; }
        .db-avatar   { width:32px; height:32px; border-radius:50%; background:color-mix(in srgb,var(--accent) 14%,transparent); border:1px solid color-mix(in srgb,var(--accent) 35%,transparent); display:flex; align-items:center; justify-content:center; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:var(--accent); flex-shrink:0; }
        .db-user-info  { flex:1; overflow:hidden; }
        .db-user-name  { font-size:12px; font-weight:500; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .db-user-email { font-family:'DM Mono',monospace; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .db-signout-btn{ background:none; border:none; cursor:pointer; font-family:'DM Mono',monospace; font-size:12px; color:var(--muted); padding:4px; transition:color 0.2s; }
        .db-signout-btn:hover { color:var(--danger); }

        /* ── Mobile toggle button (shown in main on mobile) ── */
        .db-mobile-toggle {
          display:none; align-items:center; gap:8px;
          background:var(--bg2); border:1px solid var(--border2);
          color:var(--muted2); font-family:'DM Mono',monospace;
          font-size:11px; padding:7px 14px; cursor:pointer;
          letter-spacing:0.06em; transition:all 0.2s;
        }
        .db-mobile-toggle:hover { color:var(--text); border-color:var(--border); }

        /* ── Main — fills every pixel not used by the sidebar ── */
        .db-main {
          flex: 1;                  /* take ALL space left after the 280px sidebar */
          min-width: 0;             /* allow flex child to shrink below content width */
          height: 100%;             /* fill db-wrap height */
          overflow-y: auto;
          overflow-x: hidden;
          padding: 36px 44px;       /* generous breathing room */
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .db-main::-webkit-scrollbar { display: none; }
        .db-guide-row { display:flex; align-items:center; gap:8px; margin-bottom:28px; }

        /* ── Stats ── */
        .db-stats      { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:28px; }
        .db-stat-card  { background:var(--bg2); border:1px solid var(--border); padding:20px 24px; transition:background 0.25s,border-color 0.25s; }
        .db-stat-label { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.1em; margin-bottom:12px; }
        .db-stat-value { font-family:'Syne',sans-serif; font-weight:700; font-size:32px; letter-spacing:-1.5px; color:var(--text); }
        .db-stat-sub   { font-size:12px; color:var(--muted); margin-top:6px; }

        /* ── Banners ── */
        .db-scrape-banner { display:flex; align-items:center; gap:12px; background:color-mix(in srgb,var(--accent) 6%,transparent); border:1px solid color-mix(in srgb,var(--accent) 25%,transparent); padding:10px 14px; margin-bottom:14px; font-family:'DM Mono',monospace; font-size:12px; color:var(--accent); animation:slideInTop 0.25s ease,ph-pulse 1.8s ease-in-out 0.25s infinite; }
        .db-scrape-error  { display:flex; align-items:center; gap:10px; background:color-mix(in srgb,var(--danger) 8%,transparent); border:1px solid color-mix(in srgb,var(--danger) 25%,transparent); padding:10px 14px; margin-bottom:14px; font-family:'DM Mono',monospace; font-size:12px; color:var(--danger); animation:slideInTop 0.2s ease; }

        /* ── Empty state ── */
        .db-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:60px 24px; text-align:center; }
        .db-empty-icon  { width:60px; height:60px; border:1px solid var(--border2); display:flex; align-items:center; justify-content:center; font-size:26px; }
        .db-empty-title { font-family:'Syne',sans-serif; font-weight:700; font-size:20px; letter-spacing:-0.5px; color:var(--text); }
        .db-empty-sub   { font-size:13px; color:var(--muted2); font-weight:300; max-width:300px; line-height:1.6; }

        /* ── Detail ── */
        .db-detail-header  { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; flex-wrap:wrap; }
        .db-detail-name    { font-family:'Syne',sans-serif; font-weight:700; font-size:clamp(16px,2vw,23px); letter-spacing:-0.5px; line-height:1.2; color:var(--text); }
        .db-detail-actions { display:flex; gap:6px; flex-shrink:0; flex-wrap:wrap; }
        .db-icon-btn { background:var(--bg2); border:1px solid var(--border2); color:var(--muted2); cursor:pointer; padding:7px 10px; font-family:'DM Mono',monospace; font-size:11px; letter-spacing:0.05em; transition:all 0.2s; display:flex; align-items:center; gap:5px; }
        .db-icon-btn:hover        { border-color:var(--border); color:var(--text); }
        .db-icon-btn.danger:hover { border-color:var(--danger); color:var(--danger); }
        .db-icon-btn.accent       { border-color:color-mix(in srgb,var(--accent) 35%,transparent); color:var(--accent); }
        .db-icon-btn.accent:hover { background:color-mix(in srgb,var(--accent) 7%,transparent); }
        .db-icon-btn:disabled     { opacity:0.4; cursor:not-allowed; pointer-events:none; }

        /* ── Price cards ── */
        .db-price-cards      { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:28px; }
        .db-price-card       { background:var(--bg2); border:1px solid var(--border); padding:20px 24px; position:relative; overflow:hidden; transition:background 0.25s,border-color 0.25s; }
        .db-price-card-label { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.1em; margin-bottom:12px; }
        .db-price-card-value { font-family:'Syne',sans-serif; font-weight:700; font-size:28px; letter-spacing:-1px; min-height:36px; display:flex; align-items:center; gap:10px; }
        .db-price-card-sub   { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); margin-top:6px; }
        .db-skeleton { height:28px; width:100px; border-radius:2px; background:linear-gradient(90deg,var(--bg3) 25%,color-mix(in srgb,var(--text) 5%,transparent) 50%,var(--bg3) 75%); background-size:200% 100%; animation:shimmer 1.3s infinite; }

        /* ── Chart ── */
        .db-chart-section { background:var(--bg2); border:1px solid var(--border); padding:28px; margin-bottom:28px; transition:background 0.25s,border-color 0.25s; }
        .db-chart-header  { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
        .db-chart-title   { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); letter-spacing:0.1em; text-transform:uppercase; }
        .db-chart-legend  { display:flex; gap:16px; }
        .db-chart-legend-item { display:flex; align-items:center; gap:6px; font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); }
        .db-chart-legend-line { width:20px; height:2px; }
        .db-no-history { height:240px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; font-family:'DM Mono',monospace; font-size:12px; color:var(--muted); }

        /* ── Badges ── */
        .db-badge        { display:inline-flex; align-items:center; gap:4px; font-family:'DM Mono',monospace; font-size:10px; padding:3px 7px; border:1px solid var(--border); color:var(--muted2); }
        .db-status-badge { display:inline-flex; align-items:center; gap:4px; font-family:'DM Mono',monospace; font-size:10px; padding:3px 9px; }
        .db-status-active  { background:color-mix(in srgb,var(--success) 10%,transparent); color:var(--success); border:1px solid color-mix(in srgb,var(--success) 28%,transparent); }
        .db-status-paused  { background:color-mix(in srgb,var(--muted) 10%,transparent); color:var(--muted2); border:1px solid var(--border); }
        .db-status-hit     { background:color-mix(in srgb,var(--accent) 10%,transparent); color:var(--accent); border:1px solid color-mix(in srgb,var(--accent) 28%,transparent); }
        .db-status-loading { background:color-mix(in srgb,var(--accent) 6%,transparent); color:var(--accent); border:1px solid color-mix(in srgb,var(--accent) 20%,transparent); animation:ph-pulse 1.5s ease-in-out infinite; }

        /* ── Modal ── */
        .db-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.72); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:500; padding:24px; }
        .db-modal        { background:var(--bg2); border:1px solid var(--border2); padding:28px; width:100%; max-width:480px; animation:modalIn 0.2s ease; }
        .db-modal-title  { font-family:'Syne',sans-serif; font-weight:700; font-size:19px; letter-spacing:-0.5px; margin-bottom:6px; color:var(--text); }
        .db-modal-sub    { font-size:13px; color:var(--muted2); margin-bottom:24px; font-weight:300; line-height:1.5; }
        .db-field        { margin-bottom:16px; }
        .db-label        { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted2); letter-spacing:0.08em; display:block; margin-bottom:7px; }
        .db-input        { width:100%; background:var(--bg3); border:1px solid var(--border2); color:var(--text); padding:10px 13px; font-family:'DM Mono',monospace; font-size:13px; outline:none; transition:border-color 0.2s; }
        .db-input:focus  { border-color:color-mix(in srgb,var(--accent) 55%,transparent); }
        .db-input::placeholder { color:var(--muted); }
        .db-modal-actions { display:flex; gap:10px; margin-top:20px; }
        .db-btn-submit  { flex:1; background:var(--accent); color:var(--accent-fg,#0a0a0a); border:none; cursor:pointer; font-family:'DM Mono',monospace; font-size:12px; font-weight:500; padding:11px; letter-spacing:0.08em; transition:opacity 0.2s; display:flex; align-items:center; justify-content:center; gap:8px; }
        .db-btn-submit:disabled { opacity:0.5; cursor:not-allowed; }
        .db-btn-submit:hover:not(:disabled) { opacity:0.85; }
        .db-btn-cancel  { background:transparent; color:var(--muted2); border:1px solid var(--border2); cursor:pointer; font-family:'DM Mono',monospace; font-size:12px; padding:11px 18px; letter-spacing:0.08em; transition:all 0.2s; }
        .db-btn-cancel:hover { color:var(--text); border-color:var(--border); }
        .db-error-msg   { background:color-mix(in srgb,var(--danger) 9%,transparent); border:1px solid color-mix(in srgb,var(--danger) 28%,transparent); color:var(--danger); font-family:'DM Mono',monospace; font-size:11px; padding:9px 13px; margin-bottom:14px; }

        /* ════════════════════════════════════════
           RESPONSIVE BREAKPOINTS
        ════════════════════════════════════════ */

        /* Very wide — sidebar wider */
        @media(min-width:1600px) {
          .db-sidebar { width:320px; min-width:320px; }
          .db-main    { padding:40px 48px; }
          .db-stats, .db-price-cards { gap:20px; }
          .db-stat-value { font-size:36px; }
          .db-price-card-value { font-size:32px; }
        }

        /* Large desktop */
        @media(max-width:1400px) {
          .db-main    { padding:32px 36px; }
          .db-stat-value { font-size:30px; }
          .db-price-card-value { font-size:26px; }
        }

        /* Medium desktop */
        @media(max-width:1200px) {
          .db-stats, .db-price-cards { gap:12px; }
          .db-main { padding:28px 32px; }
        }

        /* Tablet landscape — 2-col grids */
        @media(max-width:1100px) {
          .db-stats       { grid-template-columns:repeat(2,1fr); }
          .db-price-cards { grid-template-columns:repeat(2,1fr); }
          .db-stat-value  { font-size:28px; }
          .db-price-card-value { font-size:24px; }
        }

        /* Tablet portrait — narrow sidebar */
        @media(max-width:900px) {
          .db-sidebar    { width:240px; min-width:240px; }
          .db-main       { padding:24px 28px; }
          .db-stat-value { font-size:24px; }
          .db-price-card-value { font-size:22px; }
          .db-chart-section { padding:20px; }
        }

        /* Mobile — hide desktop sidebar completely, use drawer */
        @media(max-width:768px) {
          .db-sidebar       { display:none; }
          .db-mobile-toggle { display:flex; }
          /* Revert to normal page flow so the page itself scrolls */
          .db-wrap {
            display: block;
            height: auto;
            min-height: calc(100vh - 52px);
            overflow: visible;
          }
          .db-main {
            height: auto;
            overflow-y: visible;
            padding: 20px;
            scrollbar-width: thin;
            -ms-overflow-style: auto;
          }
          .db-main::-webkit-scrollbar { display:block; width:3px; }
          .db-main::-webkit-scrollbar-thumb { background:var(--scrollbar-thumb); border-radius:3px; }
          .db-stats       { grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:18px; }
          .db-price-cards { grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:18px; }
          .db-stat-card   { padding:14px 16px; }
          .db-price-card  { padding:14px 16px; }
          .db-stat-value  { font-size:22px; }
          .db-price-card-value { font-size:20px; }
          .db-chart-section { padding:16px; }
          .db-detail-name { font-size:18px; }
          .db-guide-row   { margin-bottom:14px; }
        }

        /* Small mobile */
        @media(max-width:480px) {
          .db-main        { padding:14px; }
          .db-stats, .db-price-cards { grid-template-columns:1fr 1fr; gap:8px; }
          .db-stat-card, .db-price-card { padding:12px; }
          .db-stat-value  { font-size:20px; }
          .db-price-card-value { font-size:18px; }
          .db-chart-section { padding:12px; }
          .db-detail-actions { gap:4px; }
          .db-icon-btn    { padding:6px 8px; font-size:10px; }
        }
      `}</style>


      {/* Mobile sidebar overlay + drawer */}
      <div className={`db-mobile-overlay${mobileSidebar ? " open":""}`} onClick={() => setMobileSidebar(false)} />
      <div className={`db-mobile-sidebar${mobileSidebar ? " open":""}`}>
        {sidebarInner}
      </div>

      <div className="db-wrap">
        {/* Desktop sidebar */}
        <aside className="db-sidebar">{sidebarInner}</aside>

        {/* Main */}
        <main className="db-main">
          {/* Mobile toggle — only visible on mobile, opens the sidebar drawer */}
          <div style={{ marginBottom:16 }}>
            <button className="db-mobile-toggle" onClick={() => setMobileSidebar(true)}>
              ☰ {localProducts.length > 0 ? `${localProducts.length} Products` : "Products"}
            </button>
          </div>

          {localProducts.some((p) => p._scraping) && (
            <div className="db-scrape-banner"><Spinner size={14} /> Fetching current price — this takes 10–30 seconds…</div>
          )}
          {scrapeError && (
            <div className="db-scrape-error">
              ⚠ {scrapeError}
              <button onClick={() => setScrapeError(null)} style={{ marginLeft:"auto",background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:16 }}>✕</button>
            </div>
          )}

          {/* Stats */}
          <div className="db-stats">
            {[
              { label:"TOTAL TRACKED", value:totalTracked,              sub:`${activeCount} active` },
              { label:"ALERTS SENT",   value:totalAlerts,               sub:"price targets hit", accent:true },
              { label:"PRICE CHECKS",  value:localHistory.length,       sub:"data points" },
              { label:"PAUSED",        value:totalTracked-activeCount,  sub:"products paused" },
            ].map(({ label, value, sub, accent }) => (
              <div className="db-stat-card" key={label}>
                <div className="db-stat-label">{label}</div>
                <div className="db-stat-value" style={accent ? { color:"var(--accent)" } : {}}>{value}</div>
                <div className="db-stat-sub">{sub}</div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {localProducts.length === 0 && (
            <div className="db-empty">
              <div className="db-empty-icon">🔍</div>
              <div className="db-empty-title">Nothing tracked yet.</div>
              <p className="db-empty-sub">Add a product URL and your target price. We&apos;ll watch it and email you when it drops.</p>
              <button className="db-add-btn" style={{ width:"auto",padding:"11px 24px" }} onClick={() => { setAddStep("form"); setShowAddModal(true); }}>
                + TRACK YOUR FIRST PRODUCT
              </button>
            </div>
          )}

          {/* Product detail */}
          {selected && (
            <>
              <div className="db-detail-header">
                <div style={{ overflow:"hidden", flex:1 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap" }}>
                    <div className="db-badge" style={{ borderColor:getPlatformColor(selected.platform), color:getPlatformColor(selected.platform) }}>
                      {getPlatformLabel(selected.platform)}
                    </div>
                    <div className={`db-status-badge ${
                      selected._scraping ? "db-status-loading"
                      : selected.current_price!=null&&selected.current_price<=selected.target_price ? "db-status-hit"
                      : selected.is_active ? "db-status-active" : "db-status-paused"
                    }`}>
                      {selected._scraping
                        ? <><Spinner size={8} /> SCRAPING</>
                        : <><span style={{ width:5,height:5,borderRadius:"50%",background:"currentColor",display:"inline-block" }} />
                          {selected.current_price!=null&&selected.current_price<=selected.target_price ? "TARGET HIT" : selected.is_active ? "TRACKING" : "PAUSED"}
                        </>
                      }
                    </div>
                  </div>
                  <div className="db-detail-name">
                    {selected._scraping && !selected.name ? "Fetching product info…" : selected.name || "Unnamed Product"}
                  </div>
                  <a href={selected.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--muted)",textDecoration:"none",display:"block",marginTop:5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:480 }}
                    title={selected.url}
                  >{selected.url}</a>
                  <div style={{ marginTop:5,fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--muted)" }}>
                    added {timeAgo(selected.created_at)}
                  </div>
                </div>
                <div className="db-detail-actions">
                  <button className="db-icon-btn accent" onClick={() => { setEditProduct(selected); setShowEditModal(true); }} disabled={selected._scraping}>✎ EDIT</button>
                  <button className="db-icon-btn" onClick={() => scrapeNow(selected.id)} disabled={selected._scraping||isPending}>
                    {selected._scraping ? <><Spinner size={11}/> SCRAPING</> : "↻ REFRESH"}
                  </button>
                  <button className="db-icon-btn" onClick={() => handleToggle(selected.id,selected.is_active)} disabled={selected._scraping||isPending}>
                    {selected.is_active ? "⏸" : "▶"}
                  </button>
                  <button className="db-icon-btn danger" onClick={() => handleDelete(selected.id)} disabled={isPending}>✕</button>
                </div>
              </div>

              {/* Price cards */}
              <div className="db-price-cards">
                <div className="db-price-card">
                  <div className="db-price-card-label">CURRENT PRICE</div>
                  <div className="db-price-card-value">
                    {selected._scraping && !selected.current_price
                      ? <><Spinner size={16}/><span style={{ fontFamily:"'DM Mono',monospace",fontSize:12,color:"var(--muted)" }}>fetching…</span></>
                      : <span style={{ color:selected.current_price!=null&&selected.current_price<=selected.target_price ? "var(--success)":"var(--text)" }}>
                          {formatPrice(selected.current_price)}
                        </span>
                    }
                  </div>
                  <div className="db-price-card-sub">{selected._scraping ? "scraping…" : "last scraped"}</div>
                </div>
                <div className="db-price-card">
                  <div className="db-price-card-label">YOUR TARGET</div>
                  <div className="db-price-card-value" style={{ color:"var(--accent)" }}>{formatPrice(selected.target_price)}</div>
                  <div className="db-price-card-sub">
                    {!selected._scraping && selected.current_price!=null
                      ? selected.current_price > selected.target_price
                        ? `${formatPrice(selected.current_price - selected.target_price)} away`
                        : "✓ target reached"
                      : "set by you"}
                  </div>
                </div>
                <div className="db-price-card">
                  <div className="db-price-card-label">ALL-TIME LOW</div>
                  <div className="db-price-card-value">
                    {selected._scraping && allTimeLow===null ? <div className="db-skeleton"/> : <span style={{ color:"var(--success)" }}>{formatPrice(allTimeLow)}</span>}
                  </div>
                  <div className="db-price-card-sub">since tracking</div>
                </div>
                <div className="db-price-card">
                  <div className="db-price-card-label">ALL-TIME HIGH</div>
                  <div className="db-price-card-value">
                    {selected._scraping && allTimeHigh===null ? <div className="db-skeleton"/> : <span style={{ color:"var(--accent2)" }}>{formatPrice(allTimeHigh)}</span>}
                  </div>
                  <div className="db-price-card-sub">since tracking</div>
                </div>
              </div>

              {/* Chart — overlays primary + all confirmed cross-platform histories */}
              <div className="db-chart-section db-chart-section">
                <div className="db-chart-header">
                  <div className="db-chart-title">PRICE HISTORY</div>
                  {/* Legend */}
                  <div className="db-chart-legend" style={{ flexWrap:"wrap", gap:"10px 16px" }}>
                    {/* Primary source */}
                    <div className="db-chart-legend-item">
                      <div className="db-chart-legend-line" style={{ background:"var(--accent)" }}/>
                      <span>{selected ? getPlatformLabel(selected.platform) : "Source"}</span>
                    </div>
                    {/* Cross-platform lines */}
                    {selectedCrossPrices.map((cp) => (
                      <div className="db-chart-legend-item" key={cp.id}>
                        <div className="db-chart-legend-line" style={{ background: PLATFORM_COLORS[cp.platform] ?? "#9a9a9a" }}/>
                        <span>{getPlatformLabel(cp.platform)}</span>
                      </div>
                    ))}
                    {/* Target dashed line */}
                    <div className="db-chart-legend-item">
                      <div className="db-chart-legend-line" style={{ borderTop:"2px dashed var(--accent2)", height:0 }}/>
                      <span>Target</span>
                    </div>
                  </div>
                </div>

                {selected._scraping && history.length === 0 && !hasCrossData ? (
                  <div className="db-no-history"><Spinner size={24}/><span>Scraping price data…</span></div>
                ) : history.length === 0 && !hasCrossData ? (
                  <div className="db-no-history">No price data yet — check back after the first cron run.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart
                      data={hasCrossData ? chartData : history}
                      margin={{ top:4, right:8, left:0, bottom:0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb,var(--text) 6%,transparent)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontFamily:"'DM Mono',monospace", fontSize:10, fill:"var(--muted)" }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        tick={{ fontFamily:"'DM Mono',monospace", fontSize:10, fill:"var(--muted)" }}
                        axisLine={false} tickLine={false}
                        tickFormatter={(v) => `₹${(v/1000).toFixed(0)}K`}
                        width={48}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div style={{ background:"var(--card)", border:"1px solid var(--border2)", padding:"10px 14px", fontFamily:"'DM Mono',monospace", fontSize:11 }}>
                              <div style={{ color:"var(--muted)", marginBottom:6 }}>{label}</div>
                              {payload.map((p: any, i: number) => (
                                <div key={i} style={{ color: p.stroke ?? p.color, marginBottom:3 }}>
                                  {p.name === "primary" ? getPlatformLabel(selected?.platform) : getPlatformLabel(p.name)}
                                  : {formatPrice(p.value)}
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine
                        y={selected.target_price}
                        stroke="var(--accent2)" strokeDasharray="6 4" strokeWidth={1.5} opacity={0.7}
                        label={{ value:"Target", fill:"var(--accent2)", fontSize:10, fontFamily:"'DM Mono',monospace", position:"insideTopRight" }}
                      />
                      {/* Primary source line — always accent yellow */}
                      {hasCrossData ? (
                        <Line
                          type="monotone" dataKey="primary" name="primary"
                          stroke="var(--accent)" strokeWidth={2.5}
                          dot={false} activeDot={{ r:4, fill:"var(--accent)", strokeWidth:0 }}
                          connectNulls
                        />
                      ) : (
                        <Line
                          type="monotone" dataKey="price" name="primary"
                          stroke="var(--accent)" strokeWidth={2.5}
                          dot={false} activeDot={{ r:4, fill:"var(--accent)", strokeWidth:0 }}
                        />
                      )}
                      {/* One Line per confirmed cross-platform tracker */}
                      {hasCrossData && selectedCrossPrices.map((cp) => (
                        <Line
                          key={cp.id}
                          type="monotone"
                          dataKey={cp.platform}
                          name={cp.platform}
                          stroke={PLATFORM_COLORS[cp.platform] ?? "#9a9a9a"}
                          strokeWidth={1.8}
                          dot={false}
                          activeDot={{ r:3, strokeWidth:0 }}
                          connectNulls
                          strokeDasharray={cp.platform === "reliancedigital" ? "5 3" : undefined}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Cross-platform prices panel — shows current price on each platform */}
              {selectedCrossPrices.length > 0 && (
                <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", padding:"18px 20px", marginBottom:20, transition:"background 0.25s,border-color 0.25s" }}>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"var(--muted)", letterSpacing:"0.12em", marginBottom:14, textTransform:"uppercase" }}>
                    Price Comparison — Other Platforms
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12 }}>
                    {selectedCrossPrices.map((cp) => {
                      const isLowest = cp.current_price != null && selectedCrossPrices.every(
                        (other) => other.id === cp.id || !other.current_price || other.current_price >= cp.current_price!
                      ) && (selected.current_price == null || cp.current_price! < selected.current_price);
                      const hitTarget = cp.current_price != null && cp.current_price <= selected.target_price;
                      const platColor = PLATFORM_COLORS[cp.platform] ?? "#9a9a9a";
                      return (
                        <div key={cp.id} style={{
                          background:"var(--bg3)", border:`1px solid ${hitTarget ? "color-mix(in srgb,var(--success) 35%,transparent)" : "var(--border)"}`,
                          padding:"12px 14px", position:"relative",
                        }}>
                          {isLowest && (
                            <div style={{ position:"absolute", top:-1, right:10, background:"var(--success)", color:"#0a0a0a", fontFamily:"'DM Mono',monospace", fontSize:8, fontWeight:700, padding:"2px 8px", letterSpacing:"0.1em" }}>
                              LOWEST
                            </div>
                          )}
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:platColor, letterSpacing:"0.08em", marginBottom:6 }}>
                            {getPlatformLabel(cp.platform)}
                          </div>
                          <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:20, letterSpacing:"-0.5px", color: hitTarget ? "var(--success)" : "var(--text)" }}>
                            {cp.current_price ? formatPrice(cp.current_price) : "—"}
                          </div>
                          {cp.current_price && selected.current_price && (
                            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"var(--muted)", marginTop:4 }}>
                              {cp.current_price < selected.current_price
                                ? `↓ ${formatPrice(selected.current_price - cp.current_price)} cheaper`
                                : cp.current_price > selected.current_price
                                ? `↑ ${formatPrice(cp.current_price - selected.current_price)} more`
                                : "Same price"
                              }
                            </div>
                          )}
                          {hitTarget && (
                            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"var(--success)", marginTop:4, letterSpacing:"0.06em" }}>
                              ✓ TARGET HIT
                            </div>
                          )}
                          <a href={cp.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"var(--muted)", textDecoration:"none", display:"block", marginTop:6, letterSpacing:"0.05em" }}
                          >
                            VIEW ↗
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </>
          )}
        </main>
      </div>

      {/* ── Add Modal — multi-step ──
          The modal stays open whenever:
          - addStep is "form" AND showAddModal is true (normal open)
          - addStep is anything other than "form" (searching / confirm / saving)
          This means once the form submits, the modal never accidentally disappears
          mid-flow even if showAddModal gets reset somewhere.
      ── */}
      {(showAddModal || addStep !== "form") && (
        <div className="db-modal-overlay" onClick={(e) => {
          // Only allow dismiss via click-outside when on the form step
          if (e.target !== e.currentTarget) return;
          if (addStep === "form") resetAddModal();
        }}>
          <div className="db-modal" style={{ maxWidth: addStep === "confirm" ? 640 : 480 }}>

            {/* ── STEP 1: Form ── */}
            {addStep === "form" && showAddModal && (
              <>
                <div className="db-modal-title">Track a product</div>
                <div className="db-modal-sub">
                  Paste a product URL from Amazon, Flipkart, Croma, Reliance Digital, or Poorvika.
                </div>
                {addError && <div className="db-error-msg">⚠ {addError}</div>}
                <form ref={formRef} onSubmit={handleAdd} autoComplete="off">
                  <div className="db-field">
                    <label className="db-label">PRODUCT URL</label>
                    <input className="db-input" type="url" name="url" placeholder="https://www.amazon.in/dp/..." required maxLength={2000} />
                  </div>
                  <div className="db-field">
                    <label className="db-label">PRODUCT NAME (optional)</label>
                    <input className="db-input" type="text" name="name" placeholder="e.g. Sony WH-1000XM5" maxLength={200} />
                  </div>
                  <div className="db-field">
                    <label className="db-label">TARGET PRICE (₹)</label>
                    <input className="db-input" type="number" name="target_price" placeholder="e.g. 22000" min="1" max="9999999" step="1" required />
                  </div>

                  {/* ── Opt-in toggle for cross-platform search ── */}
                  <div
                    onClick={() => setFindOnOthers((v) => !v)}
                    style={{
                      display:"flex", alignItems:"flex-start", gap:12, padding:"14px 16px",
                      background: findOnOthers
                        ? "color-mix(in srgb,var(--accent) 6%,transparent)"
                        : "var(--bg3)",
                      border: `1px solid ${findOnOthers
                        ? "color-mix(in srgb,var(--accent) 30%,transparent)"
                        : "var(--border)"}`,
                      cursor:"pointer", transition:"all 0.18s", marginBottom:18,
                      userSelect:"none",
                    }}
                  >
                    {/* Custom checkbox */}
                    <div style={{
                      width:18, height:18, border:`2px solid ${findOnOthers ? "var(--accent)" : "var(--border2)"}`,
                      background: findOnOthers ? "var(--accent)" : "transparent",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      flexShrink:0, marginTop:1, transition:"all 0.15s",
                    }}>
                      {findOnOthers && <span style={{ color:"var(--accent-fg,#0a0a0a)", fontSize:11, lineHeight:1, fontWeight:700 }}>✓</span>}
                    </div>
                    <div>
                      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color: findOnOthers ? "var(--accent)" : "var(--muted2)", letterSpacing:"0.06em", fontWeight:500, marginBottom:4 }}>
                        FIND ON OTHER PLATFORMS
                      </div>
                      <div style={{ fontSize:12, color:"var(--muted2)", lineHeight:1.6, fontWeight:300 }}>
                        We&apos;ll search Flipkart, Amazon, Croma, Reliance Digital, and Poorvika for the same product and show you prices side-by-side. Gemini AI verifies each match.
                      </div>
                    </div>
                  </div>

                  <div className="db-modal-actions">
                    <button type="button" className="db-btn-cancel" onClick={() => { resetAddModal(); }}>CANCEL</button>
                    <button type="submit" className="db-btn-submit" disabled={isPending}>
                      {isPending ? <><Spinner size={12}/> SAVING…</> : findOnOthers ? "TRACK + FIND ON OTHERS →" : "START TRACKING →"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* ── STEP 2: Searching ── */}
            {addStep === "searching" && (
              <div style={{ textAlign:"center", padding:"36px 20px" }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}><Spinner size={36} /></div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:19, color:"var(--text)", marginBottom:10, letterSpacing:"-0.3px" }}>
                  {findOnOthers ? "Searching other platforms…" : "Saving & scraping product…"}
                </div>
                {findOnOthers && (
                  <>
                    <p style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"var(--muted2)", lineHeight:1.7, marginBottom:16 }}>
                      Scraping your product, then searching Flipkart, Amazon,<br />
                      Croma, Reliance Digital &amp; Poorvika in parallel.<br />
                      <span style={{ color:"var(--accent)" }}>Gemini AI</span> verifies every match.
                    </p>
                    <div style={{ display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap" }}>
                      {["Flipkart","Amazon","Croma","Reliance Digital","Poorvika"].map((p) => (
                        <span key={p} style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"var(--muted)", padding:"3px 10px", border:"1px solid var(--border)", letterSpacing:"0.06em" }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── STEP 3: Confirm cross-platform matches ── */}
            {addStep === "confirm" && (
              <>
                <div className="db-modal-title">Found on other platforms</div>
                <div className="db-modal-sub" style={{ marginBottom:16 }}>
                  Gemini AI analysed each result. Toggle the ones you want to track. All selected platforms will appear in your price history chart.
                </div>

                {/* Source product */}
                <div style={{
                  background:"color-mix(in srgb,var(--accent) 6%,transparent)",
                  border:"1px solid color-mix(in srgb,var(--accent) 25%,transparent)",
                  padding:"10px 14px", marginBottom:14,
                  fontFamily:"'DM Mono',monospace", fontSize:11, borderRadius:2,
                }}>
                  <div style={{ color:"var(--accent)", letterSpacing:"0.1em", marginBottom:5 }}>✓ SOURCE PRODUCT (saved &amp; being scraped)</div>
                  <div style={{ color:"var(--text)", fontWeight:500, fontSize:13, marginBottom:2 }}>
                    {crossSource?.name ?? "Your product"}
                  </div>
                  <div style={{ color:"var(--muted2)" }}>
                    {getPlatformLabel(crossSource?.platform ?? null)} · {formatPrice(crossSource?.price)}
                    {crossSource?.url && (
                      <>
                        &nbsp;·&nbsp;
                        <a href={crossSource.url} target="_blank" rel="noopener noreferrer"
                          style={{ color:"var(--accent)", textDecoration:"none" }}>
                          View ↗
                        </a>
                      </>
                    )}
                  </div>
                </div>

                {/* Candidates */}
                <div style={{ display:"flex", flexDirection:"column", gap:10, maxHeight:360, overflowY:"auto", marginBottom:16, paddingRight:4 }}>
                  {crossCandidates.map((c, idx) => {
                    const confPct   = Math.round(c.confidence * 100);
                    const confColor = c.confidence >= 0.75 ? "var(--success)" : c.confidence >= 0.5 ? "var(--accent)" : "var(--muted2)";
                    const platColor = getPlatformColor(c.platform);

                    // Get a clean display name — strip extremely long names
                    const displayName = c.name
                      ? c.name.length > 70 ? c.name.slice(0, 67) + "…" : c.name
                      : "Product found (name unavailable)";

                    return (
                      <div
                        key={idx}
                        style={{
                          border:`1px solid ${c.selected
                            ? "color-mix(in srgb,var(--accent) 40%,transparent)"
                            : "var(--border)"}`,
                          background: c.selected
                            ? "color-mix(in srgb,var(--accent) 5%,transparent)"
                            : "var(--bg3)",
                          borderRadius:2, overflow:"hidden",
                          transition:"all 0.15s",
                        }}
                      >
                        {/* Top row: checkbox + platform + price — clickable to toggle */}
                        <div
                          onClick={() => setCrossCandidates((prev) =>
                            prev.map((x, i) => i===idx ? {...x, selected:!x.selected} : x)
                          )}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", cursor:"pointer" }}
                        >
                          {/* Checkbox */}
                          <div style={{
                            width:16, height:16, flexShrink:0,
                            border:`2px solid ${c.selected ? "var(--accent)" : "var(--border2)"}`,
                            background: c.selected ? "var(--accent)" : "transparent",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            transition:"all 0.15s",
                          }}>
                            {c.selected && <span style={{ color:"var(--accent-fg,#0a0a0a)", fontSize:10, fontWeight:700 }}>✓</span>}
                          </div>

                          {/* Platform */}
                          <span style={{
                            fontFamily:"'DM Mono',monospace", fontSize:10,
                            color:platColor, border:`1px solid ${platColor}`,
                            padding:"2px 8px", letterSpacing:"0.05em", flexShrink:0,
                          }}>
                            {getPlatformLabel(c.platform)}
                          </span>

                          {/* Price */}
                          <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:17, color:"var(--text)", marginLeft:"auto", flexShrink:0 }}>
                            {formatPrice(c.price)}
                          </span>
                        </div>

                        {/* Product name + link */}
                        <div style={{ padding:"0 12px 10px" }}>
                          <div style={{ fontSize:12, fontWeight:500, color:"var(--text)", marginBottom:6, lineHeight:1.4 }}>
                            {displayName}
                          </div>

                          {/* Confidence bar */}
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                            <div style={{ flex:1, background:"var(--bg2)", height:3, borderRadius:2 }}>
                              <div style={{ width:`${confPct}%`, height:3, background:confColor, borderRadius:2, transition:"width 0.5s" }} />
                            </div>
                            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:confColor, flexShrink:0 }}>
                              {confPct}% match
                            </span>
                          </div>

                          {/* AI reasoning */}
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"var(--muted)", lineHeight:1.5, marginBottom:6 }}>
                            AI: {c.reasoning}
                          </div>

                          {/* Variant warning */}
                          {!c.isSameProduct && (
                            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"var(--accent2)", marginBottom:6, letterSpacing:"0.05em" }}>
                              ⚠ AI suggests this may be a different variant — verify before enabling
                            </div>
                          )}

                          {/* Product URL — clickable so user can verify */}
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display:"flex", alignItems:"center", gap:5,
                              fontFamily:"'DM Mono',monospace", fontSize:10,
                              color:"var(--muted2)", textDecoration:"none",
                              border:"1px solid var(--border)", padding:"4px 10px",
                              transition:"color 0.15s,border-color 0.15s",
                              width:"fit-content",
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--accent)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--muted2)"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)"; }}
                          >
                            <span>OPEN ON {getPlatformLabel(c.platform).toUpperCase()}</span>
                            <span>↗</span>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"var(--muted)", marginBottom:14 }}>
                  {crossCandidates.filter(c=>c.selected).length} of {crossCandidates.length} selected to track
                </div>

                <div className="db-modal-actions">
                  <button type="button" className="db-btn-cancel" onClick={() => handleConfirmCross(false)}>
                    SKIP — SOURCE ONLY
                  </button>
                  <button
                    type="button"
                    className="db-btn-submit"
                    onClick={() => handleConfirmCross(true)}
                    style={{ opacity: crossCandidates.filter(c=>c.selected).length === 0 ? 0.45 : 1 }}
                  >
                    {crossCandidates.filter(c=>c.selected).length === 0
                      ? "SELECT AT LEAST ONE"
                      : `TRACK ${crossCandidates.filter(c=>c.selected).length} PLATFORM${crossCandidates.filter(c=>c.selected).length>1?"S":""} →`}
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 4: Saving ── */}
            {addStep === "saving" && (
              <div style={{ textAlign:"center", padding:"32px 16px" }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}><Spinner size={28} /></div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:16, color:"var(--text)" }}>
                  Saving cross-platform trackers…
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {showEditModal && editProduct && (
        <div className="db-modal-overlay" onClick={(e) => e.target===e.currentTarget && setShowEditModal(false)}>
          <div className="db-modal">
            <div className="db-modal-title">Update target price</div>
            <div className="db-modal-sub">
              Change the alert threshold for <span style={{ color:"var(--text)",fontWeight:500 }}>{editProduct.name || "this product"}</span>.
            </div>
            <form onSubmit={handleEditSave}>
              <div className="db-field">
                <label className="db-label">NEW TARGET PRICE (₹)</label>
                <input className="db-input" type="number" name="target_price" defaultValue={editProduct.target_price} min="1" max="9999999" step="1" required autoFocus />
              </div>
              <div className="db-modal-actions">
                <button type="button" className="db-btn-cancel" onClick={() => { setShowEditModal(false); setEditProduct(null); }}>CANCEL</button>
                <button type="submit" className="db-btn-submit" disabled={isPending}>{isPending ? "SAVING…" : "SAVE →"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}