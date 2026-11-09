"use client";

import { useState, useEffect, useCallback } from "react";
import Joyride from "react-joyride";
import type { Step, CallBackProps, Styles } from "react-joyride";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";

const TOUR_SEEN_KEY      = "pricehound_tour_seen";
const AN_TOUR_SEEN_KEY   = "pricehound_an_tour_seen";

// ── Steps ────────────────────────────────────────────────────
// `target` is a CSS selector (comma lists allowed). When the tour starts we
// resolve each one to the FIRST VISIBLE matching element; steps whose target
// is missing or hidden (e.g. the sidebar on mobile, or price cards when no
// product exists) are dropped, so the spotlight never points at nothing.
type TourStep = Step & { target: string };

const TRACKER_STEPS: TourStep[] = [
  {
    target: ".db-add-btn",
    title: "Add a product",
    content: "Paste a product URL from Amazon, Flipkart, Myntra, Croma, Reliance Digital or Poorvika along with your target price. We fetch the current price instantly.",
    placement: "right",
    disableBeacon: true,
  },
  {
    // Mobile only — the sidebar lives in a drawer behind this button
    target: ".db-mobile-toggle",
    title: "Your products",
    content: "Tap here to open your product list and the Add Product button.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-stats",
    title: "Your at-a-glance stats",
    content: "Total products tracked, alerts sent, price checks collected, and paused trackers.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-product-list",
    title: "Your tracked products",
    content: "Every product you add appears here. Green dot = actively tracking. Yellow = target price hit. Grey = paused.",
    placement: "right",
    disableBeacon: true,
  },
  {
    target: ".db-platform-badges",
    title: "Stores & status",
    content: "The first badge is the store this product was added from. Any other stores you link in the Compare panel get their own badge here, next to the live tracking status.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-detail-actions",
    title: "Manage a tracked product",
    content: "Edit your target price, refresh the price now, pause tracking temporarily, or delete the product entirely.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-price-cards",
    title: "Price at a glance",
    content: "Current price, your target, all-time low and all-time high, in four cards.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-chart-section",
    title: "Price history chart",
    content: "The line shows price movement over time, and the dashed line is your target. Stores you link below appear here as extra coloured lines so you can compare them.",
    placement: "top",
    disableBeacon: true,
  },
  {
    target: ".db-cross-panel",
    title: "Compare on other stores",
    content: "Paste the same product's link from another store. Prices are re-checked daily and plotted on the chart above, and you get an email as soon as any store reaches your target.",
    placement: "top",
    disableBeacon: true,
  },
  {
    target: ".db-user",
    title: "Your account",
    content: "Your signed-in Gmail. All price drop alerts land here. Click it to open your profile, or use the sign-out icon.",
    placement: "top",
    disableBeacon: true,
  },
  {
    target: ".ph-nav-tab[href='/dashboard/analytics']",
    title: "Explore Analytics",
    content: "Head to the Analytics tab for savings charts, price trends, scrape activity, and sparklines for every tracked product.",
    placement: "bottom",
    disableBeacon: true,
  },
];

const ANALYTICS_STEPS: TourStep[] = [
  {
    target: ".an-header",
    title: "Analytics overview",
    content: "Every chart and stat on this page comes from the price checks PriceHound has collected for your products.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".an-stats",
    title: "Six headline numbers",
    content: "Products tracked, data points, alerts sent, potential savings, best price drop, and your most volatile product.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".an-grid-2",
    title: "Price trends & savings",
    content: "Trends for all products on one axis, and the savings that stack up every time a target price is hit.",
    placement: "top",
    disableBeacon: true,
  },
  {
    target: ".an-sparklines",
    title: "Product sparklines",
    content: "A mini chart per product with current price, target, all-time low and all-time high in one compact card.",
    placement: "top",
    disableBeacon: true,
  },
];

const NOTIFICATION_STEPS: TourStep[] = [
  {
    target: ".ns-config",
    title: "Where alerts go",
    content: "Price drop alerts are emailed to your Gmail. Use the button to send yourself a test email and confirm it arrives.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".ns-how",
    title: "How alerts work",
    content: "Prices are checked every 24 hours. You get one email when a price first hits your target, from any linked store. Edit the target price to re-arm it.",
    placement: "top",
    disableBeacon: true,
  },
  {
    target: ".ns-log",
    title: "Alert history",
    content: "Every alert that has been sent, with the price at the time and when it went out.",
    placement: "top",
    disableBeacon: true,
  },
];

