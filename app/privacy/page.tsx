// app/privacy/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — PriceHound",
  description: "How PriceHound collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        :root {
          --bg:#0a0a0a; --bg2:#111111; --bg3:#181818;
          --border:rgba(255,255,255,0.08); --border2:rgba(255,255,255,0.14);
          --accent:#e8ff47; --text:#f0ede8; --muted:#6b6b6b; --muted2:#9a9a9a;
        }
        body { background:var(--bg); color:var(--text); font-family:'DM Sans',sans-serif; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

        {/* Nav */}
        <nav style={{
          position: "sticky", top: 0, zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 48px",
          background: "rgba(10,10,10,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}>
          <Link href="/" style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20,
            color: "var(--text)", textDecoration: "none",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ width: 8, height: 8, background: "var(--accent)", borderRadius: "50%", display: "inline-block" }} />
            PriceHound
          </Link>
          <Link href="/" style={{
            fontFamily: "'DM Mono', monospace", fontSize: 11,
            color: "var(--muted2)", textDecoration: "none",
            letterSpacing: "0.06em",
            transition: "color 0.2s",
          }}>
            ← BACK TO HOME
          </Link>
        </nav>

        {/* Content */}
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "64px 32px 96px" }}>

          {/* Header */}
          <div style={{ marginBottom: 48 }}>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 11,
              color: "var(--accent)", letterSpacing: "0.12em",
              marginBottom: 16,
            }}>
              // LEGAL
            </div>
            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: "clamp(36px, 5vw, 56px)",
              letterSpacing: "-2px", lineHeight: 1,
              marginBottom: 16,
            }}>
              Privacy Policy
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted2)", fontFamily: "'DM Mono', monospace" }}>
              Last updated: {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          {/* Sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>

            <Section label="01" title="Overview">
              PriceHound (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is a price tracking tool that monitors
              e-commerce product prices on your behalf and notifies you when they drop
              to your target. This policy explains what data we collect, why we collect
              it, and how we protect it.
              <br /><br />
              By using PriceHound, you agree to the practices described in this policy.
              If you do not agree, please discontinue use and delete your account.
            </Section>

            <Section label="02" title="Data We Collect">
              <strong style={{ color: "var(--text)", fontWeight: 500 }}>Account data</strong>
              <br />
              When you sign in with Google, we receive your name, email address, and
              profile picture from Google&apos;s OAuth service. We store your email
              address and name in our database (Supabase) to identify your account and
              send you price-drop alerts.
              <br /><br />
              <strong style={{ color: "var(--text)", fontWeight: 500 }}>Product tracking data</strong>
              <br />
              We store the product URLs you add, the target prices you set, and the
              price history we scrape over time. This data is tied to your account and
              is used solely to power your price tracking dashboard.
              <br /><br />
              <strong style={{ color: "var(--text)", fontWeight: 500 }}>Notification logs</strong>
              <br />
              We keep a record of every price-alert email we send you — including the
              product, price at the time, and timestamp — so we can avoid sending
              duplicate alerts.
              <br /><br />
              <strong style={{ color: "var(--text)", fontWeight: 500 }}>What we do NOT collect</strong>
              <br />
              We do not collect payment information, precise location data, browsing
              history outside our app, or any data from the Google account beyond your
              basic profile (name + email).
            </Section>

            <Section label="03" title="How We Use Your Data">
              <ul style={{ paddingLeft: 20, lineHeight: 2.2, color: "var(--muted2)" }}>
                {[
                  "To authenticate you and maintain your session",
                  "To scrape and display current prices for products you're tracking",
                  "To send you email alerts when a product reaches your target price",
                  "To show you your price history graphs and notification history",
                  "To prevent duplicate alert emails within a 24-hour window",
                ].map((item) => (
                  <li key={item} style={{ paddingLeft: 8 }}>{item}</li>
                ))}
              </ul>
              <br />
              We do not sell your data, share it with advertisers, or use it for any
              purpose other than providing the PriceHound service.
            </Section>

            <Section label="04" title="Data Storage & Security">
              Your data is stored in Supabase, a PostgreSQL-based cloud database with
              row-level security (RLS) enabled. RLS ensures that each user can only
              read and write their own rows — no user can access another user&apos;s
              tracked products, prices, or notification logs.
              <br /><br />
              Authentication is handled entirely by Supabase Auth using Google OAuth 2.0.
              We never see or store your Google password. Session tokens are stored in
              secure, HttpOnly cookies.
              <br /><br />
              Price-drop email alerts are sent via a dedicated Gmail account using an
              App Password. Your email address is used only as a delivery address and
              is never shared with third parties.
            </Section>

            <Section label="05" title="Third-Party Services">
              PriceHound uses the following third-party services:
              <br /><br />
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
                {[
                  { name: "Supabase", purpose: "Database and authentication", link: "https://supabase.com/privacy" },
                  { name: "Google OAuth", purpose: "Sign-in provider", link: "https://policies.google.com/privacy" },
                  { name: "Vercel", purpose: "Hosting and serverless functions", link: "https://vercel.com/legal/privacy-policy" },
                  { name: "Gmail (SMTP)", purpose: "Sending price-alert emails", link: "https://policies.google.com/privacy" },
                ].map((s) => (
                  <div key={s.name} style={{
                    background: "var(--bg2)", border: "1px solid var(--border)",
                    padding: "12px 16px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    gap: 16,
                  }}>
                    <div>
                      <span style={{ fontWeight: 500, color: "var(--text)", fontSize: 13 }}>{s.name}</span>
                      <span style={{ color: "var(--muted2)", fontSize: 13, marginLeft: 12 }}>{s.purpose}</span>
                    </div>
                    <a href={s.link} target="_blank" rel="noopener noreferrer" style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 10,
                      color: "var(--muted)", textDecoration: "none", letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}>
                      PRIVACY POLICY ↗
                    </a>
                  </div>
                ))}
              </div>
            </Section>

            <Section label="06" title="Cookies & Sessions">
              We use a single session cookie set by Supabase Auth to keep you signed in.
              This cookie is:
              <ul style={{ paddingLeft: 20, lineHeight: 2.2, marginTop: 8, color: "var(--muted2)" }}>
                <li style={{ paddingLeft: 8 }}>HttpOnly — not accessible to JavaScript</li>
                <li style={{ paddingLeft: 8 }}>Secure — only sent over HTTPS in production</li>
                <li style={{ paddingLeft: 8 }}>Session-scoped or expires after 7 days</li>
              </ul>
              <br />
              We do not use advertising cookies, analytics cookies, or any third-party
              tracking pixels.
            </Section>

            <Section label="07" title="Your Rights">
              You have the right to:
              <ul style={{ paddingLeft: 20, lineHeight: 2.2, marginTop: 8, color: "var(--muted2)" }}>
                <li style={{ paddingLeft: 8 }}>Access all data we hold about you (your dashboard shows it all)</li>
                <li style={{ paddingLeft: 8 }}>Delete any tracked product and its price history at any time</li>
                <li style={{ paddingLeft: 8 }}>Delete your account — email us and we will permanently erase all your data within 7 days</li>
                <li style={{ paddingLeft: 8 }}>Opt out of alerts by pausing or deleting products from your dashboard</li>
              </ul>
            </Section>

            <Section label="08" title="Data Retention">
              We retain your data for as long as your account is active. If you delete
              your account, all associated data — profile, tracked products, price
              history, and notification logs — is permanently deleted within 7 days.
              <br /><br />
              Price history for individual products is retained indefinitely while the
              product is tracked, and deleted immediately when you remove the product
              from your dashboard.
            </Section>

            <Section label="09" title="Changes to This Policy">
              We may update this policy from time to time. When we do, we will update
              the &quot;Last updated&quot; date at the top of this page. Continued use of
              PriceHound after changes are posted constitutes acceptance of the new
              policy.
            </Section>

            <Section label="10" title="Contact">
              If you have any questions about this privacy policy or want to request
              data deletion, please contact us at:
              <br /><br />
              <a href="mailto:privacy@pricehound.app" style={{
                fontFamily: "'DM Mono', monospace", fontSize: 13,
                color: "var(--accent)", textDecoration: "none",
              }}>
                privacy@pricehound.app
              </a>
            </Section>

          </div>
        </div>

        {/* Footer */}
        <footer style={{
          borderTop: "1px solid var(--border)",
          padding: "24px 48px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <Link href="/" style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15,
            color: "var(--text)", textDecoration: "none",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 7, height: 7, background: "var(--accent)", borderRadius: "50%", display: "inline-block" }} />
            PriceHound
          </Link>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--muted)" }}>
            © {new Date().getFullYear()} PriceHound
          </span>
          <div style={{ display: "flex", gap: 24 }}>
            <Link href="/privacy" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>Privacy</Link>
            <Link href="/dashboard" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--muted)", textDecoration: "none" }}>Dashboard</Link>
          </div>
        </footer>
      </div>
    </>
  );
}

// ── Section component ─────────────────────────────────────────
function Section({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 12,
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10,
          color: "var(--accent)", letterSpacing: "0.1em",
        }}>
          {label}
        </span>
        <h2 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 700,
          fontSize: 20, letterSpacing: "-0.5px",
        }}>
          {title}
        </h2>
      </div>
      <div style={{
        fontSize: 14, color: "var(--muted2)",
        lineHeight: 1.8, fontWeight: 300,
      }}>
        {children}
      </div>
    </div>
  );
}