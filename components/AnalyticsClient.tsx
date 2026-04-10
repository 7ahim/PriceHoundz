"use client";

import Link from "next/link";
import {
  LineChart, Line, AreaChart, Area,
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from "recharts";
import { ThemeProvider, DashboardNav } from "@/components/DashboardNav";
import type { TrackedProduct, PriceHistory, NotificationLog } from "@/types/supabase";

// ── Types ─────────────────────────────────────────────────────
interface Props {
  products:         TrackedProduct[];
  allHistory:       PriceHistory[];
  notificationLogs: NotificationLog[];
}

// ── Helpers ───────────────────────────────────────────────────
const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(n);

const fmtK = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L`
  : n >= 1000 ? `₹${(n / 1000).toFixed(0)}K`
  : `₹${n}`;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const shortMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

// ── Custom tooltip ────────────────────────────────────────────
function ChartTooltip({ active, payload, label, prefix = "₹" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#141414", border: "1px solid rgba(255,255,255,0.12)",
      padding: "10px 14px", fontFamily: "'DM Mono',monospace", fontSize: 12,
    }}>
      <div style={{ color: "#6b6b6b", marginBottom: 6 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color ?? "#e8ff47", marginBottom: 2 }}>
          {p.name}: {prefix}{typeof p.value === "number" ? p.value.toLocaleString("en-IN") : p.value}
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function AnalyticsClient({ products, allHistory, notificationLogs }: Props) {

  // ── Derived stats ─────────────────────────────────────────
  const totalProducts  = products.length;
  const activeProducts = products.filter((p) => p.is_active).length;
  const totalAlerts    = notificationLogs.length;
  const totalDataPoints = allHistory.length;

  // Total potential savings = sum of (target - current) for products where current <= target
  const totalSavings = products.reduce((acc, p) => {
    if (p.current_price != null && p.current_price <= p.target_price) {
      return acc + (p.target_price - p.current_price);
    }
    return acc;
  }, 0);

  // Best deal = product with largest % drop from first scraped price to now
  const bestDeal = products
    .map((p) => {
      const hist = allHistory.filter((h) => h.product_id === p.id);
      if (hist.length < 2 || !p.current_price) return null;
      const firstPrice = hist[0].price;
      const drop       = firstPrice - p.current_price;
      const dropPct    = (drop / firstPrice) * 100;
      return { product: p, firstPrice, drop, dropPct };
    })
    .filter(Boolean)
    .sort((a, b) => b!.dropPct - a!.dropPct)[0];

  // Most volatile = product with largest (max - min) price range
  const mostVolatile = products
    .map((p) => {
      const prices = allHistory.filter((h) => h.product_id === p.id).map((h) => h.price);
      if (prices.length < 2) return null;
      const range = Math.max(...prices) - Math.min(...prices);
      return { product: p, range };
    })
    .filter(Boolean)
    .sort((a, b) => b!.range - a!.range)[0];

  // ── Chart 1: Price trend — all products overlaid ──────────
  // Normalise each product's price to % of its first price so
  // they're comparable on the same axis regardless of price range.
  const trendData: Record<string, any>[] = [];
  const productColors = ["#e8ff47", "#6ee7b7", "#f87171", "#93c5fd", "#fbbf24", "#c084fc"];

  if (allHistory.length > 0) {
    // Build a time-sorted list of unique dates
    const dates = [...new Set(allHistory.map((h) => shortDate(h.scraped_at)))];
    dates.forEach((date) => {
      const entry: Record<string, any> = { date };
      products.forEach((p, idx) => {
        const point = allHistory
          .filter((h) => h.product_id === p.id && shortDate(h.scraped_at) === date)
          .at(-1);
        if (point) {
          const firstPrice = allHistory.find((h) => h.product_id === p.id)?.price ?? point.price;
          entry[`p${idx}`] = parseFloat(((point.price / firstPrice) * 100).toFixed(1));
          entry[`p${idx}_name`] = p.name ?? `Product ${idx + 1}`;
        }
      });
      trendData.push(entry);
    });
  }

  // ── Chart 2: Price history for each product (sparklines) ──
  const productSparklines = products.map((p) => ({
    product: p,
    data: allHistory
      .filter((h) => h.product_id === p.id)
      .map((h) => ({ date: shortDate(h.scraped_at), price: h.price })),
  }));

  // ── Chart 3: Price checks per day (activity heatmap as bar) ─
  const activityMap: Record<string, number> = {};
  allHistory.forEach((h) => {
    const d = shortDate(h.scraped_at);
    activityMap[d] = (activityMap[d] ?? 0) + 1;
  });
  const activityData = Object.entries(activityMap)
    .slice(-30)
    .map(([date, count]) => ({ date, count }));

  // ── Chart 4: Savings over time (cumulative) ───────────────
  const savingsTimeline: { date: string; saving: number; cumulative: number }[] = [];
  let cumulative = 0;
  notificationLogs.forEach((log) => {
    const product = products.find((p) => p.id === log.product_id);
    if (!product) return;
    const saving = product.target_price - log.price;
    cumulative += Math.max(0, saving);
    savingsTimeline.push({
      date:       shortDate(log.sent_at),
      saving:     Math.max(0, saving),
      cumulative,
    });
  });

  // ── Chart 5: Platform breakdown ───────────────────────────
  const platformCount: Record<string, number> = {};
  products.forEach((p) => {
    const pl = p.platform ?? "other";
    platformCount[pl] = (platformCount[pl] ?? 0) + 1;
  });
  const platformData = Object.entries(platformCount).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: name === "amazon" ? "#ff9900" : name === "flipkart" ? "#2874f0" : name === "myntra" ? "#ff3f6c" : "#9a9a9a",
  }));

  // ── Chart 6: Price distance to target ─────────────────────
  const distanceData = products
    .filter((p) => p.current_price != null)
    .map((p) => {
      const gap = p.current_price! - p.target_price;
      const pct = (gap / p.target_price) * 100;
      return {
        name:    (p.name ?? "Unnamed").slice(0, 20),
        gap:     Math.round(gap),
        pct:     parseFloat(pct.toFixed(1)),
        hit:     gap <= 0,
      };
    })
    .sort((a, b) => a.pct - b.pct);

  const hasData = totalDataPoints > 0;

  return (
    <ThemeProvider>
      <style>{`
        .an-wrap  { min-height:100vh; background:var(--bg); }
        .an-body  { padding:40px 48px 80px; max-width:1400px; margin:0 auto; }

        .an-header { margin-bottom:40px; }
        .an-header-label {
          font-family:'DM Mono',monospace; font-size:11px;
          color:var(--accent); letter-spacing:0.12em; margin-bottom:10px;
        }
        .an-header-label::before { content:'// '; }
        .an-header-title {
          font-family:'Syne',sans-serif; font-weight:800;
          font-size:clamp(28px,3vw,44px); letter-spacing:-2px; margin-bottom:8px;
          color:var(--text);
        }
        .an-header-sub { font-size:14px; color:var(--muted2); font-weight:300; }

        .an-stats { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin-bottom:36px; }
        .an-stat  { background:var(--bg2); border:1px solid var(--border); padding:16px 18px; transition:background 0.25s,border-color 0.25s; }
        .an-stat-label { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.1em; margin-bottom:8px; }
        .an-stat-value { font-family:'Syne',sans-serif; font-weight:700; font-size:22px; letter-spacing:-1px; line-height:1; color:var(--text); }
        .an-stat-sub   { font-size:11px; color:var(--muted); margin-top:6px; }

        .an-grid-2  { display:grid; grid-template-columns:1fr 1fr;     gap:16px; margin-bottom:16px; }
        .an-grid-3  { display:grid; grid-template-columns:2fr 1fr 1fr; gap:16px; margin-bottom:16px; }
        .an-grid-21 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-bottom:16px; }

        .an-card {
          background:var(--bg2); border:1px solid var(--border); padding:20px 24px;
          transition:background 0.25s,border-color 0.25s;
        }
        .an-card-header  { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px; }
        .an-card-title   { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted); letter-spacing:0.1em; text-transform:uppercase; }
        .an-card-sub     { font-size:12px; color:var(--muted); font-weight:300; margin-bottom:20px; }
        .an-card-badge   {
          font-family:'DM Mono',monospace; font-size:10px; padding:3px 8px;
          background:rgba(92,138,0,0.1); color:var(--accent);
          border:1px solid rgba(92,138,0,0.2);
        }
        .an-no-data {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:10px; color:var(--muted); font-family:'DM Mono',monospace; font-size:12px;
        }
        .an-sparklines { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px; }
        .an-spark-card {
          background:var(--bg3); border:1px solid var(--border); padding:14px 16px;
          transition:background 0.25s,border-color 0.25s;
        }
        .an-spark-name   { font-size:12px; font-weight:500; color:var(--text); margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .an-spark-meta   { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); margin-bottom:12px; }
        .an-spark-prices { display:flex; gap:16px; margin-top:8px; }
        .an-spark-plabel { font-family:'DM Mono',monospace; font-size:9px; color:var(--muted); letter-spacing:0.08em; }
        .an-spark-pval   { font-family:'Syne',sans-serif; font-weight:700; font-size:15px; letter-spacing:-0.5px; color:var(--text); }

        .an-highlight { background:rgba(92,138,0,0.04); border:1px solid rgba(92,138,0,0.2); padding:20px 24px; }
        .an-highlight-label { font-family:'DM Mono',monospace; font-size:10px; color:var(--accent); letter-spacing:0.1em; margin-bottom:10px; }
        .an-highlight-name  { font-family:'Syne',sans-serif; font-weight:700; font-size:18px; letter-spacing:-0.5px; margin-bottom:8px; color:var(--text); }
        .an-highlight-val   { font-family:'Syne',sans-serif; font-weight:800; font-size:32px; letter-spacing:-1.5px; color:var(--accent); }
        .an-highlight-sub   { font-size:12px; color:var(--muted2); margin-top:4px; }

        .an-dist-row       { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
        .an-dist-name      { font-size:12px; color:var(--text); flex:0 0 160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .an-dist-bar-wrap  { flex:1; background:var(--bg3); height:6px; }
        .an-dist-bar       { height:6px; transition:width 0.6s ease; }
        .an-dist-pct       { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted2); flex:0 0 48px; text-align:right; }

        .an-platform-row       { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
        .an-platform-name      { font-family:'DM Mono',monospace; font-size:11px; color:var(--text); flex:0 0 80px; }
        .an-platform-bar-wrap  { flex:1; background:var(--bg3); height:8px; }
        .an-platform-bar       { height:8px; transition:width 0.6s ease; }
        .an-platform-count     { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted2); flex:0 0 24px; text-align:right; }

        .an-empty       { text-align:center; padding:80px 32px; }
        .an-empty-icon  { font-size:48px; margin-bottom:16px; }
        .an-empty-title { font-family:'Syne',sans-serif; font-weight:700; font-size:22px; letter-spacing:-0.5px; margin-bottom:8px; color:var(--text); }
        .an-empty-sub   { font-size:14px; color:var(--muted2); font-weight:300; max-width:360px; margin:0 auto 24px; line-height:1.6; }
        .an-empty-btn   {
          display:inline-block; background:var(--accent); color:#0a0a0a;
          font-family:'DM Mono',monospace; font-size:12px; font-weight:500;
          padding:12px 28px; text-decoration:none; letter-spacing:0.06em;
        }

        @media(max-width:1100px) { .an-stats { grid-template-columns:repeat(3,1fr); } }
        @media(max-width:900px)  {
          .an-body  { padding:24px; }
          .an-stats { grid-template-columns:repeat(2,1fr); }
          .an-grid-2, .an-grid-3, .an-grid-21 { grid-template-columns:1fr; }
        }
      `}</style>

      <DashboardNav activeTab="analytics" />

      <div className="ph-page an-wrap">
        <div className="an-body">
          {/* ── Header ── */}
          <div className="an-header">
            <div className="an-header-label">analytics</div>
            <h1 className="an-header-title">Price Intelligence</h1>
            <p className="an-header-sub">
              {totalProducts} product{totalProducts !== 1 ? "s" : ""} tracked
              &nbsp;·&nbsp; {totalDataPoints} price data points
              &nbsp;·&nbsp; {totalAlerts} alert{totalAlerts !== 1 ? "s" : ""} sent
            </p>
          </div>

          {/* ── Empty state ── */}
          {totalProducts === 0 && (
            <div className="an-empty">
              <div className="an-empty-icon">📊</div>
              <div className="an-empty-title">No data yet.</div>
              <p className="an-empty-sub">
                Add products to your tracker and let PriceHound collect price data.
                Analytics will populate as data comes in.
              </p>
              <Link href="/dashboard" className="an-empty-btn">
                GO TO TRACKER →
              </Link>
            </div>
          )}

          {totalProducts > 0 && (
            <>
              {/* ── Stat cards ── */}
              <div className="an-stats">
                <div className="an-stat">
                  <div className="an-stat-label">TRACKED</div>
                  <div className="an-stat-value">{totalProducts}</div>
                  <div className="an-stat-sub">{activeProducts} active</div>
                </div>
                <div className="an-stat">
                  <div className="an-stat-label">DATA POINTS</div>
                  <div className="an-stat-value">{totalDataPoints}</div>
                  <div className="an-stat-sub">price readings</div>
                </div>
                <div className="an-stat">
                  <div className="an-stat-label">ALERTS SENT</div>
                  <div className="an-stat-value" style={{ color: "var(--accent)" }}>{totalAlerts}</div>
                  <div className="an-stat-sub">targets hit</div>
                </div>
                <div className="an-stat">
                  <div className="an-stat-label">POTENTIAL SAVING</div>
                  <div className="an-stat-value" style={{ color: "var(--success)" }}>
                    {totalSavings > 0 ? fmtK(totalSavings) : "—"}
                  </div>
                  <div className="an-stat-sub">vs target prices</div>
                </div>
                <div className="an-stat">
                  <div className="an-stat-label">BEST DROP</div>
                  <div className="an-stat-value" style={{ color: "var(--accent)" }}>
                    {bestDeal ? `${bestDeal.dropPct.toFixed(1)}%` : "—"}
                  </div>
                  <div className="an-stat-sub">{bestDeal ? (bestDeal.product.name ?? "").slice(0, 16) : "no data yet"}</div>
                </div>
                <div className="an-stat">
                  <div className="an-stat-label">MOST VOLATILE</div>
                  <div className="an-stat-value" style={{ color: "var(--accent2)" }}>
                    {mostVolatile ? fmtK(mostVolatile.range) : "—"}
                  </div>
                  <div className="an-stat-sub">{mostVolatile ? (mostVolatile.product.name ?? "").slice(0, 16) : "price range"}</div>
                </div>
              </div>

              {/* ── Row 1: Normalised trend + Savings timeline ── */}
              <div className="an-grid-2">
                <div className="an-card">
                  <div className="an-card-header">
                    <div className="an-card-title">PRICE TREND (NORMALISED %)</div>
                    <div className="an-card-badge">ALL PRODUCTS</div>
                  </div>
                  <p className="an-card-sub">Each product indexed to 100 at first scrape — shows relative movement</p>
                  {trendData.length < 2 ? (
                    <div className="an-no-data" style={{ height: 220 }}>
                      <span>📈</span>
                      <span>Needs at least 2 scrape runs to show trends</span>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fill: "#6b6b6b" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fill: "#6b6b6b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={40} />
                        <Tooltip content={<ChartTooltip prefix="" />} />
                        <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                        {products.map((_, idx) => (
                          <Line
                            key={idx}
                            type="monotone"
                            dataKey={`p${idx}`}
                            name={`p${idx}_name`}
                            stroke={productColors[idx % productColors.length]}
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="an-card">
                  <div className="an-card-header">
                    <div className="an-card-title">CUMULATIVE SAVINGS</div>
                  </div>
                  <p className="an-card-sub">Total amount saved when alert prices were hit</p>
                  {savingsTimeline.length === 0 ? (
                    <div className="an-no-data" style={{ height: 220 }}>
                      <span>💰</span>
                      <span>Savings appear when target prices are hit</span>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={savingsTimeline} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#6ee7b7" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0"    />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fill: "#6b6b6b" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fill: "#6b6b6b" }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={52} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="cumulative" name="Total saved" stroke="#6ee7b7" strokeWidth={2} fill="url(#savGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* ── Row 2: Scrape activity + Platform breakdown + Distance to target ── */}
              <div className="an-grid-3">
                <div className="an-card">
                  <div className="an-card-header">
                    <div className="an-card-title">SCRAPE ACTIVITY (LAST 30 DAYS)</div>
                  </div>
                  <p className="an-card-sub">Number of price readings per day</p>
                  {activityData.length === 0 ? (
                    <div className="an-no-data" style={{ height: 180 }}>
                      <span>📅</span>
                      <span>No activity yet</span>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={activityData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fill: "#6b6b6b" }} axisLine={false} tickLine={false} interval={4} />
                        <YAxis tick={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fill: "#6b6b6b" }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
                        <Tooltip content={<ChartTooltip prefix="" />} />
                        <Bar dataKey="count" name="Readings" fill="rgba(232,255,71,0.3)" radius={[2, 2, 0, 0]}>
                          {activityData.map((_, i) => (
                            <Cell key={i} fill={i === activityData.length - 1 ? "#e8ff47" : "rgba(232,255,71,0.25)"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="an-card">
                  <div className="an-card-header">
                    <div className="an-card-title">PLATFORMS</div>
                  </div>
                  <p className="an-card-sub">Products by e-commerce platform</p>
                  <div style={{ marginTop: 8 }}>
                    {platformData.length === 0 ? (
                      <div className="an-no-data" style={{ height: 120 }}>No data</div>
                    ) : platformData.map((pl) => (
                      <div className="an-platform-row" key={pl.name}>
                        <div className="an-platform-name">{pl.name}</div>
                        <div className="an-platform-bar-wrap">
                          <div
                            className="an-platform-bar"
                            style={{
                              width: `${(pl.value / totalProducts) * 100}%`,
                              background: pl.color,
                            }}
                          />
                        </div>
                        <div className="an-platform-count">{pl.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="an-card">
                  <div className="an-card-header">
                    <div className="an-card-title">DISTANCE TO TARGET</div>
                  </div>
                  <p className="an-card-sub">How far each product is from your target price</p>
                  <div style={{ marginTop: 8 }}>
                    {distanceData.length === 0 ? (
                      <div className="an-no-data" style={{ height: 120 }}>
                        <span>Awaiting first scrape</span>
                      </div>
                    ) : distanceData.slice(0, 6).map((d) => (
                      <div className="an-dist-row" key={d.name}>
                        <div className="an-dist-name" title={d.name}>{d.name}</div>
                        <div className="an-dist-bar-wrap">
                          <div
                            className="an-dist-bar"
                            style={{
                              width: d.hit ? "100%" : `${Math.min(Math.abs(d.pct), 100)}%`,
                              background: d.hit ? "#6ee7b7" : d.pct < 5 ? "#e8ff47" : "rgba(232,255,71,0.3)",
                            }}
                          />
                        </div>
                        <div className="an-dist-pct" style={{ color: d.hit ? "#6ee7b7" : d.pct < 5 ? "var(--accent)" : "var(--muted2)" }}>
                          {d.hit ? "✓ HIT" : `+${d.pct.toFixed(0)}%`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Row 3: Best deal + Most volatile highlights ── */}
              {(bestDeal || mostVolatile) && (
                <div className="an-grid-2" style={{ marginBottom: 16 }}>
                  {bestDeal && (
                    <div className="an-highlight">
                      <div className="an-highlight-label">🏆 BEST DEAL</div>
                      <div className="an-highlight-name">{bestDeal.product.name ?? "Unnamed product"}</div>
                      <div className="an-highlight-val">↓ {bestDeal.dropPct.toFixed(1)}%</div>
                      <div className="an-highlight-sub">
                        From {fmtINR(bestDeal.firstPrice)} → {fmtINR(bestDeal.product.current_price!)}
                        &nbsp;·&nbsp; saving {fmtINR(bestDeal.drop)}
                      </div>
                      <a
                        href={bestDeal.product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-block", marginTop: 14,
                          fontFamily: "'DM Mono',monospace", fontSize: 11,
                          color: "var(--accent)", textDecoration: "none",
                          letterSpacing: "0.06em",
                        }}
                      >
                        VIEW PRODUCT ↗
                      </a>
                    </div>
                  )}
                  {mostVolatile && (
                    <div className="an-highlight" style={{ background: "rgba(255,107,53,0.04)", borderColor: "rgba(255,107,53,0.2)" }}>
                      <div className="an-highlight-label" style={{ color: "var(--accent2)" }}>📈 MOST VOLATILE</div>
                      <div className="an-highlight-name">{mostVolatile.product.name ?? "Unnamed product"}</div>
                      <div className="an-highlight-val" style={{ color: "var(--accent2)" }}>
                        {fmtINR(mostVolatile.range)} swing
                      </div>
                      <div className="an-highlight-sub">
                        Largest price range since tracking started
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Row 4: Individual product sparklines ── */}
              <div className="an-card" style={{ marginBottom: 16 }}>
                <div className="an-card-header">
                  <div className="an-card-title">PRODUCT PRICE HISTORY</div>
                </div>
                <p className="an-card-sub">Individual price history for each tracked product</p>
                {productSparklines.every((s) => s.data.length === 0) ? (
                  <div className="an-no-data" style={{ height: 100 }}>
                    <span>No price history yet — check back after the first cron run</span>
                  </div>
                ) : (
                  <div className="an-sparklines">
                    {productSparklines
                      .filter((s) => s.data.length > 0)
                      .map(({ product: p, data }, idx) => {
                        const prices    = data.map((d) => d.price);
                        const minPrice  = Math.min(...prices);
                        const maxPrice  = Math.max(...prices);
                        const lastPrice = prices[prices.length - 1];
                        const firstPrice = prices[0];
                        const change    = lastPrice - firstPrice;
                        const changePct = ((change / firstPrice) * 100).toFixed(1);
                        const color     = productColors[idx % productColors.length];

                        return (
                          <div className="an-spark-card" key={p.id}>
                            <div className="an-spark-name" title={p.name ?? p.url}>
                              {p.name ?? new URL(p.url).hostname.replace("www.", "")}
                            </div>
                            <div className="an-spark-meta">
                              {data.length} readings &nbsp;·&nbsp;
                              <span style={{ color: change <= 0 ? "#6ee7b7" : "#f87171" }}>
                                {change <= 0 ? "↓" : "↑"} {Math.abs(parseFloat(changePct))}%
                              </span>
                            </div>

                            <ResponsiveContainer width="100%" height={60}>
                              <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                  <linearGradient id={`sg${idx}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
                                    <stop offset="100%" stopColor={color} stopOpacity="0"   />
                                  </linearGradient>
                                </defs>
                                <ReferenceLine y={p.target_price} stroke="rgba(255,107,53,0.5)" strokeDasharray="4 3" strokeWidth={1} />
                                <Area type="monotone" dataKey="price" stroke={color} strokeWidth={1.5} fill={`url(#sg${idx})`} dot={false} />
                              </AreaChart>
                            </ResponsiveContainer>

                            <div className="an-spark-prices">
                              <div className="an-spark-price">
                                <div className="an-spark-plabel">CURRENT</div>
                                <div className="an-spark-pval" style={{ color: lastPrice <= p.target_price ? "#6ee7b7" : "var(--text)" }}>
                                  {fmtK(lastPrice)}
                                </div>
                              </div>
                              <div className="an-spark-price">
                                <div className="an-spark-plabel">TARGET</div>
                                <div className="an-spark-pval" style={{ color: "var(--accent)" }}>{fmtK(p.target_price)}</div>
                              </div>
                              <div className="an-spark-price">
                                <div className="an-spark-plabel">LOW</div>
                                <div className="an-spark-pval" style={{ color: "#6ee7b7" }}>{fmtK(minPrice)}</div>
                              </div>
                              <div className="an-spark-price">
                                <div className="an-spark-plabel">HIGH</div>
                                <div className="an-spark-pval" style={{ color: "var(--accent2)" }}>{fmtK(maxPrice)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                )}
              </div>

            </>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}