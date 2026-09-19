"use client";

import { useEffect, useRef, useState } from "react";
import { useVenture } from "@/lib/store";
import { hubById } from "@/data/globePoints";

// Which room you walk into. Changing the firm changes the thesis the seats
// argue from, so it genuinely changes the verdict rather than relabelling it.

type FirmRow = {
  id: string;
  name: string;
  hqHubId: string;
  stages: string[];
  checkSize: [number, number];
  decisionStyle: string;
  thesis: string;
  hasAntiPortfolio: boolean;
};

export function FirmPicker({ disabled }: { disabled?: boolean }) {
  const firmId = useVenture((v) => v.firmId);
  const setFirmId = useVenture((v) => v.setFirmId);
  const [firms, setFirms] = useState<FirmRow[]>([]);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/vc/firms")
      .then((r) => r.json())
      .then((j) => setFirms(j.firms ?? []))
      .catch(() => {});
  }, []);

  // Open on the firm already chosen, and close on a click anywhere else or
  // Escape. Mid-demo nobody should have to find the toggle again.
  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>("[aria-current='true']")
      ?.scrollIntoView({ block: "center" });
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = firms.find((f) => f.id === firmId);

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:text-ink disabled:opacity-40"
      >
        {current?.name ?? "choose firm"} ▾
      </button>

      {open && (
        // Capped and scrollable: 25 firms opening upwards ran off the top of
        // the screen, and every firm above the fold could not be chosen.
        // whitespace-normal because the control bar this sits in is nowrap.
        <div
          ref={list}
          className="panel panel-bright absolute bottom-full left-0 mb-2 max-h-[min(560px,calc(100vh-140px))] w-80 overflow-y-auto whitespace-normal p-2"
        >
          {firms.map((f) => (
            <button
              key={f.id}
              aria-current={f.id === firmId}
              onClick={() => {
                setFirmId(f.id);
                setOpen(false);
              }}
              className={`block w-full p-2 text-left transition hover:bg-surface-2 ${
                f.id === firmId ? "bg-surface-2" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] text-ink">
                  {f.name}
                  <span className="label ml-2">{hubById(f.hqHubId)?.label ?? f.hqHubId}</span>
                </span>
                <span className="num shrink-0 text-[9px] text-faint">
                  ${(f.checkSize[0] / 1e6).toFixed(1)}M–${(f.checkSize[1] / 1e6).toFixed(0)}M
                </span>
              </div>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{f.thesis}</p>
              <p className="label mt-1">
                {f.decisionStyle} · {f.stages.join(", ")}
                {f.hasAntiPortfolio && (
                  <span className="ml-1 text-accent">· cites real misses</span>
                )}
              </p>
            </button>
          ))}
          <p className="label p-2 leading-relaxed">
            Only one firm in venture publishes what it passed on. With the others the
            Skeptic argues thesis mismatch instead of citing history.
          </p>
        </div>
      )}
    </div>
  );
}