const PROFILE_STEPS: TourStep[] = [
  {
    target: ".pf-section",
    title: "Your profile",
    content: "Update your display name and see which Google account you signed in with.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".pf-links-grid",
    title: "Quick navigation",
    content: "Jump straight to the tracker, analytics, notifications or privacy policy.",
    placement: "top",
    disableBeacon: true,
  },
  {
    target: ".pf-danger-section",
    title: "Danger zone",
    content: "Permanently delete your account and all tracked data. This can't be undone.",
    placement: "top",
    disableBeacon: true,
  },
];

export type TourPage = "tracker" | "analytics" | "notifications" | "profile";

const STEPS_BY_PAGE: Record<TourPage, TourStep[]> = {
  tracker:       TRACKER_STEPS,
  analytics:     ANALYTICS_STEPS,
  notifications: NOTIFICATION_STEPS,
  profile:       PROFILE_STEPS,
};

const SEEN_KEYS: Record<TourPage, string> = {
  tracker:       TOUR_SEEN_KEY,
  analytics:     AN_TOUR_SEEN_KEY,
  notifications: "pricehound_notif_tour_seen",
  profile:       "pricehound_profile_tour_seen",
};

// ── Custom tooltip ────────────────────────────────────────────
function PriceHoundTooltip({ index, step, backProps, closeProps, primaryProps, tooltipProps, isLastStep, size }: any) {
  return (
    <div
      {...tooltipProps}
      style={{
        background: "var(--bg2,#141414)",
        border: "1px solid color-mix(in srgb,var(--accent,#e8ff47) 28%,transparent)",
        padding: "24px 24px 20px",
        width: 320, maxWidth: "90vw",
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        position: "relative", overflow: "hidden",
        borderRadius: 2,
      }}
    >
      {/* Accent bar */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(90deg,var(--accent,#e8ff47),transparent)", pointerEvents:"none" }} />

      {/* Counter */}
      <p style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"var(--accent,#e8ff47)", letterSpacing:"0.12em", marginBottom:10, opacity:0.8 }}>
        STEP {index + 1} / {size}
      </p>

      {/* Title */}
      {step.title && (
        <p style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:16, letterSpacing:"-0.3px", color:"var(--text,#f0ede8)", marginBottom:8 }}>
          {step.title}
        </p>
      )}

      {/* Body */}
      <p style={{ fontSize:13, color:"var(--muted2,#9a9a9a)", lineHeight:1.65, fontWeight:300, marginBottom:20 }}>
        {step.content}
      </p>

      {/* Progress dots */}
      <div style={{ display:"flex", gap:5, marginBottom:18 }}>
        {Array.from({ length: size }).map((_, i) => (
          <div key={i} style={{ width: i===index ? 16 : 5, height:5, background: i===index ? "var(--accent,#e8ff47)" : "rgba(255,255,255,0.12)", transition:"width 0.25s,background 0.25s" }} />
        ))}
      </div>

      {/* Buttons */}
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        {index > 0 && (
          <button {...backProps} style={{ background:"transparent", border:"1px solid var(--border2,rgba(255,255,255,0.16))", color:"var(--muted2,#9a9a9a)", fontFamily:"'DM Mono',monospace", fontSize:11, padding:"8px 14px", cursor:"pointer", letterSpacing:"0.06em" }}>
            ← BACK
          </button>
        )}
        <button {...closeProps} style={{ background:"transparent", border:"none", color:"var(--muted,#6b6b6b)", fontFamily:"'DM Mono',monospace", fontSize:11, padding:"8px 10px", cursor:"pointer", letterSpacing:"0.06em", marginLeft: index===0 ? "auto" : undefined }}>
          SKIP
        </button>
        <button {...primaryProps} style={{ background:"var(--accent,#e8ff47)", border:"none", color:"var(--accent-fg,#0a0a0a)", fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500, padding:"8px 18px", cursor:"pointer", letterSpacing:"0.06em", marginLeft:"auto" }}>
          {isLastStep ? <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>DONE <Check size={12} /></span> : "NEXT →"}
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────
function isVisible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const cs = window.getComputedStyle(el);
  return cs.display !== "none" && cs.visibility !== "hidden";
}

