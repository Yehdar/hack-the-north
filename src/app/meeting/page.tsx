"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Objection, SeatId } from "@/lib/types";
import { useVenture } from "@/lib/store";
import type { SeatPreRead } from "@/lib/agents/vc/preread";
import { PartTwoNav } from "@/components/PartTwoNav";
import { Wordmark } from "@/components/Logo";
import { FIRMS } from "@/data/firms";
import {
  detectTier,
  speak,
  startCapture,
  unlockAudio,
  type Recorder,
  type VoiceTier,
} from "@/lib/voice/client";

type SeatInfo = { seatId: SeatId; role: string; voiceId?: string; valid?: boolean };

const SEAT_ORDER: SeatId[] = ["gp", "principal", "skeptic"];
const SEAT_LABEL: Record<SeatId, string> = {
  gp: "General Partner",
  principal: "Principal",
  skeptic: "Anti-Portfolio Skeptic",
};

const STATUS_STYLE: Record<Objection["status"], string> = {
  open: "border-edge-bright bg-surface text-muted",
  dodged: "border-negative/60 bg-negative/10 text-negative",
  answered: "border-positive/50 bg-positive/10 text-positive",
};

export default function Meeting() {
  const [tier, setTier] = useState<VoiceTier | null>(null);
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  // Shared with the globe page, so the committee is grilling the founder about
  // the idea they actually entered rather than the built-in mock.
  const vf = useVenture((v) => v.ventureFile);
  const setVf = useVenture((v) => v.replace);
  const firmId = useVenture((v) => v.firmId);
  const [recording, setRecording] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState<SeatId | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const feed = useRef<HTMLDivElement>(null);

  // Each seat privately drafts its lean, the two questions it needs answered,
  // and what would sink the deal — before the founder says a word. Built and
  // tested from the start, but nothing ever called it, so the partners opened
  // cold despite having supposedly read the file.
  const [preReads, setPreReads] = useState<SeatPreRead[]>([]);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    void (async () => {
      setTier(await detectTier());
      const res = await fetch("/api/voice/status");
      const json = (await res.json()) as { seats?: SeatInfo[] };
      setSeats(json.seats ?? []);
    })();
  }, []);

  // Runs while the founder is still reading the room, so the meeting opens on
  // real questions rather than a spinner.
  useEffect(() => {
    if (!vf) return;
    let cancelled = false;
    setPreparing(true);

    void fetch("/api/vc/preread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ventureFile: vf, firmId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setPreReads(j.preReads ?? []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setPreparing(false));

    return () => {
      cancelled = true;
    };
    // Deliberately keyed on the firm and the venture file's identity, not its
    // contents — the transcript mutates it on every turn and re-preparing
    // mid-meeting would discard what the partners already decided.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId, vf?.id, vf?.chosenProblem?.id]);

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [vf?.pitchTranscript.length]);

  const sendTurn = useCallback(
    async (segment: string) => {
      if (!segment.trim()) return;
      setThinking(true);
      setError(null);

      try {
        const res = await fetch("/api/vc/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segment, ventureFile: vf ?? undefined, firmId, preReads }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "turn failed");

        setVf(json.ventureFile);
        setThinking(false);

        if (json.spoke) {
          setSpeaking(json.seatId);
          await speak(json.line, json.seatId, tier ?? "text");
          setSpeaking(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "turn failed");
        setThinking(false);
      }
    },
    [vf, tier, firmId, setVf, preReads]
  );

  const pressToTalk = useCallback(async () => {
    unlockAudio(); // must happen inside the gesture or playback silently fails
    if (!tier || tier === "text") return;

    if (recording) {
      setRecording(false);
      const text = await recorder.current?.stop().catch(() => "");
      recorder.current = null;
      if (text) await sendTurn(text);
      return;
    }

    try {
      recorder.current = await startCapture(tier);
      setRecording(true);
    } catch {
      setError("Microphone unavailable — type instead.");
    }
  }, [tier, recording, sendTurn]);

  const objections = vf?.objections ?? [];
  const unanswered = objections.filter((o) => o.status !== "answered").length;
  const firm = FIRMS[firmId] ?? FIRMS.bessemer;

  // A founder facing a silent room does not know what to say first. These
  // fill the box — never send — so the words stay theirs.
  const openObjection = objections.find((o) => o.status === "open");
  const openers = [
    vf?.chosenProblem && {
      label: "Lead with the problem",
      text: `${vf.chosenProblem.statement} That is the problem we solve, for ${vf.chosenProblem.whoHasIt
        .replace(/\.$/, "")
        .replace(/^[A-Z][a-z]/, (m) => m.toLowerCase())}.`,
    },
    openObjection && {
      label: "Answer the open objection",
      text: `On "${openObjection.text.toLowerCase()}": `,
    },
    { label: "Name who pays", text: "The person who signs for this is " },
  ].filter((o): o is { label: string; text: string } => Boolean(o));

  return (
    <main className="min-h-screen bg-ground text-ink">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-edge pb-5">
          <div className="min-w-0">
            <Wordmark size={18} />
            <p className="label mt-3" style={{ color: "var(--accent)" }}>
              Part two · the pitch · {firm.name}
            </p>
            <p className="mt-1 max-w-xl text-sm text-muted">
              {vf ? `\u201C${vf.solution}\u201D` : "Pitch out loud. They will interrupt."}
              <span className="num ml-2 bg-surface-2 px-2 py-0.5 text-[10px]">
                voice: {tier ?? "…"}
              </span>
            </p>
          </div>
          <PartTwoNav current="/meeting" />
        </header>

        {!vf && (
          <p className="mt-4 border border-edge-bright bg-surface p-3 font-mono text-xs text-muted">
            No idea entered yet.{" "}
            <Link href="/" className="text-ink underline">
              Start in Part one
            </Link>{" "}
            so the committee has a venture file to read before you pitch.
          </p>
        )}

        {tier === "browser" && (
          <p className="mt-4 border border-edge bg-surface/40 p-3 text-xs text-muted">
            No ELEVENLABS_API_KEY set — using browser speech. The seats are
            distinguishable by pitch but not by character. Add the key to hear them properly.
          </p>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
          <section className="min-w-0">
            {/* seats */}
            <div className="grid grid-cols-3 gap-3">
              {SEAT_ORDER.map((id) => {
                const info = seats.find((s) => s.seatId === id);
                const active = speaking === id;
                return (
                  <div
                    key={id}
                    className={`border p-3 transition ${
                      active ? "glow-accent" : "border-edge bg-surface/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          active ? "animate-pulse bg-accent" : "bg-edge"
                        }`}
                      />
                      <span className="text-sm font-medium text-ink">
                        {SEAT_LABEL[id]}
                      </span>
                    </div>
                    {/* What this seat decided before you opened your mouth.
                        Showing it is the difference between "they have read
                        your file" being a claim and being visible. */}
                    {(() => {
                      const pre = preReads.find((p) => p.seatId === id);
                      if (preparing && !pre) {
                        return (
                          <p className="mt-2 animate-pulse text-[10px] text-faint">
                            reading your file…
                          </p>
                        );
                      }
                      if (!pre) return null;

                      const lean =
                        pre.initialLean > 0.15
                          ? { t: "leaning yes", c: "var(--positive)" }
                          : pre.initialLean < -0.15
                            ? { t: "leaning no", c: "var(--negative)" }
                            : { t: "undecided", c: "var(--muted)" };

                      return (
                        <>
                          <p className="num mt-2 text-[10px]" style={{ color: lean.c }}>
                            {lean.t} before you spoke
                          </p>
                          {pre.topQuestions.length > 0 && (
                            <ul className="mt-1.5 space-y-1">
                              {pre.topQuestions.slice(0, 2).map((q) => (
                                <li
                                  key={q}
                                  className="text-[10px] leading-relaxed text-muted"
                                >
                                  · {q}
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      );
                    })()}

                    {info?.valid === false && (
                      <p className="mt-1 text-[10px] text-negative">voice id not on account</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* transcript */}
            <div
              ref={feed}
              className="mt-4 h-[420px] space-y-3 overflow-y-auto border border-edge bg-surface/20 p-4"
            >
              {!vf?.pitchTranscript.length && (
                <p className="text-sm text-faint">
                  The room has read your file and is waiting. Open with the problem, not the product.
                </p>
              )}
              {vf?.pitchTranscript.map((t) => (
                <div
                  key={`${t.turn}-${t.at}`}
                  className={t.speaker === "founder" ? "text-right" : ""}
                >
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                    {t.speaker === "founder" ? "you" : SEAT_LABEL[t.speaker as SeatId]}
                  </p>
                  <p
                    className={`inline-block max-w-[85%] px-3 py-2 text-sm leading-relaxed ${
                      t.speaker === "founder"
                        ? "bg-surface-2 text-ink"
                        : "border border-edge-bright bg-surface text-ink"
                    }`}
                  >
                    {t.text}
                  </p>
                </div>
              ))}
              {thinking && <p className="animate-pulse text-xs text-muted">the room is considering…</p>}
            </div>

            {/* controls */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={pressToTalk}
                disabled={thinking || tier === "text" || !tier || !vf}
                className={`px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted ${
                  recording ? "bg-negative text-ink" : "bg-accent text-ground"
                }`}
              >
                {recording ? "■ Stop and send" : "● Hold the floor"}
              </button>

              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  unlockAudio();
                  const t = typed;
                  setTyped("");
                  void sendTurn(t);
                }}
              >
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="…or type your pitch"
                  className="min-w-0 flex-1 border border-edge bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-edge-bright focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={thinking || !typed.trim() || !vf}
                  className="border border-edge-bright px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink/85 transition hover:bg-surface-2 disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </div>

            {vf && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="label">Not sure what to say?</span>
                {openers.map((o) => (
                  <button
                    key={o.label}
                    onClick={() => setTyped(o.text)}
                    className="border border-edge px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition hover:border-edge-bright hover:text-ink"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            {error && <p className="mt-3 text-xs text-negative">{error}</p>}

            {(vf?.pitchTranscript.length ?? 0) > 0 && (
              <div className="mt-6 flex items-center justify-between border-t border-edge pt-4">
                <p className="text-xs text-muted">
                  Every objection still open costs you at the vote.
                </p>
                <Link
                  href="/report"
                  className="bg-accent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110"
                >
                  See the verdict →
                </Link>
              </div>
            )}
          </section>

          {/* objection tracker */}
          <section>
            <div className="flex items-baseline justify-between">
              <p className="label">On the table</p>
              {unanswered > 0 && (
                <span className="num text-xs text-accent">{unanswered} unanswered</span>
              )}
            </div>

            <div className="mt-3 space-y-2">
              {objections.length === 0 && (
                <p className="text-xs text-faint">
                  Nothing yet. Every challenge they raise lands here, and anything you leave
                  unanswered counts against you at the vote.
                </p>
              )}
              {objections.map((o) => (
                <div key={o.id} className={`border p-2.5 ${STATUS_STYLE[o.status]}`}>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider">
                    <span>{o.seatId}</span>
                    <span>{o.status}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink">{o.text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
