"use client";

import { Logo } from "@/components/Logo";

// ============================================================================
// THE DOOR between Part 1 and Part 2.
//
// Part 1 closes the doors, the route changes behind them, and Part 2 opens
// them onto the committee room. The handoff travels in module state rather
// than storage: it survives a client-side navigation, and a hard refresh
// starts clean, so nothing can leave a stale door shut on someone's screen.
//
// CSS transitions rather than a JS animation loop, so the leaves still finish
// moving if the frame loop is throttled — the timers that navigate never wait
// on an animation callback.
// ============================================================================

let armed = false;

/** Call just before navigating to Part 2 through the door. */
export function armDoor() {
  armed = true;
}

/** Pure read — safe inside a state initialiser. */
export function doorArmed() {
  return armed;
}

export function disarmDoor() {
  armed = false;
}

export const DOOR_MS = 700;

export function Door({
  state,
  title,
  subtitle,
}: {
  /** "open" = leaves retracted off-screen. */
  state: "open" | "closed";
  title?: string;
  subtitle?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] overflow-hidden"
      style={{ pointerEvents: state === "closed" ? "auto" : "none" }}
      aria-hidden={state === "open"}
    >
      <div className="door-leaf door-left" data-state={state} />
      <div className="door-leaf door-right" data-state={state} />

      <div
        className="door-plate absolute inset-0 flex flex-col items-center justify-center text-center"
        data-state={state}
      >
        <Logo size={40} className="text-ink" />
        <p className="label mt-5" style={{ color: "var(--accent)" }}>
          Part two
        </p>
        {title && <p className="mt-2 font-mono text-2xl text-ink">{title}</p>}
        {subtitle && <p className="label mt-2">{subtitle}</p>}
      </div>
    </div>
  );
}
