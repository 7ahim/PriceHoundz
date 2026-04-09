"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ─────────────────────────────────────────────────────────────
//  LoginContent — reads search params, must be inside Suspense
// ─────────────────────────────────────────────────────────────
function LoginContent() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const redirectTo   = searchParams.get("redirectTo") ?? "/dashboard";
  const errorMsg     = searchParams.get("error");

  const handleGoogleLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    // Page redirects — loading stays true intentionally
  };

  return (
    <div className="login-wrap">
      {/* Left decorative panel */}
      <div className="login-left">
        <div className="login-glow" />
        <a href="/" className="login-logo">
          <div className="login-logo-dot" />
          PriceHound
        </a>
        <div className="login-tagline">
          <h2>Hunt smarter.<br />Save more.</h2>
          <p>
            Track prices across Amazon, Flipkart, and Myntra.
            Get notified the moment your target price is hit.
          </p>
        </div>
        <div className="login-features">
          {[
            "Real-time price tracking",
            "Gmail alerts when prices drop",
            "Price history graphs",
            "Multi-platform support",
          ].map((f) => (
            <div className="login-feat" key={f}>
              <div className="login-feat-dot" />
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Right sign-in panel */}
      <div className="login-right">
        <div className="login-card">
          <div className="login-card-title">Welcome back.</div>
          <div className="login-card-sub">
            Sign in to your dashboard to start tracking prices.
          </div>

          {errorMsg && (
            <div className="login-error">
              ⚠ {decodeURIComponent(errorMsg)}
            </div>
          )}

          <button
            className="btn-google"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? (
              <div className="login-spinner" />
            ) : (
              <svg className="btn-google-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {loading ? "REDIRECTING..." : "CONTINUE WITH GOOGLE"}
          </button>

          <div className="login-divider">
            <div className="login-divider-line" />
            <div className="login-divider-text">SECURE AUTH BY SUPABASE</div>
            <div className="login-divider-line" />
          </div>

          <div className="login-info">
            By signing in you agree to our{" "}
            <a href="#">Terms of Service</a> and{" "}
            <a href="/privacy">Privacy Policy</a>.<br />
            We only request read access to your Gmail profile.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Fallback shown while Suspense resolves
// ─────────────────────────────────────────────────────────────
function LoginFallback() {
  return (
    <div className="login-wrap">
      <div className="login-left">
        <div className="login-glow" />
        <a href="/" className="login-logo">
          <div className="login-logo-dot" />
          PriceHound
        </a>
        <div className="login-tagline">
          <h2>Hunt smarter.<br />Save more.</h2>
          <p>Track prices across Amazon, Flipkart, and Myntra.</p>
        </div>
      </div>
      <div className="login-right">
        <div className="login-card">
          <div className="login-card-title">Welcome back.</div>
          <div className="login-card-sub">Loading…</div>
          <button className="btn-google" disabled>
            <div className="login-spinner" />
            LOADING
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Page export — wraps LoginContent in Suspense
//  This satisfies Next.js App Router's requirement that any
//  component calling useSearchParams() must be inside a
//  Suspense boundary at the page level.
// ─────────────────────────────────────────────────────────────
export default function LoginPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --bg: #0a0a0a; --bg2: #111111; --bg3: #181818;
          --border: rgba(255,255,255,0.08); --border2: rgba(255,255,255,0.14);
          --accent: #e8ff47; --text: #f0ede8; --muted: #6b6b6b; --muted2: #9a9a9a;
        }
        body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; }

        @keyframes pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(232,255,71,0.4); }
          50%      { box-shadow: 0 0 0 8px rgba(232,255,71,0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .login-wrap {
          min-height: 100vh; display: flex;
          position: relative; overflow: hidden;
        }

        /* ── Left panel ── */
        .login-left {
          flex: 1; background: var(--bg2);
          border-right: 1px solid var(--border);
          padding: 48px; display: flex; flex-direction: column;
          justify-content: space-between;
          position: relative; overflow: hidden;
        }
        .login-left::before {
          content: ''; position: absolute; inset: 0;
          background-image:
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px);
          background-size: 50px 50px; opacity: 0.5;
        }
        .login-glow {
          position: absolute; width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(232,255,71,0.07) 0%, transparent 70%);
          bottom: -100px; right: -100px; pointer-events: none;
        }
        .login-logo {
          font-family: 'Syne', sans-serif; font-weight: 800; font-size: 22px;
          display: flex; align-items: center; gap: 8px;
          position: relative; z-index: 1;
          text-decoration: none; color: var(--text);
        }
        .login-logo-dot {
          width: 8px; height: 8px; background: var(--accent);
          border-radius: 50%; animation: pulse 2s ease-in-out infinite;
        }
        .login-tagline { position: relative; z-index: 1; }
        .login-tagline h2 {
          font-family: 'Syne', sans-serif; font-weight: 800;
          font-size: clamp(32px, 3vw, 48px);
          letter-spacing: -2px; line-height: 1.05; margin-bottom: 16px;
        }
        .login-tagline p {
          font-size: 15px; color: var(--muted2);
          font-weight: 300; line-height: 1.6; max-width: 360px;
        }
        .login-features {
          display: flex; flex-direction: column; gap: 14px;
          position: relative; z-index: 1;
        }
        .login-feat {
          display: flex; align-items: center; gap: 12px;
          font-family: 'DM Mono', monospace; font-size: 12px; color: var(--muted2);
        }
        .login-feat-dot {
          width: 6px; height: 6px; background: var(--accent);
          border-radius: 50%; flex-shrink: 0;
        }

        /* ── Right panel ── */
        .login-right {
          width: 480px; display: flex;
          align-items: center; justify-content: center; padding: 48px;
        }
        .login-card { width: 100%; animation: fadeUp 0.5s 0.1s ease both; }
        .login-card-title {
          font-family: 'Syne', sans-serif; font-weight: 800;
          font-size: 28px; letter-spacing: -1px; margin-bottom: 8px;
        }
        .login-card-sub {
          font-size: 14px; color: var(--muted2);
          font-weight: 300; margin-bottom: 40px; line-height: 1.5;
        }
        .login-error {
          background: rgba(255,107,53,0.1); border: 1px solid rgba(255,107,53,0.3);
          color: #ff6b35; font-family: 'DM Mono', monospace; font-size: 12px;
          padding: 12px 16px; margin-bottom: 24px; line-height: 1.5;
        }
        .btn-google {
          width: 100%; background: var(--bg2); border: 1px solid var(--border2);
          color: var(--text); font-family: 'DM Mono', monospace;
          font-size: 13px; font-weight: 500; padding: 14px 24px;
          cursor: pointer; letter-spacing: 0.05em;
          display: flex; align-items: center; justify-content: center; gap: 12px;
          transition: background 0.2s, border-color 0.2s, transform 0.15s;
        }
        .btn-google:hover:not(:disabled) {
          background: var(--bg3); border-color: rgba(255,255,255,0.25);
          transform: translateY(-1px);
        }
        .btn-google:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-google-icon { width: 18px; height: 18px; flex-shrink: 0; }
        .login-divider {
          display: flex; align-items: center; gap: 16px; margin: 32px 0;
        }
        .login-divider-line { flex: 1; height: 1px; background: var(--border); }
        .login-divider-text {
          font-family: 'DM Mono', monospace; font-size: 11px;
          color: var(--muted); letter-spacing: 0.08em;
        }
        .login-info {
          font-family: 'DM Mono', monospace; font-size: 11px;
          color: var(--muted); line-height: 1.6; text-align: center;
        }
        .login-info a { color: var(--muted2); text-decoration: underline; }
        .login-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: var(--text); border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @media (max-width: 768px) {
          .login-left  { display: none; }
          .login-right { width: 100%; }
        }
      `}</style>

      {/* LoginContent reads useSearchParams — must be in Suspense */}
      <Suspense fallback={<LoginFallback />}>
        <LoginContent />
      </Suspense>
    </>
  );
}