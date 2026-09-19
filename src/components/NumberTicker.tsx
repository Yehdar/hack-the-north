"use client";

import { useEffect, useState } from "react";

// Counts up to a number instead of printing it. Driven off elapsed time, so a
// throttled frame loop still lands on the exact value rather than stalling.

export function NumberTicker({
  value,
  decimals = 0,
  duration = 900,
  delay = 0,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  delay?: number;
  suffix?: string;
}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / duration));
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay]);

  return (
    <span className="num" aria-label={`${value.toFixed(decimals)}${suffix}`}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}
