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
import { formatPrice, getPlatformLabel, getPlatformColor, timeAgo } from "@/lib/utils";
import type { Profile, TrackedProduct, PriceHistory } from "@/types/supabase";

const OnboardingTour = dynamic(() => import("@/components/OnboardingTour"), { ssr: false });
const TourTriggerButton = dynamic(
  () => import("@/components/OnboardingTour").then((m) => ({ default: m.TourTriggerButton })),
  { ssr: false }
);

// ── Types ─────────────────────────────────────────────────────
interface Props {
  profile:    Profile | null;
  products:   TrackedProduct[];
  allHistory: PriceHistory[];
}

interface OptimisticProduct extends TrackedProduct {
  _scraping: boolean;
}

// ── Recharts tooltip ──────────────────────────────────────────
function PriceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#141414", border: "1px solid rgba(255,255,255,0.12)",
      padding: "10px 14px", fontFamily: "'DM Mono',monospace", fontSize: 12,
    }}>
      <div style={{ color: "#6b6b6b", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#e8ff47", fontWeight: 500 }}>{formatPrice(payload[0].value)}</div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────
function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span style={{
      display: "inline-block",
      width: size, height: size,
      border: "2px solid rgba(232,255,71,0.2)",
      borderTopColor: "#e8ff47",
      borderRadius: "50%",
      animation: "ph-spin 0.7s linear infinite",
      flexShrink: 0,
    }} />
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function DashboardClient({
  profile,
  products: initialProducts,
  allHistory: initialHistory,
}: Props) {
  // ── State ──────────────────────────────────────────────────
  const [localProducts, setLocalProducts] = useState<OptimisticProduct[]>(
    initialProducts.map((p) => ({ ...p, _scraping: false }))
  );
  const [localHistory, setLocalHistory] = useState<PriceHistory[]>(initialHistory);

  // BUG FIX: initialise selectedId from localProducts not initialProducts
  // so it always points to the first item in the rendered list.
  const [selectedId,    setSelectedId]    = useState<string | null>(initialProducts[0]?.id ?? null);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editProduct,   setEditProduct]   = useState<OptimisticProduct | null>(null);
  const [addError,      setAddError]      = useState<string | null>(null);
  const [scrapeError,   setScrapeError]   = useState<string | null>(null);
  const [forceTour,     setForceTour]     = useState(false);
  const [isPending,     startTransition]  = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // ── Derived ───────────────────────────────────────────────
  const selected      = localProducts.find((p) => p.id === selectedId) ?? null;
  const history       = localHistory
    .filter((h) => h.product_id === selectedId)
    .map((h) => ({
      date:  new Date(h.scraped_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      price: h.price,
    }));
  const historyPrices = history.map((h) => h.price);
  const allTimeLow    = historyPrices.length ? Math.min(...historyPrices) : null;
  const allTimeHigh   = historyPrices.length ? Math.max(...historyPrices) : null;
  const totalTracked  = localProducts.length;
  const totalAlerts   = localProducts.filter((p) => p.notify_sent).length;
  const activeCount   = localProducts.filter((p) => p.is_active).length;

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : profile?.email?.[0]?.toUpperCase() ?? "?";

  // ── scrapeNow ─────────────────────────────────────────────
  // Calls POST /api/scrape then updates local state in-place —
  // no page refresh needed. The price card updates live.
  const scrapeNow = useCallback(async (productId: string) => {
    setScrapeError(null);

    // Ensure spinner is shown for this product
    setLocalProducts((prev) =>
      prev.map((p) => p.id === productId ? { ...p, _scraping: true } : p)
    );

    try {
      const res  = await fetch("/api/scrape", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ productId }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setScrapeError(data.error ?? "Scrape failed — will retry on the next cron run.");
        // Turn off spinner but keep the product in the list
        setLocalProducts((prev) =>
          prev.map((p) => p.id === productId ? { ...p, _scraping: false } : p)
        );
        return;
      }

      // ── Update price + metadata in local state immediately ──
      setLocalProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                _scraping:     false,
                current_price: data.price    ?? p.current_price,
                name:          data.name     ?? p.name,
                image_url:     data.imageUrl ?? p.image_url,
              }
            : p
        )
      );

      // Append a new history point so the chart updates immediately
      if (data.price) {
        setLocalHistory((prev) => [
          ...prev,
          {
            id:         `opt-${Date.now()}`,
            product_id: productId,
            price:      data.price,
            scraped_at: new Date().toISOString(),
          },
        ]);
      }

      // Revalidate server cache so a hard-refresh also shows the right data
      await revalidateDashboard();
    } catch {
      setScrapeError("Network error — could not reach the scrape endpoint.");
      setLocalProducts((prev) =>
        prev.map((p) => p.id === productId ? { ...p, _scraping: false } : p)
      );
    }
  }, []);

  // ── handleAdd ────────────────────────────────────────────
  // KEY FIX:
  //   1. Build the optimistic product object before any async work.
  //   2. Call setLocalProducts + setSelectedId SYNCHRONOUSLY and
  //      OUTSIDE startTransition so React flushes them immediately.
  //   3. Only the server action (addProduct) goes inside startTransition.
  //   4. scrapeNow runs after the server action resolves, updating
  //      the already-selected product's price in-place.
  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAddError(null);

    const fd  = new FormData(e.currentTarget);
    const url = fd.get("url") as string;

    // Generate a temporary ID so we can select the row immediately
    const tempId = `temp-${Date.now()}`;

    const optimistic: OptimisticProduct = {
      id:            tempId,
      user_id:       profile?.id ?? "",
      url,
      name:          (fd.get("name") as string) || null,
      image_url:     null,
      platform:      null,
      target_price:  parseFloat(fd.get("target_price") as string),
      current_price: null,
      is_active:     true,
      notify_sent:   false,
      created_at:    new Date().toISOString(),
      updated_at:    new Date().toISOString(),
      _scraping:     true,
    };

    // ── STEP 1: Close modal + show new product IMMEDIATELY ──
    // These run synchronously before any async work so the UI
    // switches to the new product's detail view right away.
    setShowAddModal(false);
    formRef.current?.reset();
    setLocalProducts((prev) => [optimistic, ...prev]);
    setSelectedId(tempId);

    // ── STEP 2: Persist to DB (server action) ───────────────
    let realProductId: string;
    try {
      const result = await addProduct(fd);
      if (result?.error) {
        setAddError(result.error);
        // Roll back the optimistic row
        setLocalProducts((prev) => prev.filter((p) => p.id !== tempId));
        setSelectedId(localProducts[0]?.id ?? null);
        setShowAddModal(true);
        return;
      }
      realProductId = result.productId!;
    } catch {
      setAddError("Failed to save product. Please try again.");
      setLocalProducts((prev) => prev.filter((p) => p.id !== tempId));
      setSelectedId(localProducts[0]?.id ?? null);
      setShowAddModal(true);
      return;
    }

    // ── STEP 3: Swap tempId → real DB id ───────────────────
    // We do this before scraping so the scrape API gets the real id.
    setLocalProducts((prev) =>
      prev.map((p) => p.id === tempId ? { ...p, id: realProductId } : p)
    );
    setSelectedId(realProductId);

    // ── STEP 4: Scrape immediately — price updates in-place ─
    await scrapeNow(realProductId);
  };

  // ── handleDelete ─────────────────────────────────────────
  const handleDelete = (id: string) => {
    const remaining = localProducts.filter((p) => p.id !== id);
    setLocalProducts(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
    startTransition(async () => { await deleteProduct(id); });
  };

  // ── handleToggle ─────────────────────────────────────────
  const handleToggle = (id: string, isActive: boolean) => {
    setLocalProducts((prev) =>
      prev.map((p) => p.id === id ? { ...p, is_active: !isActive } : p)
    );
    startTransition(async () => { await toggleProduct(id, isActive); });
  };

  // ── handleEditSave ───────────────────────────────────────
  const handleEditSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editProduct) return;
    const fd       = new FormData(e.currentTarget);
    const newPrice = parseFloat(fd.get("target_price") as string);
    setLocalProducts((prev) =>
      prev.map((p) => p.id === editProduct.id ? { ...p, target_price: newPrice, notify_sent: false } : p)
    );
    setShowEditModal(false);
    setEditProduct(null);
    startTransition(async () => { await updateTargetPrice(editProduct.id, newPrice); });
  };

  return (
    <>
      <style>{`
        /* ── DashboardClient layout styles only ─────────────────
           Global vars + fonts are injected by ThemeProvider.     */

        @keyframes ph-spin    { to { transform:rotate(360deg); } }
        @keyframes ph-pulse   { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes shimmer    { to { background-position:-200% 0; } }
        @keyframes modalIn    { from{opacity:0;transform:scale(0.97) translateY(8px)} to{opacity:1;transform:none} }
        @keyframes slideInTop { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }

        /* ── Outer wrapper fills the viewport below the nav ── */
        .db-wrap {
          display: flex;
          height: calc(100vh - 52px);
          overflow: hidden;           /* critical — stops outer scroll */
          background: var(--bg);
        }

        /* ── Sidebar — fixed in place, never scrolls with page ── */
        .db-sidebar {
          width: 260px;
          min-width: 260px;
          flex-shrink: 0;
          height: 100%;               /* fills db-wrap exactly */
          display: flex;
          flex-direction: column;
          background: var(--bg2);
          border-right: 1px solid var(--border);
          transition: background 0.25s, border-color 0.25s;
          /* No overflow here — children manage their own scroll */
        }

        .db-sidebar-top {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;             /* never shrinks — always visible */
        }

        .db-sidebar-label {
          padding: 16px 20px 8px;
          font-family: 'DM Mono', monospace; font-size: 10px;
          color: var(--muted); letter-spacing: 0.12em; text-transform: uppercase;
          flex-shrink: 0;
        }

        /* ── Product list — the ONLY scrolling part of the sidebar ── */
        .db-product-list {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0 12px 12px;
          /* Custom scrollbar */
          scrollbar-width: thin;
          scrollbar-color: var(--scrollbar-thumb) transparent;
        }
        .db-product-list::-webkit-scrollbar { width: 4px; }
        .db-product-list::-webkit-scrollbar-track { background: transparent; }
        .db-product-list::-webkit-scrollbar-thumb {
          background: var(--scrollbar-thumb);
          border-radius: 4px;
        }
        .db-product-list::-webkit-scrollbar-thumb:hover {
          background: var(--scrollbar-thumb-hover);
        }

        .db-sidebar-bottom {
          padding: 16px 20px;
          border-top: 1px solid var(--border);
          flex-shrink: 0;             /* always visible at bottom of sidebar */
          background: var(--bg2);
          transition: background 0.25s, border-color 0.25s;
        }

        /* ── Main content — scrolls independently of sidebar ── */
        .db-main {
          flex: 1;
          min-width: 0;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 28px;
          /* Hide scrollbar but keep scroll functionality */
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .db-main::-webkit-scrollbar { display: none; }

        /* ── Product list items ── */
        .db-add-btn {
          width: 100%; background: var(--accent); color: #0a0a0a;
          border: none; cursor: pointer;
          font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500;
          padding: 10px 16px; letter-spacing: 0.08em;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.2s, transform 0.15s;
        }
        .db-add-btn:hover { background: #d4eb30; transform: translateY(-1px); }

        .db-product-item {
          padding: 10px; border: 1px solid transparent; border-radius: 4px;
          cursor: pointer; transition: all 0.15s; margin-bottom: 4px; position: relative;
        }
        .db-product-item:hover  { background: rgba(255,255,255,0.03); border-color: var(--border); }
        .db-product-item.active { background: rgba(232,255,71,0.05); border-color: rgba(232,255,71,0.2); }
        .db-product-item-name {
          font-size: 12px; font-weight: 500; color: var(--text); margin-bottom: 4px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 185px;
        }
        .db-product-item-meta  { display: flex; align-items: center; gap: 6px; }
        .db-platform-dot       { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
        .db-product-item-price { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted2); }
        .db-product-item-status {
          position: absolute; top: 10px; right: 10px;
          width: 6px; height: 6px; border-radius: 50%;
        }

        /* ── User section ── */
        .db-user       { display: flex; align-items: center; gap: 10px; }
        .db-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: rgba(232,255,71,0.1); border: 1px solid rgba(232,255,71,0.2);
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500;
          color: var(--accent); flex-shrink: 0;
        }
        .db-user-info  { flex: 1; overflow: hidden; }
        .db-user-name  { font-size: 12px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .db-user-email { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .db-signout-btn {
          background: none; border: none; cursor: pointer;
          font-family: 'DM Mono', monospace; font-size: 10px;
          color: var(--muted); padding: 4px; transition: color 0.2s;
        }
        .db-signout-btn:hover { color: var(--danger); }

        /* ── Guide button row ── */
        .db-guide-row {
          display: flex; justify-content: flex-end; margin-bottom: 20px;
        }

        /* ── Stats ── */
        .db-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 28px; }
        .db-stat-card  { background: var(--bg2); border: 1px solid var(--border); padding: 16px 18px; transition: background 0.25s, border-color 0.25s; }
        .db-stat-label { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); letter-spacing: 0.1em; margin-bottom: 8px; }
        .db-stat-value { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 24px; letter-spacing: -1px; color: var(--text); }
        .db-stat-sub   { font-size: 11px; color: var(--muted); margin-top: 4px; }

        /* ── Banners ── */
        .db-scrape-banner {
          display: flex; align-items: center; gap: 12px;
          background: rgba(232,255,71,0.05); border: 1px solid rgba(232,255,71,0.2);
          padding: 12px 16px; margin-bottom: 20px;
          font-family: 'DM Mono', monospace; font-size: 12px; color: var(--accent);
          animation: slideInTop 0.25s ease, ph-pulse 1.8s ease-in-out 0.25s infinite;
        }
        .db-scrape-error {
          display: flex; align-items: center; gap: 10px;
          background: rgba(248,113,113,0.07); border: 1px solid rgba(248,113,113,0.25);
          padding: 12px 16px; margin-bottom: 20px;
          font-family: 'DM Mono', monospace; font-size: 12px; color: var(--danger);
          animation: slideInTop 0.2s ease;
        }

        /* ── Empty state ── */
        .db-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 80px 32px; text-align: center; }
        .db-empty-icon  { width: 64px; height: 64px; border: 1px solid var(--border2); display: flex; align-items: center; justify-content: center; font-size: 28px; }
        .db-empty-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 22px; letter-spacing: -0.5px; color: var(--text); }
        .db-empty-sub   { font-size: 14px; color: var(--muted2); font-weight: 300; max-width: 320px; line-height: 1.6; }

        /* ── Detail ── */
        .db-detail-header   { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .db-detail-name     { font-family: 'Syne', sans-serif; font-weight: 700; font-size: clamp(18px,2vw,26px); letter-spacing: -0.5px; line-height: 1.2; color: var(--text); }
        .db-detail-actions  { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
        .db-icon-btn {
          background: var(--bg2); border: 1px solid var(--border2); color: var(--muted2); cursor: pointer;
          padding: 8px 12px; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.05em;
          transition: all 0.2s; display: flex; align-items: center; gap: 6px;
        }
        .db-icon-btn:hover        { border-color: rgba(255,255,255,0.25); color: var(--text); }
        .db-icon-btn.danger:hover { border-color: var(--danger); color: var(--danger); }
        .db-icon-btn.accent       { border-color: rgba(232,255,71,0.3); color: var(--accent); }
        .db-icon-btn.accent:hover { background: rgba(232,255,71,0.05); }
        .db-icon-btn:disabled     { opacity: 0.4; cursor: not-allowed; pointer-events: none; }

        /* ── Price cards ── */
        .db-price-cards      { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
        .db-price-card       { background: var(--bg2); border: 1px solid var(--border); padding: 14px 16px; position: relative; overflow: hidden; transition: background 0.25s, border-color 0.25s; }
        .db-price-card-label { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); letter-spacing: 0.1em; margin-bottom: 8px; }
        .db-price-card-value { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: -0.5px; min-height: 28px; display: flex; align-items: center; gap: 8px; }
        .db-price-card-sub   { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); margin-top: 4px; }

        .db-skeleton {
          height: 24px; width: 80px; border-radius: 2px;
          background: linear-gradient(90deg, var(--bg3) 25%, rgba(255,255,255,0.05) 50%, var(--bg3) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.3s infinite;
        }

        /* ── Chart ── */
        .db-chart-section { background: var(--bg2); border: 1px solid var(--border); padding: 20px; margin-bottom: 24px; transition: background 0.25s, border-color 0.25s; }
        .db-chart-header  { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .db-chart-title   { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; }
        .db-chart-legend  { display: flex; gap: 16px; }
        .db-chart-legend-item { display: flex; align-items: center; gap: 6px; font-family: 'DM Mono', monospace; font-size: 10px; color: var(--muted); }
        .db-chart-legend-line { width: 20px; height: 2px; }
        .db-no-history { height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; font-family: 'DM Mono', monospace; font-size: 12px; color: var(--muted); }

        /* ── Badges ── */
        .db-badge        { display: inline-flex; align-items: center; gap: 5px; font-family: 'DM Mono', monospace; font-size: 10px; padding: 3px 8px; border: 1px solid var(--border); color: var(--muted2); }
        .db-status-badge { display: inline-flex; align-items: center; gap: 5px; font-family: 'DM Mono', monospace; font-size: 10px; padding: 3px 10px; }
        .db-status-active  { background: rgba(110,231,183,0.08); color: var(--success); border: 1px solid rgba(110,231,183,0.2); }
        .db-status-paused  { background: rgba(107,107,107,0.08); color: var(--muted2); border: 1px solid var(--border); }
        .db-status-hit     { background: rgba(232,255,71,0.08); color: var(--accent); border: 1px solid rgba(232,255,71,0.2); }
        .db-status-loading { background: rgba(232,255,71,0.05); color: var(--accent); border: 1px solid rgba(232,255,71,0.15); animation: ph-pulse 1.5s ease-in-out infinite; }

        /* ── Modal ── */
        .db-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.75);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 500; padding: 24px;
        }
        .db-modal        { background: var(--bg2); border: 1px solid var(--border2); padding: 32px; width: 100%; max-width: 480px; animation: modalIn 0.2s ease; }
        .db-modal-title  { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: -0.5px; margin-bottom: 6px; color: var(--text); }
        .db-modal-sub    { font-size: 13px; color: var(--muted2); margin-bottom: 28px; font-weight: 300; line-height: 1.5; }
        .db-field        { margin-bottom: 18px; }
        .db-label        { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--muted2); letter-spacing: 0.08em; display: block; margin-bottom: 8px; }
        .db-input        { width: 100%; background: var(--bg3); border: 1px solid var(--border2); color: var(--text); padding: 11px 14px; font-family: 'DM Mono', monospace; font-size: 13px; outline: none; transition: border-color 0.2s; }
        .db-input:focus  { border-color: rgba(232,255,71,0.4); }
        .db-input::placeholder { color: var(--muted); }
        .db-modal-actions { display: flex; gap: 10px; margin-top: 24px; }
        .db-btn-submit   { flex: 1; background: var(--accent); color: #0a0a0a; border: none; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500; padding: 12px; letter-spacing: 0.08em; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .db-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .db-btn-submit:hover:not(:disabled) { background: #d4eb30; }
        .db-btn-cancel   { background: transparent; color: var(--muted2); border: 1px solid var(--border2); cursor: pointer; font-family: 'DM Mono', monospace; font-size: 12px; padding: 12px 20px; letter-spacing: 0.08em; transition: all 0.2s; }
        .db-btn-cancel:hover { color: var(--text); border-color: rgba(255,255,255,0.25); }
        .db-error-msg    { background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.3); color: var(--danger); font-family: 'DM Mono', monospace; font-size: 11px; padding: 10px 14px; margin-bottom: 16px; }

        /* ── Responsive ── */
        @media (max-width: 1100px) {
          .db-stats, .db-price-cards { grid-template-columns: repeat(2,1fr); }
        }
        @media (max-width: 768px) {
          .db-sidebar { display: none; }
          .db-main    { padding: 20px; }
          .db-wrap    { height: auto; }
          .db-main    { height: auto; overflow-y: visible; }
        }
      `}</style>

      <OnboardingTour forceStart={forceTour} onFinish={() => setForceTour(false)} />

      <div className="db-wrap">

        {/* ── Sidebar ── */}
        <aside className="db-sidebar">
          <div className="db-sidebar-top">
            <button className="db-add-btn" onClick={() => setShowAddModal(true)}>
              + TRACK NEW PRODUCT
            </button>
          </div>

          <div className="db-sidebar-label">Tracked ({localProducts.length})</div>

          <div className="db-product-list">
            {localProducts.length === 0 && (
              <p style={{ padding: "16px 10px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                No products yet.
              </p>
            )}
            {localProducts.map((p) => {
              const isHit = !p._scraping && p.current_price != null && p.current_price <= p.target_price;
              let hostname = p.url;
              try { hostname = new URL(p.url).hostname.replace("www.", ""); } catch {}

              return (
                <div
                  key={p.id}
                  className={`db-product-item${selectedId === p.id ? " active" : ""}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  {/* Status dot / spinner */}
                  {p._scraping
                    ? <div style={{ position: "absolute", top: 10, right: 10 }}><Spinner size={8} /></div>
                    : <div className="db-product-item-status" style={{ background: isHit ? "var(--accent)" : p.is_active ? "var(--success)" : "var(--muted)" }} />
                  }
                  <div className="db-product-item-name">{p.name || hostname}</div>
                  <div className="db-product-item-meta">
                    <div className="db-platform-dot" style={{ background: getPlatformColor(p.platform) }} />
                    <div className="db-product-item-price">
                      {p._scraping
                        ? <span style={{ color: "var(--accent)", animation: "ph-pulse 1.5s infinite" }}>scraping…</span>
                        : <>{p.current_price ? formatPrice(p.current_price) : "—"} → <span style={{ color: "var(--accent)" }}>{formatPrice(p.target_price)}</span></>
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="db-sidebar-bottom">
            <div className="db-user">
              <Link href="/profile" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, overflow: "hidden", textDecoration: "none" }}>
                <div className="db-avatar">{initials}</div>
                <div className="db-user-info">
                  <div className="db-user-name">{profile?.full_name ?? "User"}</div>
                  <div className="db-user-email" style={{ color: "var(--accent)" }}>{profile?.email}</div>
                </div>
              </Link>
              <form action="/auth/signout" method="POST">
                <button type="submit" className="db-signout-btn" title="Sign out">↪</button>
              </form>
            </div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="db-main">
          {/* Guide button */}
          <div className="db-guide-row">
            <TourTriggerButton onClick={() => {
              localStorage.removeItem("pricehound_tour_seen");
              setForceTour(true);
            }} />
          </div>

          {/* Scraping in-progress banner */}
          {localProducts.some((p) => p._scraping) && (
            <div className="db-scrape-banner">
              <Spinner size={14} />
              Fetching current price — this takes 10–30 seconds…
            </div>
          )}

          {/* Scrape error banner */}
          {scrapeError && (
            <div className="db-scrape-error">
              ⚠ {scrapeError}
              <button
                onClick={() => setScrapeError(null)}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
              >✕</button>
            </div>
          )}

          {/* Stats */}
          <div className="db-stats">
            <div className="db-stat-card">
              <div className="db-stat-label">TOTAL TRACKED</div>
              <div className="db-stat-value">{totalTracked}</div>
              <div className="db-stat-sub">{activeCount} active</div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-label">ALERTS SENT</div>
              <div className="db-stat-value" style={{ color: "var(--accent)" }}>{totalAlerts}</div>
              <div className="db-stat-sub">price targets hit</div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-label">PRICE CHECKS</div>
              <div className="db-stat-value">{localHistory.length}</div>
              <div className="db-stat-sub">data points collected</div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-label">PAUSED</div>
              <div className="db-stat-value">{totalTracked - activeCount}</div>
              <div className="db-stat-sub">products paused</div>
            </div>
          </div>

          {/* Empty state */}
          {localProducts.length === 0 && (
            <div className="db-empty">
              <div className="db-empty-icon">🔍</div>
              <div className="db-empty-title">Nothing tracked yet.</div>
              <p className="db-empty-sub">Add a product URL and your target price. We&apos;ll watch it and email you when it drops.</p>
              <button className="db-add-btn" style={{ width: "auto", padding: "12px 28px" }} onClick={() => setShowAddModal(true)}>
                + TRACK YOUR FIRST PRODUCT
              </button>
            </div>
          )}

          {/* ── Product detail ── */}
          {selected && (
            <>
              {/* Header */}
              <div className="db-detail-header">
                <div style={{ overflow: "hidden", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <div className="db-badge" style={{ borderColor: getPlatformColor(selected.platform), color: getPlatformColor(selected.platform) }}>
                      {getPlatformLabel(selected.platform)}
                    </div>
                    <div className={`db-status-badge ${
                      selected._scraping              ? "db-status-loading"
                      : selected.current_price != null && selected.current_price <= selected.target_price ? "db-status-hit"
                      : selected.is_active            ? "db-status-active"
                      : "db-status-paused"
                    }`}>
                      {selected._scraping ? (
                        <><Spinner size={8} /> SCRAPING</>
                      ) : (
                        <>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                          {selected.current_price != null && selected.current_price <= selected.target_price ? "TARGET HIT" : selected.is_active ? "TRACKING" : "PAUSED"}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="db-detail-name">
                    {selected._scraping && !selected.name ? "Fetching product info…" : selected.name || "Unnamed Product"}
                  </div>

                  <a
                    href={selected.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--muted)", textDecoration: "none", display: "block", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500 }}
                    title={selected.url}
                  >{selected.url}</a>

                  <div style={{ marginTop: 6, fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--muted)" }}>
                    added {timeAgo(selected.created_at)}
                  </div>
                </div>

                <div className="db-detail-actions">
                  <button
                    className="db-icon-btn accent"
                    onClick={() => { setEditProduct(selected); setShowEditModal(true); }}
                    disabled={selected._scraping}
                  >✎ EDIT TARGET</button>

                  <button
                    className="db-icon-btn"
                    onClick={() => scrapeNow(selected.id)}
                    disabled={selected._scraping || isPending}
                    title="Re-scrape now"
                  >
                    {selected._scraping ? <><Spinner size={11} /> SCRAPING</> : "↻ REFRESH"}
                  </button>

                  <button
                    className="db-icon-btn"
                    onClick={() => handleToggle(selected.id, selected.is_active)}
                    disabled={selected._scraping || isPending}
                  >
                    {selected.is_active ? "⏸ PAUSE" : "▶ RESUME"}
                  </button>

                  <button
                    className="db-icon-btn danger"
                    onClick={() => handleDelete(selected.id)}
                    disabled={isPending}
                  >✕ DELETE</button>
                </div>
              </div>

              {/* Price cards */}
              <div className="db-price-cards">
                {/* Current price */}
                <div className="db-price-card">
                  <div className="db-price-card-label">CURRENT PRICE</div>
                  <div className="db-price-card-value">
                    {selected._scraping && !selected.current_price
                      ? <><Spinner size={16} /><span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "var(--muted)" }}>fetching…</span></>
                      : <span style={{ color: selected.current_price != null && selected.current_price <= selected.target_price ? "var(--success)" : "var(--text)" }}>
                          {formatPrice(selected.current_price)}
                        </span>
                    }
                  </div>
                  <div className="db-price-card-sub">
                    {selected._scraping ? "scraping live price…" : "last scraped"}
                  </div>
                </div>

                {/* Target */}
                <div className="db-price-card">
                  <div className="db-price-card-label">YOUR TARGET</div>
                  <div className="db-price-card-value" style={{ color: "var(--accent)" }}>
                    {formatPrice(selected.target_price)}
                  </div>
                  <div className="db-price-card-sub">
                    {!selected._scraping && selected.current_price != null
                      ? selected.current_price > selected.target_price
                        ? `${formatPrice(selected.current_price - selected.target_price)} away`
                        : "✓ target reached"
                      : "set by you"
                    }
                  </div>
                </div>

                {/* All-time low */}
                <div className="db-price-card">
                  <div className="db-price-card-label">ALL-TIME LOW</div>
                  <div className="db-price-card-value">
                    {selected._scraping && allTimeLow === null
                      ? <div className="db-skeleton" />
                      : <span style={{ color: "var(--success)" }}>{formatPrice(allTimeLow)}</span>
                    }
                  </div>
                  <div className="db-price-card-sub">since tracking</div>
                </div>

                {/* All-time high */}
                <div className="db-price-card">
                  <div className="db-price-card-label">ALL-TIME HIGH</div>
                  <div className="db-price-card-value">
                    {selected._scraping && allTimeHigh === null
                      ? <div className="db-skeleton" />
                      : <span style={{ color: "var(--accent2)" }}>{formatPrice(allTimeHigh)}</span>
                    }
                  </div>
                  <div className="db-price-card-sub">since tracking</div>
                </div>
              </div>

              {/* Chart */}
              <div className="db-chart-section">
                <div className="db-chart-header">
                  <div className="db-chart-title">PRICE HISTORY</div>
                  <div className="db-chart-legend">
                    <div className="db-chart-legend-item">
                      <div className="db-chart-legend-line" style={{ background: "#e8ff47" }} /> Price
                    </div>
                    <div className="db-chart-legend-item">
                      <div className="db-chart-legend-line" style={{ borderTop: "2px dashed #ff6b35", height: 0 }} /> Target
                    </div>
                  </div>
                </div>

                {selected._scraping && history.length === 0 ? (
                  <div className="db-no-history">
                    <Spinner size={28} />
                    <span>Scraping — price history will appear here shortly…</span>
                  </div>
                ) : history.length === 0 ? (
                  <div className="db-no-history">No price data yet — check back after the next cron run.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: "#6b6b6b" }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: "#6b6b6b" }}
                        axisLine={false} tickLine={false}
                        tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
                        width={50}
                      />
                      <Tooltip content={<PriceTooltip />} />
                      <ReferenceLine
                        y={selected.target_price}
                        stroke="#ff6b35" strokeDasharray="6 4" strokeWidth={1.5} opacity={0.7}
                        label={{ value: "Target", fill: "#ff6b35", fontSize: 10, fontFamily: "'DM Mono',monospace", position: "insideTopRight" }}
                      />
                      <Line
                        type="monotone" dataKey="price" stroke="#e8ff47" strokeWidth={2}
                        dot={false} activeDot={{ r: 4, fill: "#e8ff47", strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── Add Modal ── */}
      {showAddModal && (
        <div className="db-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="db-modal">
            <div className="db-modal-title">Track a product</div>
            <div className="db-modal-sub">
              Paste a product URL from Amazon, Flipkart, or Myntra. We&apos;ll fetch the current price straight away.
            </div>
            {addError && <div className="db-error-msg">⚠ {addError}</div>}
            <form ref={formRef} onSubmit={handleAdd}>
              <div className="db-field">
                <label className="db-label">PRODUCT URL</label>
                <input className="db-input" type="url" name="url" placeholder="https://www.amazon.in/dp/..." required />
              </div>
              <div className="db-field">
                <label className="db-label">PRODUCT NAME (optional)</label>
                <input className="db-input" type="text" name="name" placeholder="e.g. Sony WH-1000XM5" />
              </div>
              <div className="db-field">
                <label className="db-label">TARGET PRICE (₹)</label>
                <input className="db-input" type="number" name="target_price" placeholder="e.g. 22000" min="1" step="1" required />
              </div>
              <div className="db-modal-actions">
                <button type="button" className="db-btn-cancel" onClick={() => { setShowAddModal(false); setAddError(null); }}>
                  CANCEL
                </button>
                <button type="submit" className="db-btn-submit" disabled={isPending}>
                  {isPending ? <><Spinner size={12} /> SAVING…</> : "START TRACKING →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Target Modal ── */}
      {showEditModal && editProduct && (
        <div className="db-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowEditModal(false)}>
          <div className="db-modal">
            <div className="db-modal-title">Update target price</div>
            <div className="db-modal-sub">
              Change the alert threshold for{" "}
              <span style={{ color: "var(--text)", fontWeight: 500 }}>{editProduct.name || "this product"}</span>.
            </div>
            <form onSubmit={handleEditSave}>
              <div className="db-field">
                <label className="db-label">NEW TARGET PRICE (₹)</label>
                <input
                  className="db-input" type="number" name="target_price"
                  defaultValue={editProduct.target_price} min="1" step="1" required autoFocus
                />
              </div>
              <div className="db-modal-actions">
                <button type="button" className="db-btn-cancel" onClick={() => { setShowEditModal(false); setEditProduct(null); }}>
                  CANCEL
                </button>
                <button type="submit" className="db-btn-submit" disabled={isPending}>
                  {isPending ? "SAVING…" : "SAVE →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}