"use client";

import { useState } from "react";
import type { NotificationLog, TrackedProduct } from "@/types/supabase";
import { formatPrice } from "@/lib/utils";

interface Props {
  logs:     NotificationLog[];
  products: TrackedProduct[];
  email:    string;
}

export default function NotificationSettings({ logs, products, email }: Props) {
  const [sending,    setSending]    = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleTestEmail = async () => {
    setSending(true);
    setTestResult(null);
    try {
      const res  = await fetch("/api/notify/test", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ ok: true,  msg: `Test email sent to ${data.sentTo}` });
      } else {
        setTestResult({ ok: false, msg: data.error ?? "Failed to send" });
      }
    } catch {
      setTestResult({ ok: false, msg: "Network error" });
    } finally {
      setSending(false);
    }
  };

  const getProductName = (productId: string) =>
    products.find((p) => p.id === productId)?.name ?? "Unknown product";

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Email config card ── */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        padding: "20px 24px",
      }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10,
          color: "var(--muted)", letterSpacing: "0.12em",
          textTransform: "uppercase", marginBottom: 16,
        }}>
          // NOTIFICATION SETTINGS
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--muted2)", marginBottom: 8, lineHeight: 1.6 }}>
              Price drop alerts are sent to your Gmail address. Make sure{" "}
              <code style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                background: "var(--bg3)", padding: "2px 6px",
                color: "var(--accent)",
              }}>GMAIL_USER</code> and{" "}
              <code style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                background: "var(--bg3)", padding: "2px 6px",
                color: "var(--accent)",
              }}>GMAIL_APP_PASSWORD</code> are set in your{" "}
              <code style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                background: "var(--bg3)", padding: "2px 6px",
                color: "var(--muted2)",
              }}>.env.local</code>.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "var(--success)",
              }} />
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 12,
                color: "var(--text)",
              }}>{email}</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
            <button
              onClick={handleTestEmail}
              disabled={sending}
              style={{
                background: "transparent",
                border: "1px solid rgba(232,255,71,0.3)",
                color: "var(--accent)",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11, padding: "9px 18px",
                cursor: sending ? "not-allowed" : "pointer",
                letterSpacing: "0.06em",
                opacity: sending ? 0.5 : 1,
                display: "flex", alignItems: "center", gap: 8,
                transition: "all 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              {sending && (
                <span style={{
                  width: 10, height: 10,
                  border: "2px solid rgba(232,255,71,0.2)",
                  borderTopColor: "#e8ff47",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "ns-spin 0.7s linear infinite",
                }} />
              )}
              {sending ? "SENDING…" : "✉ SEND TEST EMAIL"}
            </button>

            {testResult && (
              <div style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                color: testResult.ok ? "var(--success)" : "var(--danger)",
                maxWidth: 220, textAlign: "right", lineHeight: 1.5,
              }}>
                {testResult.ok ? "✓ " : "⚠ "}{testResult.msg}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── How alerts work ── */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        padding: "20px 24px",
      }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10,
          color: "var(--muted)", letterSpacing: "0.12em",
          textTransform: "uppercase", marginBottom: 16,
        }}>
          // HOW IT WORKS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { icon: "⏱", title: "Checked every 4 hours", desc: "The cron job runs every 4 hours and scrapes all your active products." },
            { icon: "🎯", title: "One alert per target", desc: "We send one email when the price first hits your target. Reset by editing your target price." },
            { icon: "📥", title: "Delivered to your Gmail", desc: "Alerts land in the inbox of the Gmail you signed in with." },
          ].map((item) => (
            <div key={item.title} style={{
              background: "var(--bg3)", border: "1px solid var(--border)",
              padding: "14px 16px",
            }}>
              <div style={{ fontSize: 20, marginBottom: 10 }}>{item.icon}</div>
              <div style={{
                fontFamily: "'Syne', sans-serif", fontWeight: 700,
                fontSize: 13, letterSpacing: "-0.3px", marginBottom: 6,
              }}>{item.title}</div>
              <div style={{ fontSize: 12, color: "var(--muted2)", lineHeight: 1.6, fontWeight: 300 }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Notification log ── */}
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        padding: "20px 24px",
      }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10,
          color: "var(--muted)", letterSpacing: "0.12em",
          textTransform: "uppercase", marginBottom: 16,
        }}>
          // ALERT HISTORY ({logs.length})
        </div>

        {logs.length === 0 ? (
          <div style={{
            padding: "32px 0", textAlign: "center",
            fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--muted)",
          }}>
            No alerts sent yet. Add a product and set a target price to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {/* Header row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 120px 140px",
              gap: 12, padding: "8px 12px",
              fontFamily: "'DM Mono', monospace",
              fontSize: 10, color: "var(--muted)",
              letterSpacing: "0.08em",
              background: "var(--bg3)",
            }}>
              <span>PRODUCT</span>
              <span>PRICE AT ALERT</span>
              <span>SENT TO</span>
              <span>WHEN</span>
            </div>

            {logs.map((log) => (
              <div key={log.id} style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 120px 140px",
                gap: 12, padding: "12px",
                background: "var(--bg3)",
                borderTop: "1px solid var(--border)",
                alignItems: "center",
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: "var(--text)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {getProductName(log.product_id)}
                </div>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 12,
                  color: "var(--success)",
                }}>
                  {fmt(log.price)}
                </div>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 11,
                  color: "var(--muted2)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {log.email}
                </div>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 11,
                  color: "var(--muted)",
                }}>
                  {new Date(log.sent_at).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ns-spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .ns-how-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