// Keep only steps whose target exists AND is visible, and point each step at
// that actual element (so hidden duplicates, e.g. a sidebar button on mobile,
// can never be picked by mistake).
function resolveSteps(rawSteps: TourStep[]): Step[] {
  const out: Step[] = [];
  for (const step of rawSteps) {
    let el: Element | undefined;
    try {
      el = Array.from(document.querySelectorAll(step.target)).find(isVisible);
    } catch {
      el = undefined;
    }
    if (el) out.push({ ...step, target: el as HTMLElement });
  }
  return out;
}

// ── Main component ────────────────────────────────────────────
interface OnboardingTourProps {
  forceStart?: boolean;
  onFinish?:   () => void;
  page?:       TourPage;
}

export default function OnboardingTour({ forceStart = false, onFinish, page = "tracker" }: OnboardingTourProps) {
  const [run,       setRun]       = useState(false);
  const [steps,     setSteps]     = useState<Step[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [ready,     setReady]     = useState(false);

  const seenKey = SEEN_KEYS[page];

  useEffect(() => {
    setReady(true);

    const rawSteps = STEPS_BY_PAGE[page];

    if (forceStart) {
      // Small delay lets the DOM settle before we query for optional targets
      const t = setTimeout(() => {
        setSteps(resolveSteps(rawSteps));
        setStepIndex(0);
        setRun(true);
      }, 300);
      return () => clearTimeout(t);
    }

    const seen = localStorage.getItem(seenKey);
    if (!seen) {
      const t = setTimeout(() => {
        setSteps(resolveSteps(rawSteps));
        setStepIndex(0);
        setRun(true);
      }, 900);
      return () => clearTimeout(t);
    }
  }, [forceStart, page, seenKey]);

  const handleCallback = useCallback((data: CallBackProps) => {
    const { status, action, index, type } = data;

    if (type === "step:after") {
      if (action === "next") setStepIndex((i) => i + 1);
      else if (action === "prev") setStepIndex((i) => Math.max(0, i - 1));
    }

    // Target vanished after the tour started — move on instead of hanging
    if (type === "error:target_not_found") {
      setStepIndex((i) => (action === "prev" ? Math.max(0, i - 1) : i + 1));
    }

    if (action === "close" || status === "finished" || status === "skipped") {
      setRun(false);
      setStepIndex(0);
      localStorage.setItem(seenKey, "true");
      onFinish?.();
    }
  }, [seenKey, onFinish]);

  if (!ready || steps.length === 0) return null;

  const joyrideStyles: Partial<Styles> = {
    overlay: { backgroundColor: "rgba(0,0,0,0.68)" },
    spotlight: {},
  };

  return (
    <>
      <style>{`
        .react-joyride__spotlight {
          border-radius: 2px !important;
          outline: 2px solid rgba(232,255,71,0.45) !important;
          outline-offset: 4px !important;
        }
        .react-joyride__overlay { mix-blend-mode: normal !important; }
      `}</style>
      <Joyride
        steps={steps}
        run={run}
        stepIndex={stepIndex}
        continuous
        scrollToFirstStep
        showSkipButton={false}
        disableOverlayClose
        spotlightClicks={false}
        tooltipComponent={PriceHoundTooltip}
        callback={handleCallback}
        styles={joyrideStyles}
      />
    </>
  );
}

// ── Guide trigger button — rendered inside the navbar ─────────
// theme-aware: uses CSS vars so it works in both dark and light mode
export function TourTriggerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Take a guided tour"
      style={{
        background: "transparent",
        border: "1px solid var(--border2)",
        color: "var(--muted2)",
        fontFamily: "'DM Mono', monospace",
        fontSize: 10, padding: "5px 12px",
        cursor: "pointer", letterSpacing: "0.06em",
        display: "flex", alignItems: "center", gap: 5,
        transition: "color 0.2s, border-color 0.2s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--muted2)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border2)"; }}
    >
      <span style={{ fontSize: 12 }}>?</span> GUIDE
    </button>
  );
}

export function useTour() {
  const resetTour    = useCallback(() => { Object.values(SEEN_KEYS).forEach((k) => localStorage.removeItem(k)); }, []);
  const hasSeenTour  = useCallback(() => !!localStorage.getItem(TOUR_SEEN_KEY), []);
  const restartTour  = useCallback(() => { resetTour(); window.location.reload(); }, [resetTour]);
  return { restartTour, hasSeenTour, resetTour };
}