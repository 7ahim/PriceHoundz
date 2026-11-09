"use client";

// Lets the user track the same product on other stores by pasting links.
// Shows a price comparison and reports its data to the dashboard, which draws
// the platforms on the main price-history chart. Also has an optional
// "live" mode that re-checks every few minutes while the page is open.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { RefreshCw, Circle, TriangleAlert, ExternalLink } from "lucide-react";
import { getCrossData, addCrossLink, removeCrossLink, toggleCrossLink } from "@/lib/crossActions";
import { CROSS_PLATFORMS } from "@/lib/crossPlatforms";
import { formatPrice, timeAgo, getPlatformColor } from "@/lib/utils";
import type { CrossPlatformPrice, CrossPriceHistory, TrackedProduct } from "@/types/supabase";

const LIVE_INTERVAL_MS = 5 * 60 * 1000;
const mono = { fontFamily: "'DM Mono',monospace" } as const;

interface Props {
  product: TrackedProduct;
  onData?: (rows: CrossPlatformPrice[], history: CrossPriceHistory[]) => void;
}

export default function CrossPlatformPanel({ product, onData }: Props) {
  const [rows,    setRows]    = useState<CrossPlatformPrice[]>([]);
  const [history, setHistory] = useState<CrossPriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [drafts,  setDrafts]  = useState<Record<string, string>>({});
  const [busy,    setBusy]    = useState<Record<string, boolean>>({});
  const [live,    setLive]    = useState(false);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const setBusyFor = (key: string, v: boolean) => setBusy((b) => ({ ...b, [key]: v }));

  // Tell the dashboard so it can draw these platforms on the main chart
  useEffect(() => { onData?.(rows, history); }, [rows, history]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onData?.([], []), []);                      // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load linked platforms when the selected product changes ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setRows([]); setHistory([]); setDrafts({}); setLive(false);
    getCrossData(product.id).then((res) => {
      if (cancelled) return;
      if ("error" in res) setError(res.error);
      else { setRows(res.rows); setHistory(res.history); }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [product.id]);

  // ── Scrape one linked platform ───────────────────────────────
  const scrapeRow = useCallback(async (id: string) => {
    setBusyFor(id, true);
    try {
      const res = await fetch("/api/scrape-cross", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crossId: id }),
      });
      let data: any = null;
      try { data = await res.json(); } catch {}
      if (!res.ok || !data?.success) {
        setError(data?.error ?? `Price check failed (HTTP ${res.status}).`);
        return;
      }
      setError(null);
      setRows((prev) => prev.map((r) => r.id === id
        ? { ...r, current_price: data.price, name: data.name ?? r.name, image_url: data.imageUrl ?? r.image_url, updated_at: data.updatedAt }
        : r));
      const row = rowsRef.current.find((r) => r.id === id);
      setHistory((prev) => [...prev, {
        id: `opt-${Date.now()}-${id}`, cross_platform_id: id, product_id: product.id,
        platform: (row?.platform ?? "other") as any, price: data.price, scraped_at: new Date().toISOString(),
      }]);
    } catch (e: any) {
      setError(`Price check failed: ${e?.message ?? "network error"}`);
    } finally {
      setBusyFor(id, false);
    }
  }, [product.id]);

  const refreshAll = useCallback(async () => {
    for (const r of rowsRef.current.filter((x) => x.is_active)) await scrapeRow(r.id);
  }, [scrapeRow]);

  // ── Live mode ────────────────────────────────────────────────
  useEffect(() => {
    if (!live) return;
    refreshAll();
    const t = setInterval(refreshAll, LIVE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [live, refreshAll]);

  // ── Add a link ───────────────────────────────────────────────
  const handleAdd = async (platform: string) => {
    const url = (drafts[platform] ?? "").trim();
    if (!url) return;
    setBusyFor(platform, true); setError(null);
    const res = await addCrossLink(product.id, platform, url);
    setBusyFor(platform, false);
    if ("error" in res) { setError(res.error); return; }
    setRows((prev) => [...prev.filter((r) => r.platform !== platform), res.row]);
    setDrafts((d) => ({ ...d, [platform]: "" }));
    scrapeRow(res.row.id);
  };

  const handleRemove = async (row: CrossPlatformPrice) => {
    setBusyFor(row.id, true);
    const res = await removeCrossLink(row.id);
    setBusyFor(row.id, false);
    if ("error" in res) { setError(res.error); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setHistory((prev) => prev.filter((h) => h.cross_platform_id !== row.id));
  };

  const handleToggle = async (row: CrossPlatformPrice) => {
    const next = !row.is_active;
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, is_active: next } : r));
    const res = await toggleCrossLink(row.id, next);
    if ("error" in res) {
      setError(res.error);
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, is_active: !next } : r));
    }
  };

  // ── Derived data ─────────────────────────────────────────────
  const available = CROSS_PLATFORMS.filter((p) => p.id !== product.platform);
  const linked    = rows.filter((r) => available.some((p) => p.id === r.platform));

  const best = useMemo(() => {
    const prices = [
      ...(product.current_price != null ? [{ id: "main", price: product.current_price }] : []),
      ...linked.filter((r) => r.current_price != null).map((r) => ({ id: r.id, price: r.current_price as number })),
    ];
    return prices.length > 1 ? prices.reduce((a, b) => (b.price < a.price ? b : a)).id : null;
  }, [product.current_price, linked]);

  const box: React.CSSProperties = { background: "var(--bg2)", border: "1px solid var(--border)", padding: 28, marginBottom: 28 };
  const btn: React.CSSProperties = {
    ...mono, fontSize: 11, letterSpacing: "0.08em", padding: "7px 12px", cursor: "pointer",
    background: "transparent", color: "var(--text)", border: "1px solid var(--border2)",
    display: "inline-flex", alignItems: "center", gap: 6,
  };

  return (
    <div className="db-cross-panel" style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <div style={{ ...mono, fontSize: 12, letterSpacing: "0.1em", color: "var(--muted)" }}>COMPARE ON OTHER PLATFORMS</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, maxWidth: 560 }}>
            Paste the link to this same product on another store to track and compare its price. Only the platforms you add are tracked.
          </div>
        </div>
        {linked.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" style={btn} onClick={refreshAll} disabled={Object.values(busy).some(Boolean)}><RefreshCw size={12} /> REFRESH ALL</button>
            <button
              type="button" onClick={() => setLive((v) => !v)}
              title="Re-check all linked platforms every 5 minutes while this page is open"
              style={{ ...btn, color: live ? "var(--bg)" : "var(--text)", background: live ? "var(--success)" : "transparent", borderColor: live ? "var(--success)" : "var(--border2)" }}
            >
              <Circle size={9} fill="currentColor" /> LIVE {live ? "ON" : "OFF"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ ...mono, fontSize: 12, color: "var(--danger)", border: "1px solid var(--danger)", padding: "10px 12px", margin: "14px 0", display: "flex", alignItems: "center", gap: 8 }}>
          <TriangleAlert size={14} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ ...mono, fontSize: 12, color: "var(--muted)", padding: "24px 0" }}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          {available.map((p) => {
            const row = linked.find((r) => r.platform === p.id);
            const color = getPlatformColor(p.id);

            // ── Not linked yet: URL input ─────────────────────
            if (!row) {
              return (
                <div key={p.id} style={{ border: "1px dashed var(--border2)", padding: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ ...mono, fontSize: 12, color, minWidth: 120 }}>{p.label}</span>
                  <input
                    type="url" placeholder={p.example} maxLength={2000}
                    value={drafts[p.id] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(p.id); }}
                    style={{ flex: "1 1 240px", minWidth: 0, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border2)", padding: "9px 12px", ...mono, fontSize: 12 }}
                  />
                  <button type="button" style={{ ...btn, color: "var(--accent)", borderColor: "var(--accent)" }}
                    disabled={busy[p.id] || !(drafts[p.id] ?? "").trim()} onClick={() => handleAdd(p.id)}>
                    {busy[p.id] ? "ADDING…" : "+ TRACK"}
                  </button>
                </div>
              );
            }

            // ── Linked: price card ────────────────────────────
            const diff = row.current_price != null && product.current_price != null ? row.current_price - product.current_price : null;
            const isBest = best === row.id;
            const hitTarget = row.current_price != null && row.current_price <= product.target_price;
            return (
              <div key={p.id} style={{ border: `1px solid ${isBest ? "var(--success)" : "var(--border2)"}`, padding: 14, opacity: row.is_active ? 1 : 0.55 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ ...mono, fontSize: 12, color, minWidth: 120 }}>{p.label}</span>
                  <div style={{ flex: "1 1 160px" }}>
                    <div style={{ fontSize: 22, fontWeight: 600, color: hitTarget ? "var(--success)" : "var(--text)" }}>
                      {busy[row.id] && row.current_price == null ? "fetching…" : formatPrice(row.current_price)}
                    </div>
                    <div style={{ ...mono, fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                      {diff == null ? "no comparison yet"
                        : diff === 0 ? "same as this product"
                        : diff < 0 ? <span style={{ color: "var(--success)" }}>{formatPrice(-diff)} cheaper</span>
                        : <span style={{ color: "var(--accent2)" }}>{formatPrice(diff)} more</span>}
                      {" · "}{row.current_price != null ? `checked ${timeAgo(row.updated_at)}` : "not checked yet"}
                      {hitTarget && " · below your target"}
                    </div>
                  </div>
                  {isBest && <span style={{ ...mono, fontSize: 10, letterSpacing: "0.1em", color: "var(--success)", border: "1px solid var(--success)", padding: "3px 8px" }}>BEST PRICE</span>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <a href={row.url} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: "none" }}>OPEN <ExternalLink size={12} /></a>
                    <button type="button" style={btn} disabled={busy[row.id] || !row.is_active} onClick={() => scrapeRow(row.id)}>
                      {busy[row.id] ? "…" : <RefreshCw size={12} />}
                    </button>
                    <button type="button" style={btn} onClick={() => handleToggle(row)}>{row.is_active ? "PAUSE" : "RESUME"}</button>
                    <button type="button" style={{ ...btn, color: "var(--danger)" }} disabled={busy[row.id]} onClick={() => handleRemove(row)}>REMOVE</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}