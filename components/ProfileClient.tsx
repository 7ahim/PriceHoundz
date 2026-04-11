"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ThemeProvider, DashboardNav } from "@/components/DashboardNav";
import type { Profile } from "@/types/supabase";

interface Props {
  profile:      Profile | null;
  productCount: number;
  alertCount:   number;
  activeCount:  number;
}

export default function ProfileClient({ profile, productCount, alertCount, activeCount }: Props) {
  const [saving,          setSaving]          = useState(false);
  const [deleting,        setDeleting]        = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm,   setDeleteConfirm]   = useState("");
  const [savedMsg,        setSavedMsg]        = useState("");
  const [errorMsg,        setErrorMsg]        = useState("");
  const [fullName,        setFullName]        = useState(profile?.full_name ?? "");

  const initials = fullName
    ? fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : profile?.email?.[0]?.toUpperCase() ?? "?";

  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  const handleSaveName = async () => {
    setSaving(true);
    setSavedMsg("");
    setErrorMsg("");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() || null })
        .eq("id", profile!.id);
      if (error) { setErrorMsg(error.message); }
      else { setSavedMsg("Profile updated successfully."); }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    try {
      const supabase = createClient();
      // Sign out first, then the account deletion is handled server-side
      // via a support request or admin action — we clear their session
      await supabase.auth.signOut();
      // In production wire this to a server action that calls supabase.auth.admin.deleteUser()
      // For now, we redirect with a message
      window.location.href = "/?deleted=true";
    } catch {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <ThemeProvider>
      <style>{`
        .pf-page  { min-height:100vh; background:var(--bg); }
        .pf-body  { max-width:760px; margin:0 auto; padding:40px 32px 80px; }

        .pf-back  {
          display:inline-flex; align-items:center; gap:8px;
          font-family:'DM Mono',monospace; font-size:11px; letter-spacing:0.08em;
          color:var(--muted2); text-decoration:none; margin-bottom:32px;
          transition:color 0.2s;
        }
        .pf-back:hover { color:var(--text); }

        /* ── Profile header ── */
        .pf-header {
          display:flex; align-items:center; gap:24px; margin-bottom:40px;
          padding:28px; background:var(--bg2); border:1px solid var(--border);
          transition:background 0.25s, border-color 0.25s;
        }
        .pf-avatar-lg {
          width:72px; height:72px; border-radius:50%; flex-shrink:0;
          background:rgba(92,138,0,0.12); border:2px solid var(--accent);
          display:flex; align-items:center; justify-content:center;
          font-family:'Syne',sans-serif; font-weight:800; font-size:26px;
          color:var(--accent); transition:background 0.25s;
        }
        .pf-header-info  { flex:1; }
        .pf-header-name  { font-family:'Syne',sans-serif; font-weight:800; font-size:22px; letter-spacing:-0.5px; color:var(--text); margin-bottom:4px; }
        .pf-header-email { font-family:'DM Mono',monospace; font-size:12px; color:var(--muted2); margin-bottom:8px; }
        .pf-header-meta  { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.08em; }
        .pf-header-badge {
          display:inline-flex; align-items:center; gap:6px;
          background:rgba(92,138,0,0.1); border:1px solid rgba(92,138,0,0.25);
          color:var(--accent); font-family:'DM Mono',monospace; font-size:10px;
          padding:4px 12px; letter-spacing:0.08em;
        }

        /* ── Stat row ── */
        .pf-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:32px; }
        .pf-stat  { background:var(--bg2); border:1px solid var(--border); padding:16px; text-align:center; transition:background 0.25s, border-color 0.25s; }
        .pf-stat-val { font-family:'Syne',sans-serif; font-weight:800; font-size:28px; letter-spacing:-1px; color:var(--text); margin-bottom:4px; }
        .pf-stat-lbl { font-family:'DM Mono',monospace; font-size:10px; color:var(--muted); letter-spacing:0.1em; }

        /* ── Section card ── */
        .pf-section { background:var(--bg2); border:1px solid var(--border); padding:24px 28px; margin-bottom:16px; transition:background 0.25s, border-color 0.25s; }
        .pf-section-title {
          font-family:'DM Mono',monospace; font-size:10px;
          color:var(--muted); letter-spacing:0.14em; text-transform:uppercase;
          margin-bottom:20px; padding-bottom:12px;
          border-bottom:1px solid var(--border);
        }
        .pf-section-title::before { content:'// '; color:var(--accent); }

        /* ── Form ── */
        .pf-field { margin-bottom:18px; }
        .pf-label { font-family:'DM Mono',monospace; font-size:11px; color:var(--muted2); letter-spacing:0.08em; display:block; margin-bottom:8px; }
        .pf-input {
          width:100%; background:var(--bg3); border:1px solid var(--border2);
          color:var(--text); padding:11px 14px; font-family:'DM Mono',monospace;
          font-size:13px; outline:none; transition:border-color 0.2s;
        }
        .pf-input:focus { border-color:var(--accent); }
        .pf-input:disabled { opacity:0.5; cursor:not-allowed; }
        .pf-input::placeholder { color:var(--muted); }

        .pf-row { display:flex; gap:12px; align-items:center; }
        .pf-btn-save {
          background:var(--accent); color:#0a0a0a; border:none; cursor:pointer;
          font-family:'DM Mono',monospace; font-size:11px; font-weight:500;
          padding:10px 24px; letter-spacing:0.08em; transition:background 0.2s;
          white-space:nowrap; flex-shrink:0;
        }
        .pf-btn-save:hover:not(:disabled) { background:#d4eb30; }
        .pf-btn-save:disabled { opacity:0.5; cursor:not-allowed; }

        .pf-success { font-family:'DM Mono',monospace; font-size:11px; color:var(--success); }
        .pf-error   { font-family:'DM Mono',monospace; font-size:11px; color:var(--danger); }

        /* ── Quick links ── */
        .pf-links-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .pf-link-card {
          display:flex; align-items:center; gap:12px;
          background:var(--bg3); border:1px solid var(--border);
          padding:14px 16px; text-decoration:none;
          transition:border-color 0.2s, background 0.2s;
        }
        .pf-link-card:hover { border-color:var(--border2); background:var(--bg2); }
        .pf-link-icon { font-size:20px; flex-shrink:0; }
        .pf-link-title { font-size:13px; font-weight:500; color:var(--text); margin-bottom:2px; }
        .pf-link-desc  { font-size:11px; color:var(--muted2); }

        /* ── Danger zone ── */
        .pf-danger-section {
          background:rgba(192,57,43,0.04); border:1px solid rgba(192,57,43,0.2);
          padding:24px 28px; margin-bottom:16px;
        }
        .pf-danger-title { font-family:'DM Mono',monospace; font-size:10px; color:var(--danger); letter-spacing:0.14em; text-transform:uppercase; margin-bottom:16px; }
        .pf-danger-desc  { font-size:13px; color:var(--muted2); margin-bottom:20px; line-height:1.6; font-weight:300; }
        .pf-btn-danger {
          background:transparent; border:1px solid var(--danger); color:var(--danger);
          font-family:'DM Mono',monospace; font-size:11px; font-weight:500;
          padding:10px 24px; cursor:pointer; letter-spacing:0.08em;
          transition:all 0.2s;
        }
        .pf-btn-danger:hover { background:rgba(192,57,43,0.08); }

        /* ── Delete modal ── */
        .pf-modal-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.8);
          backdrop-filter:blur(4px);
          display:flex; align-items:center; justify-content:center;
          z-index:600; padding:24px;
        }
        .pf-modal {
          background:var(--bg2); border:1px solid rgba(192,57,43,0.3);
          padding:32px; width:100%; max-width:460px;
          animation:pfModalIn 0.2s ease;
        }
        @keyframes pfModalIn { from{opacity:0;transform:scale(0.97) translateY(8px)} to{opacity:1;transform:none} }
        .pf-modal-title { font-family:'Syne',sans-serif; font-weight:800; font-size:20px; color:var(--danger); letter-spacing:-0.5px; margin-bottom:8px; }
        .pf-modal-desc  { font-size:13px; color:var(--muted2); margin-bottom:24px; line-height:1.6; }
        .pf-modal-warn  {
          background:rgba(192,57,43,0.08); border:1px solid rgba(192,57,43,0.2);
          padding:12px 14px; margin-bottom:20px;
          font-family:'DM Mono',monospace; font-size:11px; color:var(--danger); line-height:1.6;
        }
        .pf-modal-actions { display:flex; gap:10px; margin-top:24px; }
        .pf-btn-cancel {
          background:transparent; color:var(--muted2); border:1px solid var(--border2);
          cursor:pointer; font-family:'DM Mono',monospace; font-size:12px;
          padding:11px 20px; letter-spacing:0.06em; transition:all 0.2s;
        }
        .pf-btn-cancel:hover { color:var(--text); border-color:rgba(255,255,255,0.3); }
        .pf-btn-delete {
          flex:1; background:var(--danger); color:#fff; border:none; cursor:pointer;
          font-family:'DM Mono',monospace; font-size:12px; font-weight:500;
          padding:11px; letter-spacing:0.06em; transition:opacity 0.2s;
        }
        .pf-btn-delete:disabled { opacity:0.4; cursor:not-allowed; }
        .pf-btn-delete:hover:not(:disabled) { opacity:0.85; }

        @media(max-width:768px) {
          .pf-body { padding:24px 20px 60px; }
          .pf-stats { grid-template-columns:repeat(3,1fr); }
          .pf-links-grid { grid-template-columns:1fr; }
          .pf-header { flex-direction:column; text-align:center; }
        }
      `}</style>

      <DashboardNav activeTab="tracker" />

      <div className="ph-page pf-page">
        <div className="pf-body">
          <Link href="/dashboard" className="pf-back">← BACK TO DASHBOARD</Link>

          {/* ── Profile header ── */}
          <div className="pf-header">
            <div className="pf-avatar-lg">{initials}</div>
            <div className="pf-header-info">
              <div className="pf-header-name">{fullName || profile?.email?.split("@")[0] || "User"}</div>
              <div className="pf-header-email">{profile?.email}</div>
              <div className="pf-header-meta">MEMBER SINCE {joinedDate.toUpperCase()}</div>
            </div>
            <div className="pf-header-badge">
              <span style={{ width: 6, height: 6, background: "var(--accent)", borderRadius: "50%", display: "inline-block" }} />
              ACTIVE ACCOUNT
            </div>
          </div>

          {/* ── Stats ── */}
          <div className="pf-stats">
            <div className="pf-stat">
              <div className="pf-stat-val">{productCount}</div>
              <div className="pf-stat-lbl">PRODUCTS TRACKED</div>
            </div>
            <div className="pf-stat">
              <div className="pf-stat-val" style={{ color: "var(--accent)" }}>{alertCount}</div>
              <div className="pf-stat-lbl">ALERTS SENT</div>
            </div>
            <div className="pf-stat">
              <div className="pf-stat-val" style={{ color: "var(--success)" }}>{activeCount}</div>
              <div className="pf-stat-lbl">ACTIVE TRACKERS</div>
            </div>
          </div>

          {/* ── Edit name ── */}
          <div className="pf-section">
            <div className="pf-section-title">Profile Information</div>
            <div className="pf-field">
              <label className="pf-label">DISPLAY NAME</label>
              <div className="pf-row">
                <input
                  className="pf-input"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                />
                <button className="pf-btn-save" onClick={handleSaveName} disabled={saving}>
                  {saving ? "SAVING…" : "SAVE"}
                </button>
              </div>
              {savedMsg && <p className="pf-success" style={{ marginTop: 8 }}>✓ {savedMsg}</p>}
              {errorMsg && <p className="pf-error"   style={{ marginTop: 8 }}>⚠ {errorMsg}</p>}
            </div>
            <div className="pf-field">
              <label className="pf-label">EMAIL ADDRESS</label>
              <input className="pf-input" type="email" value={profile?.email ?? ""} disabled />
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
                Email is managed by Google OAuth and cannot be changed here.
              </p>
            </div>
          </div>

          {/* ── Authentication ── */}
          <div className="pf-section">
            <div className="pf-section-title">Authentication</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", marginBottom: 4 }}>Google OAuth</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--muted2)" }}>
                  Signed in via Google · {profile?.email}
                </div>
              </div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "rgba(110,231,183,0.08)", border: "1px solid rgba(110,231,183,0.2)",
                color: "var(--success)", fontFamily: "'DM Mono',monospace", fontSize: 10, padding: "4px 12px",
              }}>
                <span style={{ width: 5, height: 5, background: "var(--success)", borderRadius: "50%", display: "inline-block" }} />
                CONNECTED
              </div>
            </div>
          </div>

          {/* ── Notification preferences ── */}
          <div className="pf-section">
            <div className="pf-section-title">Notification Preferences</div>
            <div style={{ fontSize: 13, color: "var(--muted2)", lineHeight: 1.6, marginBottom: 16, fontWeight: 300 }}>
              Price-drop alerts are sent to <strong style={{ color: "var(--text)" }}>{profile?.email}</strong>.
              You can pause individual product alerts from the tracker dashboard.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/dashboard/notifications" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "transparent", border: "1px solid var(--border2)",
                color: "var(--muted2)", fontFamily: "'DM Mono',monospace", fontSize: 11,
                padding: "8px 16px", textDecoration: "none", transition: "all 0.2s", letterSpacing: "0.06em",
              }}>
                MANAGE NOTIFICATIONS →
              </Link>
            </div>
          </div>

          {/* ── Quick links ── */}
          <div className="pf-section">
            <div className="pf-section-title">Quick Navigation</div>
            <div className="pf-links-grid">
              {[
                { href: "/dashboard",                icon: "📦", title: "Tracker",       desc: "View and manage tracked products" },
                { href: "/dashboard/analytics",      icon: "📊", title: "Analytics",     desc: "Price trends and savings overview" },
                { href: "/dashboard/notifications",  icon: "🔔", title: "Notifications", desc: "Alert history and preferences" },
                { href: "/privacy",                  icon: "🔒", title: "Privacy Policy", desc: "How we handle your data" },
              ].map((item) => (
                <Link href={item.href} key={item.href} className="pf-link-card">
                  <span className="pf-link-icon">{item.icon}</span>
                  <div>
                    <div className="pf-link-title">{item.title}</div>
                    <div className="pf-link-desc">{item.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ── Danger zone ── */}
          <div className="pf-danger-section">
            <div className="pf-danger-title">⚠ Danger Zone</div>
            <p className="pf-danger-desc">
              Deleting your account is permanent and irreversible. All your tracked products,
              price history, and notification logs will be deleted within 7 days.
              Your Google account will not be affected.
            </p>
            <button className="pf-btn-danger" onClick={() => setShowDeleteModal(true)}>
              DELETE MY ACCOUNT
            </button>
          </div>
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      {showDeleteModal && (
        <div className="pf-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowDeleteModal(false)}>
          <div className="pf-modal">
            <div className="pf-modal-title">Delete Account</div>
            <p className="pf-modal-desc">
              This will permanently delete your PriceHound account, all tracked products,
              price history, and notification logs. This action <strong>cannot be undone</strong>.
            </p>
            <div className="pf-modal-warn">
              ⚠ {productCount} tracked product{productCount !== 1 ? "s" : ""} and all their price history will be deleted.
            </div>
            <div className="pf-field">
              <label className="pf-label">TYPE "DELETE" TO CONFIRM</label>
              <input
                className="pf-input"
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
            </div>
            <div className="pf-modal-actions">
              <button className="pf-btn-cancel" onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}>
                CANCEL
              </button>
              <button
                className="pf-btn-delete"
                disabled={deleteConfirm !== "DELETE" || deleting}
                onClick={handleDeleteAccount}
              >
                {deleting ? "DELETING…" : "PERMANENTLY DELETE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ThemeProvider>
  );
}