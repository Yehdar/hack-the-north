"use client";

import { useId, useState } from "react";

// A "?" beside a term a first-time founder will not know. One sentence each,
// on hover or focus, so the screen explains itself without a tour.

export function Hint({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  /** Which way the panel extends from the mark. */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label="What does this mean?"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-edge-bright font-sans text-[8px] leading-none text-faint transition hover:border-muted hover:text-ink"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`panel panel-bright absolute top-full z-[90] mt-1.5 w-60 p-2.5 font-sans text-[11px] normal-case leading-relaxed tracking-normal text-ink/90 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
