"use client";

import { useState, useEffect, useCallback } from "react";
// react-joyride v3 export names differ from v2 — import the default + specific named exports
import Joyride from "react-joyride";
// Use the module's own types via inline import path to avoid version mismatch
import type { Step, CallBackProps, Styles } from "react-joyride";

const TOUR_SEEN_KEY = "pricehound_tour_seen";

// ─────────────────────────────────────────────────────────────
//  Steps — disableBeacon is a valid Step field in both v2 & v3.
//  If your version still complains, cast the array as any[] below.
// ─────────────────────────────────────────────────────────────
const STEPS: Step[] = [
  {
    target: ".db-add-btn",
    title: "Add your first product",
    content:
      "Paste any Amazon, Flipkart, or Myntra product URL here along with the price you want to be notified at.",
    placement: "right",
    disableBeacon: true,
  },
  {
    target: ".db-stats",
    title: "Your snapshot",
    content:
      "These cards give you a live count — products tracked, alerts sent, data points collected, and paused trackers.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-product-list",
    title: "Your tracked products",
    content:
      "Every product you add shows up here. Green = actively watched. Yellow = target hit. Grey = paused.",
    placement: "right",
    disableBeacon: true,
  },
  {
    target: ".db-price-cards",
    title: "Price at a glance",
    content:
      "Current price, your target, all-time low, and all-time high — all in one row.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-chart-section",
    title: "Price history graph",
    content:
      "The chart shows how the price has moved over time. The dashed line is your target — you get an email the moment it's crossed.",
    placement: "top",
    disableBeacon: true,
  },
  {
    target: ".db-detail-actions",
    title: "Manage your tracker",
    content:
      "Edit your target price, pause tracking temporarily, or delete a product entirely.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-user",
    title: "Your account",
    content:
      "Your signed-in Gmail. All price drop alerts land here. Click the arrow icon to sign out.",
    placement: "top",
    disableBeacon: true,
  },
] as Step[];   // explicit cast silences any leftover property complaints

