"use client";

import { useState, useEffect, useCallback } from "react";
import Joyride from "react-joyride";
import type { Step, CallBackProps, Styles } from "react-joyride";
import { usePathname } from "next/navigation";

const TOUR_SEEN_KEY      = "pricehound_tour_seen";
const AN_TOUR_SEEN_KEY   = "pricehound_an_tour_seen";

// ── TRACKER steps ────────────────────────────────────────────
// Each step has an `optional` flag — if the target element doesn't
// exist in the DOM (e.g. no products yet), the step is skipped.
const TRACKER_STEPS_ALL: (Step & { optional?: boolean; noProducts?: boolean })[] = [
  {
    // Always shown — the "add product" button is always visible
    target: ".db-add-btn",
    title: "Add your first product",
    content: "Paste any Amazon, Flipkart, Myntra, or Reliance Digital URL along with your target price. We fetch the current price instantly.",
    placement: "right",
    disableBeacon: true,
  },
  {
    target: ".db-stats",
    title: "Your at-a-glance stats",
    content: "Total products tracked, alerts fired, price readings collected, and paused trackers — live counts at the top of every session.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-product-list",
    title: "Your tracked products",
    content: "Every product you add appears here. Green dot = actively watching. Yellow = target price hit. Grey = paused.",
    placement: "right",
    disableBeacon: true,
  },
  {
    // Only show if there's a selected product with price cards visible
    target: ".db-price-cards",
    title: "Price at a glance",
    content: "Current price, your target, all-time low, and all-time high — four cards that tell the whole story.",
    placement: "bottom",
    disableBeacon: true,
    optional: true,
  },
  {
    // Only show if there's a chart rendered
    target: ".db-chart-section",
    title: "Price history chart",
    content: "The line shows price movement over time. The dashed orange line is your target — you get an email the moment the price line crosses below it.",
    placement: "top",
    disableBeacon: true,
    optional: true,
  },
  {
    // Only show if detail actions are visible (product selected)
    target: ".db-detail-actions",
    title: "Manage a tracked product",
    content: "Edit your target price, refresh the price now, pause tracking temporarily, or delete a product entirely.",
    placement: "bottom",
    disableBeacon: true,
    optional: true,
  },
  {
    // Sidebar user section — always present
    target: ".db-user",
    title: "Your account",
    content: "Your signed-in Gmail. All price drop alerts land here. Click your email to visit your profile, or the arrow to sign out.",
    placement: "top",
    disableBeacon: true,
  },
  {
    // Navbar guide button itself — last step points users to analytics
    target: ".ph-nav-tab[href='/dashboard/analytics']",
    title: "Explore Analytics",
    content: "Head to the Analytics tab for savings charts, price trends, scrape activity, and sparklines for every tracked product.",
    placement: "bottom",
    disableBeacon: true,
  },
];

// ── ANALYTICS steps ──────────────────────────────────────────
const ANALYTICS_STEPS: (Step & { optional?: boolean })[] = [
  {
    target: ".an-header",
    title: "Analytics Overview",
    content: "Your price intelligence HQ. Every chart and stat on this page is derived from live scrape data PriceHound has collected for your products.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".an-stats",
    title: "Six headline numbers",
    content: "Products tracked, total data points, alerts sent, potential savings, biggest % price drop, and the most volatile product — all at a glance.",
    placement: "bottom",
    disableBeacon: true,
    optional: true,
  },
  {
    target: ".an-grid-2",
    title: "Price trends & savings",
    content: "Left: normalised price trends for all products on one axis. Right: cumulative savings stacking up every time a target price is hit.",
    placement: "top",
    disableBeacon: true,
    optional: true,
  },
  {
    target: ".an-sparklines",
    title: "Product sparklines",
    content: "Mini charts for every individual product — current price, target, all-time low, and all-time high in one compact card.",
    placement: "top",
    disableBeacon: true,
    optional: true,
  },
];

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
          {isLastStep ? "DONE ✓" : "NEXT →"}
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────
// Filter steps to only those whose target element exists in the DOM.
// `optional` steps are skipped when their target is missing.
// Non-optional steps are always included (Joyride will highlight what it can).
function resolveSteps(rawSteps: (Step & { optional?: boolean; noProducts?: boolean })[]) {
  return rawSteps.filter((step) => {
    if (!step.optional) return true; // always include required steps
    try {
      return !!document.querySelector(step.target as string);
    } catch {
      return false;
    }
  });
}

// ── Main component ────────────────────────────────────────────
interface OnboardingTourProps {
  forceStart?: boolean;
  onFinish?:   () => void;
  page?:       "tracker" | "analytics";
}

export default function OnboardingTour({ forceStart = false, onFinish, page = "tracker" }: OnboardingTourProps) {
  const [run,       setRun]       = useState(false);
  const [steps,     setSteps]     = useState<Step[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [ready,     setReady]     = useState(false);

  const seenKey = page === "analytics" ? AN_TOUR_SEEN_KEY : TOUR_SEEN_KEY;

  useEffect(() => {
    setReady(true);

    const rawSteps = page === "analytics" ? ANALYTICS_STEPS : TRACKER_STEPS_ALL;

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
  const resetTour    = useCallback(() => { localStorage.removeItem(TOUR_SEEN_KEY); localStorage.removeItem(AN_TOUR_SEEN_KEY); }, []);
  const hasSeenTour  = useCallback(() => !!localStorage.getItem(TOUR_SEEN_KEY), []);
  const restartTour  = useCallback(() => { resetTour(); window.location.reload(); }, [resetTour]);
  return { restartTour, hasSeenTour, resetTour };
}