"use client";

import Link from "next/link";

// Part 2 is two rooms now. The pitch used to be its own page; it happens at
// the table, where the partners you are answering are sitting.

const STEPS = [
  { href: "/committee", n: "01", name: "The room" },
  { href: "/report", n: "02", name: "The verdict" },
] as const;

export type PartTwoStep = (typeof STEPS)[number]["href"];

export function PartTwoNav({ current }: { current: PartTwoStep }) {
  return (
    <nav className="panel flex items-center gap-0.5 whitespace-nowrap px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]">
      <Link href="/study" className="px-2 py-1 text-faint transition hover:text-ink">
        ← Part one
      </Link>
      <span className="mx-1 h-3 w-px bg-edge" />
      {STEPS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={current === s.href ? "page" : undefined}
          className={`whitespace-nowrap px-2 py-1 transition ${
            current === s.href ? "text-accent" : "text-muted hover:text-ink"
          }`}
        >
          <span className="text-faint">{s.n}</span> {s.name}
        </Link>
      ))}
      <span className="mx-1 h-3 w-px bg-edge" />
      <Link href="/dashboard" className="px-2 py-1 text-faint transition hover:text-ink">
        Runs
      </Link>
    </nav>
  );
}