// ─────────────────────────────────────────────────────────────
//  Custom tooltip component
//  — all layout is via inline styles, no Joyride style injection
// ─────────────────────────────────────────────────────────────
function PriceHoundTooltip({
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  tooltipProps,
  isLastStep,
  size,
}: any) {
  return (
    <div
      {...tooltipProps}
      style={{
        background: "#141414",
        border: "1px solid rgba(232,255,71,0.25)",
        padding: "24px 24px 20px",
        width: 320,
        maxWidth: "90vw",
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, height: 2,
          background: "linear-gradient(90deg, #e8ff47, transparent)",
          pointerEvents: "none",
        }}
      />

      {/* step counter */}
      <p style={{
        fontFamily: "'DM Mono', monospace", fontSize: 10,
        color: "#e8ff47", letterSpacing: "0.12em",
        marginBottom: 10, opacity: 0.8,
      }}>
        STEP {index + 1} / {size}
      </p>

      {/* title */}
      {step.title && (
        <p style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 700,
          fontSize: 16, letterSpacing: "-0.3px",
          color: "#f0ede8", marginBottom: 8,
        }}>
          {step.title}
        </p>
      )}

      {/* body */}
      <p style={{
        fontSize: 13, color: "#9a9a9a",
        lineHeight: 1.65, fontWeight: 300, marginBottom: 20,
      }}>
        {typeof step.content === "string" ? step.content : step.content}
      </p>

      {/* progress dots */}
      <div style={{ display: "flex", gap: 5, marginBottom: 18 }}>
        {Array.from({ length: size }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === index ? 16 : 5, height: 5,
              background: i === index ? "#e8ff47" : "rgba(255,255,255,0.12)",
              transition: "width 0.25s ease, background 0.25s ease",
            }}
          />
        ))}
      </div>

      {/* buttons */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {index > 0 && (
          <button
            {...backProps}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "#9a9a9a",
              fontFamily: "'DM Mono', monospace",
              fontSize: 11, padding: "8px 14px",
              cursor: "pointer", letterSpacing: "0.06em",
            }}
          >
            ← BACK
          </button>
        )}

        <button
          {...closeProps}
          style={{
            background: "transparent", border: "none",
            color: "#6b6b6b",
            fontFamily: "'DM Mono', monospace",
            fontSize: 11, padding: "8px 10px",
            cursor: "pointer", letterSpacing: "0.06em",
            marginLeft: index === 0 ? "auto" : undefined,
          }}
        >
          SKIP
        </button>

        <button
          {...primaryProps}
          style={{
            background: "#e8ff47", border: "none", color: "#0a0a0a",
            fontFamily: "'DM Mono', monospace",
            fontSize: 11, fontWeight: 500,
            padding: "8px 18px",
            cursor: "pointer", letterSpacing: "0.06em",
            marginLeft: "auto",
          }}
        >
          {isLastStep ? "DONE ✓" : "NEXT →"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Guide trigger button — place this wherever you like
// ─────────────────────────────────────────────────────────────
export function TourTriggerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Take a guided tour"
      style={{
        background: "transparent",
        border: "1px solid rgba(255,255,255,0.14)",
        color: "#9a9a9a",
        fontFamily: "'DM Mono', monospace",
        fontSize: 11, padding: "6px 14px",
        cursor: "pointer", letterSpacing: "0.06em",
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      <span style={{ fontSize: 13 }}>?</span> GUIDE
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
//  Main tour component
// ─────────────────────────────────────────────────────────────
interface OnboardingTourProps {
  forceStart?: boolean;
  onFinish?: () => void;
}

export default function OnboardingTour({
  forceStart = false,
  onFinish,
}: OnboardingTourProps) {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);

    if (forceStart) {
      setStepIndex(0);
      setRun(true);
      return;
    }

    const seen = localStorage.getItem(TOUR_SEEN_KEY);
    if (!seen) {
      const t = setTimeout(() => {
        setStepIndex(0);
        setRun(true);
      }, 800);
      return () => clearTimeout(t);
    }
  }, [forceStart]);

  // ── KEY FIX: controlled step navigation ──────────────────
  // When using a custom tooltipComponent you MUST manage stepIndex yourself.
  // Joyride fires STEP_AFTER with action NEXT/PREV — we increment/decrement
  // and keep run=true so the library doesn't reset the tour.
  const handleCallback = useCallback(
    (data: CallBackProps) => {
      const { status, action, index, type } = data;

      if (type === "step:after") {
        if (action === "next") {
          setStepIndex(index + 1);
        } else if (action === "prev") {
          setStepIndex(index - 1);
        }
      }

      // "close" action fires when the user clicks SKIP inside the tooltip
      if (action === "close" || status === "finished" || status === "skipped") {
        setRun(false);
        setStepIndex(0);
        localStorage.setItem(TOUR_SEEN_KEY, "true");
        onFinish?.();
      }
    },
    [onFinish]
  );

  if (!ready) return null;

  // Build the styles object without the `options` key (v3 removed it)
  // and without `spotlight.borderRadius` (triggers the DOM prop warning)
  const joyrideStyles = {
    overlay: {
      backgroundColor: "rgba(0,0,0,0.72)",
    },
    spotlight: {
      // No borderRadius here — overridden via the <style> tag below
    },
  } satisfies Partial<Styles>;

  return (
    <>
      <style>{`
        .react-joyride__spotlight {
          border-radius: 0 !important;
          outline: 2px solid rgba(232,255,71,0.4) !important;
          outline-offset: 4px !important;
        }
        .react-joyride__overlay {
          mix-blend-mode: normal !important;
        }
      `}</style>

      <Joyride
        steps={STEPS}
        run={run}
        stepIndex={stepIndex}
        continuous={true}
        scrollToFirstStep={true}
        disableOverlay
        showSkipButton={false}   /* we render our own SKIP inside the tooltip */
        disableOverlayClose={true}
        spotlightClicks={false}
        tooltipComponent={PriceHoundTooltip}
        callback={handleCallback}
        styles={joyrideStyles}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Helper hook — call restartTour() from anywhere in the app
// ─────────────────────────────────────────────────────────────
export function useTour() {
  const restartTour = useCallback(() => {
    localStorage.removeItem(TOUR_SEEN_KEY);
    window.location.reload();
  }, []);

  const hasSeenTour = useCallback(
    () => !!localStorage.getItem(TOUR_SEEN_KEY),
    []
  );

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_SEEN_KEY);
  }, []);

  return { restartTour, hasSeenTour, resetTour };
}