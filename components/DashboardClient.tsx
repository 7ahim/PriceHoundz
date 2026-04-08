"use client";

import { useState, useTransition, useRef } from "react";
import dynamic from "next/dynamic";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { addProduct, deleteProduct, toggleProduct, updateTargetPrice } from "@/lib/actions";
import { formatPrice, getPlatformLabel, getPlatformColor, timeAgo } from "@/lib/utils";
import type { Profile, TrackedProduct, PriceHistory } from "@/types/supabase";

// Dynamically import the tour so it never SSR-renders
// (Joyride uses window/localStorage)
const OnboardingTour = dynamic(() => import("@/components/OnboardingTour"), { ssr: false });
const TourTriggerButton = dynamic(
  () => import("@/components/OnboardingTour").then((m) => ({ default: m.TourTriggerButton })),
  { ssr: false }
);

// ── Types ─────────────────────────────────────────────────────
interface Props {
  profile: Profile | null;
  products: TrackedProduct[];
  allHistory: PriceHistory[];
}

// ── Custom Recharts tooltip ───────────────────────────────────
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

// ── Main component ────────────────────────────────────────────
export default function DashboardClient({ profile, products, allHistory }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(products[0]?.id ?? null);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editProduct, setEditProduct]     = useState<TrackedProduct | null>(null);
  const [addError, setAddError]           = useState<string | null>(null);
  const [forceTour, setForceTour]         = useState(false);
  const [isPending, startTransition]      = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const selected     = products.find((p) => p.id === selectedId) ?? null;
  const history      = allHistory
    .filter((h) => h.product_id === selectedId)
    .map((h) => ({
      date:  new Date(h.scraped_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      price: h.price,
    }));
  const historyPrices = history.map((h) => h.price);
  const allTimeLow    = historyPrices.length ? Math.min(...historyPrices) : null;
  const allTimeHigh   = historyPrices.length ? Math.max(...historyPrices) : null;
  const totalTracked  = products.length;
  const totalAlerts   = products.filter((p) => p.notify_sent).length;
  const activeCount   = products.filter((p) => p.is_active).length;

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : profile?.email?.[0]?.toUpperCase() ?? "?";

  // ── Handlers ────────────────────────────────────────────────
  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAddError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addProduct(fd);
      if (result?.error) { setAddError(result.error); return; }

      if (result?.product?.id) {
        await fetch("/api/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productId: result.product.id,
          }),
        });
      }
      setShowAddModal(false);
      formRef.current?.reset();
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteProduct(id);
      if (selectedId === id)
        setSelectedId(products.find((p) => p.id !== id)?.id ?? null);
    });
  };

  const handleToggle = (id: string, isActive: boolean) => {
    startTransition(async () => { await toggleProduct(id, isActive); });
  };

  const handleEditSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editProduct) return;
    const fd       = new FormData(e.currentTarget);
    const newPrice = parseFloat(fd.get("target_price") as string);
    startTransition(async () => {
      await updateTargetPrice(editProduct.id, newPrice);
      setShowEditModal(false);
      setEditProduct(null);
    });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --bg:#0a0a0a; --bg2:#111111; --bg3:#181818;
          --border:rgba(255,255,255,0.08); --border2:rgba(255,255,255,0.14);
          --accent:#e8ff47; --accent2:#ff6b35;
          --text:#f0ede8; --muted:#6b6b6b; --muted2:#9a9a9a;
          --success:#6ee7b7; --danger:#f87171;
        }
        body { background:var(--bg); color:var(--text); font-family:'DM Sans',sans-serif; }

        .db-wrap { display:flex; min-height:100vh; width:100%; }

        /* ── Sidebar ── */
        .db-sidebar {
          width:260px; min-width:260px; background:var(--bg2);
          border-right:1px solid var(--border);
          display:flex; flex-direction:column;
          position:sticky; top:0; height:100vh; overflow-y:auto;
        }
        .db-sidebar-top { padding:24px 20px 16px; border-bottom:1px solid var(--border); }
        .db-logo {
          font-family:'Syne',sans-serif; font-weight:800; font-size:18px;
          display:flex; align-items:center; gap:8px;
          color:var(--text); text-decoration:none; margin-bottom:20px;
        }
        .db-logo-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
        .db-logo-dot { width:7px; height:7px; background:var(--accent); border-radius:50%; }
        .db-add-btn {
          width:100%; background:var(--accent); color:#0a0a0a;
          border:none; cursor:pointer;
          font-family:'DM Mono',monospace; font-size:11px; font-weight:500;
          padding:10px 16px; letter-spacing:0.08em;
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition:background 0.2s, transform 0.15s;
        }
        .db-add-btn:hover { background:#d4eb30; transform:translateY(-1px); }
        .db-sidebar-label {
          padding:16px 20px 8px;
          font-family:'DM Mono',monospace; font-size:10px;
          color:var(--muted); letter-spacing:0.12em; text-transform:uppercase;
        }
        .db-product-list { flex:1; overflow-y:auto; padding:0 12px 12px; }
        .db-product-item {
          padding:10px; border:1px solid transparent; border-radius:4px;
          cursor:pointer; transition:all 0.15s; margin-bottom:4px; position:relative;
        }
        .db-product-item:hover { background:rgba(255,255,255,0.03); border-color:var(--border); }
        .db-product-item.active { background:rgba(232,255,71,0.05); border-color:rgba(232,255,71,0.2); }
        .db-product-item-name {
          font-size:12px; font-weight:500; color:var(--text); margin-bottom:4px;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;
        }
        .db-product-item-meta { display:flex; align-items:center; gap:6px; }
        .db-platform-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }
        .db-product-item-price { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted2); }
        .db-product-item-status { position:absolute; top:10px; right:10px; width:6px; height:6px; border-radius:50%; }
        .db-sidebar-bottom { padding:16px 20px; border-top:1px solid var(--border); }
        .db-user { display:flex; align-items:center; gap:10px; }
        .db-avatar {
          width:32px; height:32px; border-radius:50%;
          background:rgba(232,255,71,0.1); border:1px solid rgba(232,255,71,0.2);
          display:flex; align-items:center; justify-content:center;
          font-family:'DM Mono',monospace; font-size:11px; font-weight:500;
          color:var(--accent); flex-shrink:0;
        }
        .db-user-info { flex:1; overflow:hidden; }
        .db-user-name  { font-size:12px; font-weight:500; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .db-user-email { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .db-signout-btn { background:none; border:none; cursor:pointer; font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); padding:4px; transition:color 0.2s; }
        .db-signout-btn:hover { color:var(--danger); }

        /* ── Main ── */
        .db-main { flex:1; overflow-y:auto; padding:32px; }
        .db-topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; }
        .db-topbar-title { font-family:'Syne',sans-serif; font-weight:700; font-size:20px; letter-spacing:-0.5px; }
        .db-topbar-right { display:flex; align-items:center; gap:10px; }

        /* ── Stats ── */
        .db-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:28px; }
        .db-stat-card { background:var(--bg2); border:1px solid var(--border); padding:16px 18px; }
        .db-stat-label { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.1em; margin-bottom:8px; }
        .db-stat-value { font-family:'Syne',sans-serif; font-weight:700; font-size:24px; letter-spacing:-1px; }
        .db-stat-sub   { font-size:11px; color:var(--muted); margin-top:4px; }

        /* ── Empty state ── */
        .db-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:80px 32px; text-align:center; }
        .db-empty-icon { width:64px; height:64px; border:1px solid var(--border2); display:flex; align-items:center; justify-content:center; font-size:28px; }
        .db-empty-title { font-family:'Syne',sans-serif; font-weight:700; font-size:22px; letter-spacing:-0.5px; }
        .db-empty-sub   { font-size:14px; color:var(--muted2); font-weight:300; max-width:320px; line-height:1.6; }

        /* ── Detail ── */
        .db-detail-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:20px; }
        .db-detail-name   { font-family:'Syne',sans-serif; font-weight:700; font-size:clamp(18px,2vw,26px); letter-spacing:-0.5px; line-height:1.2; }
        .db-detail-actions { display:flex; gap:8px; flex-shrink:0; }
        .db-icon-btn {
          background:var(--bg2); border:1px solid var(--border2); color:var(--muted2); cursor:pointer;
          padding:8px 12px; font-family:'DM Mono',monospace; font-size:11px; letter-spacing:0.05em;
          transition:all 0.2s; display:flex; align-items:center; gap:6px;
        }
        .db-icon-btn:hover         { border-color:rgba(255,255,255,0.25); color:var(--text); }
        .db-icon-btn.danger:hover  { border-color:var(--danger); color:var(--danger); }
        .db-icon-btn.accent        { border-color:rgba(232,255,71,0.3); color:var(--accent); }
        .db-icon-btn.accent:hover  { background:rgba(232,255,71,0.05); }

        /* ── Price cards ── */
        .db-price-cards { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
        .db-price-card  { background:var(--bg2); border:1px solid var(--border); padding:14px 16px; }
        .db-price-card-label { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.1em; margin-bottom:8px; }
        .db-price-card-value { font-family:'Syne',sans-serif; font-weight:700; font-size:20px; letter-spacing:-0.5px; }
        .db-price-card-sub   { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); margin-top:4px; }

        /* ── Chart ── */
        .db-chart-section  { background:var(--bg2); border:1px solid var(--border); padding:20px; margin-bottom:24px; }
        .db-chart-header   { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
        .db-chart-title    { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); letter-spacing:0.1em; text-transform:uppercase; }
        .db-chart-legend   { display:flex; gap:16px; }
        .db-chart-legend-item { display:flex; align-items:center; gap:6px; font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); }
        .db-chart-legend-line { width:20px; height:2px; }
        .db-no-history { height:200px; display:flex; align-items:center; justify-content:center; font-family:'DM Mono',monospace; font-size:12px; color:var(--muted); }

        /* ── Badges ── */
        .db-badge { display:inline-flex; align-items:center; gap:5px; font-family:'DM Mono',monospace; font-size:10px; padding:3px 8px; border:1px solid var(--border); color:var(--muted2); }
        .db-status-badge  { display:inline-flex; align-items:center; gap:5px; font-family:'DM Mono',monospace; font-size:10px; padding:3px 10px; }
        .db-status-active { background:rgba(110,231,183,0.08); color:var(--success); border:1px solid rgba(110,231,183,0.2); }
        .db-status-paused { background:rgba(107,107,107,0.08); color:var(--muted2); border:1px solid var(--border); }
        .db-status-hit    { background:rgba(232,255,71,0.08); color:var(--accent); border:1px solid rgba(232,255,71,0.2); }

        /* ── Modal ── */
        .db-modal-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.75);
          backdrop-filter:blur(4px);
          display:flex; align-items:center; justify-content:center;
          z-index:500; padding:24px;
        }
        .db-modal { background:var(--bg2); border:1px solid var(--border2); padding:32px; width:100%; max-width:480px; animation:modalIn 0.2s ease; }
        @keyframes modalIn { from{opacity:0;transform:scale(0.97) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .db-modal-title { font-family:'Syne',sans-serif; font-weight:700; font-size:20px; letter-spacing:-0.5px; margin-bottom:6px; }
        .db-modal-sub   { font-size:13px; color:var(--muted2); margin-bottom:28px; font-weight:300; line-height:1.5; }
        .db-field       { margin-bottom:18px; }
        .db-label       { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted2); letter-spacing:0.08em; display:block; margin-bottom:8px; }
        .db-input       { width:100%; background:var(--bg3); border:1px solid var(--border2); color:var(--text); padding:11px 14px; font-family:'DM Mono',monospace; font-size:13px; outline:none; transition:border-color 0.2s; }
        .db-input:focus { border-color:rgba(232,255,71,0.4); }
        .db-input::placeholder { color:var(--muted); }
        .db-modal-actions { display:flex; gap:10px; margin-top:24px; }
        .db-btn-submit  { flex:1; background:var(--accent); color:#0a0a0a; border:none; cursor:pointer; font-family:'DM Mono',monospace; font-size:12px; font-weight:500; padding:12px; letter-spacing:0.08em; transition:background 0.2s; }
        .db-btn-submit:disabled { opacity:0.5; cursor:not-allowed; }
        .db-btn-submit:hover:not(:disabled) { background:#d4eb30; }
        .db-btn-cancel  { background:transparent; color:var(--muted2); border:1px solid var(--border2); cursor:pointer; font-family:'DM Mono',monospace; font-size:12px; padding:12px 20px; letter-spacing:0.08em; transition:all 0.2s; }
        .db-btn-cancel:hover { color:var(--text); border-color:rgba(255,255,255,0.25); }
        .db-error-msg   { background:rgba(248,113,113,0.1); border:1px solid rgba(248,113,113,0.3); color:var(--danger); font-family:'DM Mono',monospace; font-size:11px; padding:10px 14px; margin-bottom:16px; }

        @media(max-width:1024px) { .db-stats,.db-price-cards { grid-template-columns:repeat(2,1fr); } }
        @media(max-width:768px)  { .db-sidebar { display:none; } .db-main { padding:20px; } }
      `}</style>

      {/* ── Onboarding tour — auto-starts for new users ── */}
      <OnboardingTour
        forceStart={forceTour}
        onFinish={() => setForceTour(false)}
      />

      <div className="db-wrap">
        {/* ── Sidebar ── */}
        <aside className="db-sidebar">
          <div className="db-sidebar-top">
            <div className="db-logo-row">
              <a href="/" className="db-logo" style={{ margin: 0 }}>
                <div className="db-logo-dot" />
                PriceHound
              </a>
            </div>
            <button className="db-add-btn" onClick={() => setShowAddModal(true)}>
              + TRACK NEW PRODUCT
            </button>
          </div>

          <div className="db-sidebar-label">
            Tracked Products ({products.length})
          </div>

          <div className="db-product-list">
            {products.length === 0 && (
              <div style={{ padding: "16px 10px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                No products yet. Add one to get started.
              </div>
            )}
            {products.map((p) => {
              const isHit = p.current_price != null && p.current_price <= p.target_price;
              return (
                <div
                  key={p.id}
                  className={`db-product-item${selectedId === p.id ? " active" : ""}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <div
                    className="db-product-item-status"
                    style={{ background: isHit ? "var(--accent)" : p.is_active ? "var(--success)" : "var(--muted)" }}
                  />
                  <div className="db-product-item-name">
                    {p.name || new URL(p.url).hostname.replace("www.", "")}
                  </div>
                  <div className="db-product-item-meta">
                    <div className="db-platform-dot" style={{ background: getPlatformColor(p.platform) }} />
                    <div className="db-product-item-price">
                      {p.current_price ? formatPrice(p.current_price) : "—"} →{" "}
                      <span style={{ color: "var(--accent)" }}>{formatPrice(p.target_price)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="db-sidebar-bottom">
            <div className="db-user">
              <div className="db-avatar">{initials}</div>
              <div className="db-user-info">
                <div className="db-user-name">{profile?.full_name ?? "User"}</div>
                <div className="db-user-email">{profile?.email}</div>
              </div>
              <form action="/auth/signout" method="POST">
                <button type="submit" className="db-signout-btn" title="Sign out">↪</button>
              </form>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="db-main">
          {/* Top bar with guide button */}
          <div className="db-topbar">
            <div className="db-topbar-title">Dashboard</div>
            <div className="db-topbar-right">
              <TourTriggerButton
                onClick={() => {
                  // Remove the seen flag so the tour starts fresh
                  localStorage.removeItem("pricehound_tour_seen");
                  setForceTour(true);
                }}
              />
            </div>
          </div>

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
              <div className="db-stat-value">{allHistory.length}</div>
              <div className="db-stat-sub">data points collected</div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-label">PAUSED</div>
              <div className="db-stat-value">{totalTracked - activeCount}</div>
              <div className="db-stat-sub">products paused</div>
            </div>
          </div>

          {/* Empty state */}
          {products.length === 0 && (
            <div className="db-empty">
              <div className="db-empty-icon">🔍</div>
              <div className="db-empty-title">Nothing tracked yet.</div>
              <p className="db-empty-sub">
                Add a product URL and your target price. We&apos;ll watch it around the clock and email you when it drops.
              </p>
              <button
                className="db-add-btn"
                style={{ width: "auto", padding: "12px 28px" }}
                onClick={() => setShowAddModal(true)}
              >
                + TRACK YOUR FIRST PRODUCT
              </button>
            </div>
          )}

          {/* Product detail */}
          {selected && (
            <>
              <div className="db-detail-header">
                <div style={{ overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div
                      className="db-badge"
                      style={{ borderColor: getPlatformColor(selected.platform), color: getPlatformColor(selected.platform) }}
                    >
                      {getPlatformLabel(selected.platform)}
                    </div>
                    <div className={`db-status-badge ${
                      selected.current_price && selected.current_price <= selected.target_price
                        ? "db-status-hit"
                        : selected.is_active ? "db-status-active" : "db-status-paused"
                    }`}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                      {selected.current_price && selected.current_price <= selected.target_price
                        ? "TARGET HIT" : selected.is_active ? "TRACKING" : "PAUSED"}
                    </div>
                  </div>
                  <div className="db-detail-name">{selected.name || "Unnamed Product"}</div>
                  <a
                    href={selected.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--muted)", textDecoration: "none", display: "block", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500 }}
                    title={selected.url}
                  >
                    {selected.url}
                  </a>
                  <div style={{ marginTop: 6, fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--muted)" }}>
                    added {timeAgo(selected.created_at)}
                  </div>
                </div>
                <div className="db-detail-actions">
                  <button className="db-icon-btn accent" onClick={() => { setEditProduct(selected); setShowEditModal(true); }}>
                    ✎ EDIT TARGET
                  </button>
                  <button className="db-icon-btn" onClick={() => handleToggle(selected.id, selected.is_active)} disabled={isPending}>
                    {selected.is_active ? "⏸ PAUSE" : "▶ RESUME"}
                  </button>
                  <button className="db-icon-btn danger" onClick={() => handleDelete(selected.id)} disabled={isPending}>
                    ✕ DELETE
                  </button>
                </div>
              </div>

              <div className="db-price-cards">
                <div className="db-price-card">
                  <div className="db-price-card-label">CURRENT PRICE</div>
                  <div className="db-price-card-value" style={{ color: selected.current_price && selected.current_price <= selected.target_price ? "var(--success)" : "var(--text)" }}>
                    {formatPrice(selected.current_price)}
                  </div>
                  <div className="db-price-card-sub">last scraped</div>
                </div>
                <div className="db-price-card">
                  <div className="db-price-card-label">YOUR TARGET</div>
                  <div className="db-price-card-value" style={{ color: "var(--accent)" }}>
                    {formatPrice(selected.target_price)}
                  </div>
                  <div className="db-price-card-sub">
                    {selected.current_price
                      ? selected.current_price > selected.target_price
                        ? `${formatPrice(selected.current_price - selected.target_price)} away`
                        : "✓ target reached"
                      : "awaiting scrape"}
                  </div>
                </div>
                <div className="db-price-card">
                  <div className="db-price-card-label">ALL-TIME LOW</div>
                  <div className="db-price-card-value" style={{ color: "var(--success)" }}>{formatPrice(allTimeLow)}</div>
                  <div className="db-price-card-sub">since tracking</div>
                </div>
                <div className="db-price-card">
                  <div className="db-price-card-label">ALL-TIME HIGH</div>
                  <div className="db-price-card-value" style={{ color: "var(--accent2)" }}>{formatPrice(allTimeHigh)}</div>
                  <div className="db-price-card-sub">since tracking</div>
                </div>
              </div>

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
                {history.length === 0 ? (
                  <div className="db-no-history">No price data yet — check back after the first scrape runs.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: "#6b6b6b" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: "#6b6b6b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}K`} width={50} />
                      <Tooltip content={<PriceTooltip />} />
                      <ReferenceLine y={selected.target_price} stroke="#ff6b35" strokeDasharray="6 4" strokeWidth={1.5} opacity={0.7}
                        label={{ value: "Target", fill: "#ff6b35", fontSize: 10, fontFamily: "'DM Mono',monospace", position: "insideTopRight" }}
                      />
                      <Line type="monotone" dataKey="price" stroke="#e8ff47" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#e8ff47", strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── Add Product Modal ── */}
      {showAddModal && (
        <div className="db-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="db-modal">
            <div className="db-modal-title">Track a product</div>
            <div className="db-modal-sub">Paste a product URL from Amazon, Flipkart, or Myntra and set the price you want to be notified at.</div>
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
                <button type="button" className="db-btn-cancel" onClick={() => { setShowAddModal(false); setAddError(null); }}>CANCEL</button>
                <button type="submit" className="db-btn-submit" disabled={isPending}>{isPending ? "ADDING..." : "START TRACKING →"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Target Price Modal ── */}
      {showEditModal && editProduct && (
        <div className="db-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowEditModal(false)}>
          <div className="db-modal">
            <div className="db-modal-title">Update target price</div>
            <div className="db-modal-sub">
              Change the price at which you want to be notified for{" "}
              <span style={{ color: "var(--text)", fontWeight: 500 }}>{editProduct.name || "this product"}</span>.
            </div>
            <form onSubmit={handleEditSave}>
              <div className="db-field">
                <label className="db-label">NEW TARGET PRICE (₹)</label>
                <input className="db-input" type="number" name="target_price" defaultValue={editProduct.target_price} min="1" step="1" required autoFocus />
              </div>
              <div className="db-modal-actions">
                <button type="button" className="db-btn-cancel" onClick={() => { setShowEditModal(false); setEditProduct(null); }}>CANCEL</button>
                <button type="submit" className="db-btn-submit" disabled={isPending}>{isPending ? "SAVING..." : "SAVE →"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}