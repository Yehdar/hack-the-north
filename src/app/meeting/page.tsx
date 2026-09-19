"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Objection, SeatId } from "@/lib/types";
import { useVenture } from "@/lib/store";
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
  open: "border-amber-600/60 bg-amber-950/25 text-amber-300",
  dodged: "border-red-700/60 bg-red-950/25 text-red-300",
  answered: "border-emerald-700/60 bg-emerald-950/25 text-emerald-300",
};

export default function Meeting() {
  const [tier, setTier] = useState<VoiceTier | null>(null);
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  // Shared with the globe page, so the committee is grilling the founder about
  // the idea they actually entered rather than the built-in mock.
  const vf = useVenture((v) => v.ventureFile);
  const setVf = useVenture((v) => v.replace);
  const [recording, setRecording] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState<SeatId | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const feed = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      setTier(await detectTier());
      const res = await fetch("/api/voice/status");
      const json = (await res.json()) as { seats?: SeatInfo[] };
      setSeats(json.seats ?? []);
    })();
  }, []);

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
          body: JSON.stringify({ segment, ventureFile: vf ?? undefined }),
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
    [vf, tier]
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

  return (
    <main className="min-h-screen bg-ground text-ink">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-edge pb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Investment Committee — live
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              {vf ? `\u201C${vf.solution}\u201D` : "Pitch out loud. They will interrupt."}
              <span className="ml-2 rounded-[2px] bg-surface-2 px-2 py-0.5 font-mono text-xs">
                voice: {tier ?? "…"}
              </span>
            </p>
          </div>
          <a href="/" className="text-sm text-muted underline-offset-4 hover:underline">
            ← deliberation
          </a>
        </header>

        {!vf && (
          <p className="mt-4 border border-amber-700/50 bg-amber-950/20 p-3 font-mono text-xs text-amber-300">
            No idea entered yet. <a href="/" className="underline">Start on the globe</a> so the
            committee has a venture file to read before you pitch.
          </p>
        )}

        {tier === "browser" && (
          <p className="mt-4 rounded-[2px] border border-edge bg-surface/40 p-3 text-xs text-muted">
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
                    className={`rounded-[2px] border p-3 transition ${
                      active
                        ? "border-emerald-500 bg-emerald-950/30"
                        : "border-edge bg-surface/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          active ? "animate-pulse bg-emerald-400" : "bg-edge"
                        }`}
                      />
                      <span className="text-sm font-medium text-ink">
                        {SEAT_LABEL[id]}
                      </span>
                    </div>
                    {info?.valid === false && (
                      <p className="mt-1 text-[10px] text-red-400">voice id not on account</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* transcript */}
            <div
              ref={feed}
              className="mt-4 h-[420px] space-y-3 overflow-y-auto rounded-[2px] border border-edge bg-surface/20 p-4"
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
                    className={`inline-block max-w-[85%] rounded-[2px] px-3 py-2 text-sm leading-relaxed ${
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
                className={`rounded-[2px] px-5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted ${
                  recording
                    ? "bg-red-600 text-white hover:bg-red-500"
                    : "bg-emerald-600 text-white hover:brightness-110"
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
                  className="min-w-0 flex-1 rounded-[2px] border border-edge bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-edge-bright focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={thinking || !typed.trim() || !vf}
                  className="rounded-[2px] border border-edge-bright px-4 py-2.5 text-sm text-ink/85 transition hover:bg-surface-2 disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </div>

            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
          </section>

          {/* objection tracker */}
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
                On the table
              </h2>
              {unanswered > 0 && (
                <span className="font-mono text-xs text-amber-400">{unanswered} unanswered</span>
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
                <div key={o.id} className={`rounded-[2px] border p-2.5 ${STATUS_STYLE[o.status]}`}>
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
