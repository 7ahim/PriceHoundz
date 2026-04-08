"use client";

import { useState, useEffect, useCallback } from "react";
import { Joyride, type CallBackProps, type Step, STATUS, ACTIONS, EVENTS } from "react-joyride";

// ─────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────
const TOUR_SEEN_KEY = "pricehound_tour_seen";

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
      "These cards give you a live count of everything — how many products you're tracking, alerts sent, price data points collected, and paused trackers.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-product-list",
    title: "Your tracked products",
    content:
      "Every product you add shows up here. A green dot means it's actively being watched. Yellow means the target price has been hit. Grey means it's paused.",
    placement: "right",
    disableBeacon: true,
  },
  {
    target: ".db-price-cards",
    title: "Price at a glance",
    content:
      "See the current scraped price, your target, the all-time low, and the all-time high — all in one row. The closer the current price gets to your target, the more it glows.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-chart-section",
    title: "Price history graph",
    content:
      "This chart shows how the price has moved over time. The dashed orange line is your target — you'll get an email alert the moment the price crosses it.",
    placement: "top",
    disableBeacon: true,
  },
  {
    target: ".db-detail-actions",
    title: "Manage your tracker",
    content:
      "Edit your target price, pause tracking temporarily, or delete a product entirely. You can re-enable paused trackers any time.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    target: ".db-user",
    title: "Your account",
    content:
      "Your signed-in Gmail account. All price drop alerts go to this address. Click the arrow to sign out.",
    placement: "top",
    disableBeacon: true,
  },
];

// ─────────────────────────────────────────────────────────────
//  Tooltip render
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
        maxWidth: 320,
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(232,255,71,0.08)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* accent top bar */}
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: 2,
          background: "linear-gradient(90deg, #e8ff47, transparent)",
        }}
      />

      {/* step counter */}
      <div
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: "#e8ff47",
          letterSpacing: "0.12em",
          marginBottom: 10,
          opacity: 0.8,
        }}
      >
        STEP {index + 1} / {size}
      </div>

      {/* title */}
      {step.title && (
        <div
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: "-0.3px",
            color: "#f0ede8",
            marginBottom: 8,
          }}
        >
          {step.title}
        </div>
      )}

      {/* content */}
      <div
        style={{
          fontSize: 13,
          color: "#9a9a9a",
          lineHeight: 1.65,
          fontWeight: 300,
          marginBottom: 20,
        }}
      >
        {step.content}
      </div>

      {/* progress dots */}
      <div
        style={{
          display: "flex",
          gap: 5,
          marginBottom: 18,
        }}
      >
        {Array.from({ length: size }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === index ? 16 : 5,
              height: 5,
              background: i === index ? "#e8ff47" : "rgba(255,255,255,0.12)",
              transition: "width 0.25s ease, background 0.25s ease",
            }}
          />
        ))}
      </div>

      {/* actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {index > 0 && (
          <button
            {...backProps}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "#9a9a9a",
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              padding: "8px 14px",
              cursor: "pointer",
              letterSpacing: "0.06em",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#f0ede8";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.28)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#9a9a9a";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)";
            }}
          >
            ← BACK
          </button>
        )}

        <button
          {...closeProps}
          style={{
            background: "transparent",
            border: "none",
            color: "#6b6b6b",
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            padding: "8px 10px",
            cursor: "pointer",
            letterSpacing: "0.06em",
            marginLeft: index === 0 ? "auto" : undefined,
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6b6b6b"; }}
        >
          SKIP
        </button>

        <button
          {...primaryProps}
          style={{
            background: "#e8ff47",
            border: "none",
            color: "#0a0a0a",
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            fontWeight: 500,
            padding: "8px 18px",
            cursor: "pointer",
            letterSpacing: "0.06em",
            marginLeft: "auto",
            transition: "background 0.2s, transform 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#d4eb30";
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#e8ff47";
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
          }}
        >
          {isLastStep ? "DONE ✓" : "NEXT →"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Tour trigger button (shown inside the dashboard)
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
        fontSize: 11,
        padding: "6px 14px",
        cursor: "pointer",
        letterSpacing: "0.06em",
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "#e8ff47";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(232,255,71,0.3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "#9a9a9a";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)";
      }}
    >
      <span style={{ fontSize: 13 }}>?</span> GUIDE
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────
interface OnboardingTourProps {
  /** Pass true to force-start the tour regardless of localStorage */
  forceStart?: boolean;
  /** Called when the tour ends or is skipped */
  onFinish?: () => void;
}

export default function OnboardingTour({ forceStart = false, onFinish }: OnboardingTourProps) {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [ready, setReady] = useState(false);

  // Hydration-safe: only touch localStorage on the client
  useEffect(() => {
    setReady(true);
    if (forceStart) {
      setStepIndex(0);
      setRun(true);
      return;
    }
    const seen = localStorage.getItem(TOUR_SEEN_KEY);
    if (!seen) {
      // Small delay so the dashboard has painted before the tour starts
      const t = setTimeout(() => { setStepIndex(0); setRun(true); }, 800);
      return () => clearTimeout(t);
    }
  }, [forceStart]);

  const handleCallback = useCallback(
    (data: CallBackProps) => {
      const { status, action, index, type } = data;

      // Step navigation
      if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
        setStepIndex((prev) => (action === ACTIONS.PREV ? prev - 1 : prev + 1));
      }

      // Tour ended (finished or skipped)
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setRun(false);
        localStorage.setItem(TOUR_SEEN_KEY, "true");
        onFinish?.();
      }
    },
    [onFinish]
  );

  if (!ready) return null;

  return (
    <Joyride
      steps={STEPS}
      run={run}
      stepIndex={stepIndex}
      continuous
      scrollToFirstStep
      showSkipButton
      disableOverlayClose
      spotlightClicks={false}
      tooltipComponent={PriceHoundTooltip}
      callback={handleCallback}
      styles={{
        options: {
          arrowColor: "#141414",
          overlayColor: "rgba(0, 0, 0, 0.72)",
          zIndex: 9999,
        },
        spotlight: {
          borderRadius: 0,
          outline: "2px solid rgba(232,255,71,0.35)",
          outlineOffset: 4,
        },
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
//  Hook — lets any component trigger the tour programmatically
// ─────────────────────────────────────────────────────────────
export function useTour() {
  const restartTour = useCallback(() => {
    localStorage.removeItem(TOUR_SEEN_KEY);
    // Reload so the component re-mounts cleanly with forceStart
    window.location.reload();
  }, []);

  const hasSeenTour = useCallback((): boolean => {
    return !!localStorage.getItem(TOUR_SEEN_KEY);
  }, []);

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_SEEN_KEY);
  }, []);

  return { restartTour, hasSeenTour, resetTour };
}
