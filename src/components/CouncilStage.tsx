"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AgentFace, moodOf } from "@/components/AgentFace";
import { DeliberationGraph } from "@/components/DeliberationGraph";
import type { AgentVerdict } from "@/lib/types";

// ============================================================================
// THE COUNCIL, AS THE MAIN THING ON SCREEN.
//
// While five agents argue about a city, the argument is what the founder came
// for, not the globe. This lays the meeting out the way you would follow a
// real one: what the chair asked each of them, who is talking to whom right
// now in words big enough to read from across a room, and every challenge
// with the answer it got.
// ============================================================================

export type StageMessage = {
  id: string;
  round: number;
  from: string;
  to: string;
  kind: "finding" | "challenge" | "rebuttal" | "concession";
  text: string;
  inReplyTo?: string;
};

export type StageTask = { id: string; question: string; assignedTo: string };
type Seat = { id: string; role: string; weight: number };

const VERB: Record<StageMessage["kind"], string> = {
  finding: "reports to the room",
  challenge: "challenges",
  rebuttal: "answers",
  concession: "concedes to",
};

const KIND_COLOR: Record<StageMessage["kind"], string> = {
  finding: "var(--border-bright)",
  challenge: "var(--accent)",
  rebuttal: "var(--caution)",
  concession: "var(--positive)",
};

export function CouncilStage({
  city,
  roundTitle,
  inSession,
  seats,
  stances,
  tasks,
  messages,
  conceded,
  voiced,
}: {
  city: string;
  roundTitle?: string;
  inSession: boolean;
  seats: Seat[];
  stances: Record<string, AgentVerdict>;
  tasks: StageTask[];
  messages: StageMessage[];
  conceded: Set<string>;
  /** The line being read aloud, when the council is heard. */
  voiced?: string | null;
}) {
  const roleOf = (id: string) =>
    id === "room" ? "the room" : (seats.find((s) => s.id === id)?.role ?? id.charAt(0).toUpperCase() + id.slice(1));

  // What is being said now: the line being spoken, else the newest one.
  const now = (voiced && messages.find((m) => m.id === voiced)) || messages[messages.length - 1];

  const challenges = messages.filter((m) => m.kind === "challenge");
  const replyTo = (c: StageMessage) =>
    messages.find((m) => m.inReplyTo === c.id) ??
    (c.to === "room"
      ? undefined
      : messages.find(
          (m) =>
            m.from === c.to &&
            m.to === c.from &&
            m.round > c.round &&
            (m.kind === "rebuttal" || m.kind === "concession")
        ));
  const findings = messages.filter((m) => m.kind === "finding");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="label">The {city} council</p>
        <span
          className={`num text-[10px] ${inSession ? "animate-pulse" : ""}`}
          style={{ color: inSession ? "var(--accent)" : "var(--muted)" }}
        >
          {inSession ? roundTitle ?? "the chair is handing out questions" : "the council has spoken"}
        </span>
      </div>

      <div className="mt-2">
        <DeliberationGraph
          seats={seats}
          stances={stances}
          messages={messages}
          conceded={conceded}
          voiced={voiced}
          height={190}
        />
      </div>

      {/* ---- now speaking ---- */}
      <AnimatePresence mode="wait">
        {now && (
          <motion.div
            key={now.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-3 border-l-2 bg-surface/60 p-3"
            style={{ borderColor: KIND_COLOR[now.kind] }}
          >
            <div className="flex items-center gap-2.5">
              <AgentFace
                mood={moodOf(stances[now.from]?.stance)}
                speaking={inSession}
                conceded={now.kind === "concession"}
                size={34}
              />
              <p className="text-[12px] text-muted">
                <span className="text-ink">{roleOf(now.from)}</span> {VERB[now.kind]}{" "}
                {now.kind === "finding" ? "" : <span className="text-ink">{roleOf(now.to)}</span>}
              </p>
            </div>
            <p className="mt-2 text-[17px] leading-snug text-ink">{now.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- what the chair asked ---- */}
      {tasks.length > 0 && (
        <Block title="What the chair asked each of them" open={findings.length === 0}>
          <ul className="space-y-1.5">
            {tasks.map((t) => (
              <li key={t.id} className="text-[12px] leading-relaxed">
                <span className="text-ink">{roleOf(t.assignedTo)}</span>
                <span className="text-muted">, {t.question}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* ---- challenge → answer ---- */}
      {challenges.length > 0 && (
        <Block title="Challenges and the answers they got" open>
          <ul className="space-y-3">
            {challenges.map((c) => {
              const r = replyTo(c);
              return (
                <li key={c.id} className="text-[12px] leading-relaxed">
                  <p className="text-muted">
                    <span className="text-ink">{roleOf(c.from)}</span> →{" "}
                    <span className="text-ink">{roleOf(c.to)}</span>
                  </p>
                  <p className="border-l-2 pl-2 text-ink/90" style={{ borderColor: KIND_COLOR.challenge }}>
                    {c.text}
                  </p>
                  {r ? (
                    <p
                      className="ml-4 mt-1 border-l-2 pl-2 text-ink/80"
                      style={{ borderColor: KIND_COLOR[r.kind] }}
                    >
                      <span className="text-muted">
                        {roleOf(r.from)} {r.kind === "concession" ? "conceded" : "held"}:{" "}
                      </span>
                      {r.text}
                    </p>
                  ) : (
                    <p className="ml-4 mt-1 text-[11px] text-faint">
                      {c.to === "room" ? "Put to the whole room." : inSession ? "Waiting for an answer…" : "Never answered."}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      {/* ---- round one, each on their own ---- */}
      {findings.length > 0 && (
        <Block title="What each found on their own" open={challenges.length === 0}>
          <ul className="space-y-2">
            {findings.map((f) => (
              <li key={f.id} className="text-[12px] leading-relaxed">
                <span className="text-ink">{roleOf(f.from)}</span>
                <span className="text-ink/80">, {f.text}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}

function Block({ title, open, children }: { title: string; open: boolean; children: React.ReactNode }) {
  return (
    <details className="mt-4 border-t border-edge pt-3" open={open}>
      <summary className="label cursor-pointer select-none hover:text-ink">{title}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
