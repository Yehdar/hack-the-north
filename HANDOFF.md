# Handoff

Everything a fresh session needs to pick this up cold. Read this first, then
`ARCHITECTURE.md` for the agent protocol and `DEMO.md` for the presentation
order.

---

## Get the code

```bash
git clone https://github.com/Yehdar/hack-the-north.git
cd hack-the-north
git checkout jaineel-changes      # ALL the work is on this branch, not master
npm install
npm run dev
```

Open http://localhost:3000.

**`master` is an empty README.** Everything lives on `jaineel-changes`, open as
PR #1. Jaineel (`jaineelmodi11`) has push access; the repo owner is Yehdar.

**No API keys needed.** With none set, a demo provider computes crowd reactions
from each persona's real attributes, so every feature runs and the mechanism is
visible. Keys only make the *content* real.

```bash
npm test          # 52 tests
npm run typecheck
npm run build
npm run personas  # regenerate the persona library from hubs.json
```

---

## What the product is

**Vision.** Founders build a solution and then attach the wrong problem to it.
Two parts, in the order the answers matter:

**Part 1 — the market.** Describe what you built. It splits that into the
distinct problems it could be solving, selects ~120 of 326 simulated
professionals across 20 world hubs, and asks each of them **not** "do you like
this?" but **"which of these problems do you actually have?"**

The aggregate can then say: *you pitched problem A, the market has problem C,
and they would pay for it.* That is the reveal, and it is the whole product.
Then five agents argue about whether that problem is worth solving in one
specific city, producing a Problem Validation Score.

**Part 2 — the committee.** Choose one of 25 real firms across 17 hubs. Three
partner agents deliberate before you speak, then you pitch out loud. They
interrupt, log what you dodged, and vote — weighted by seat, dissent surfaced
rather than averaged.

Targets: Hack the North main track (the reveal), the multi-agent track (the
deliberation protocol), and ElevenLabs (voice is core, not decorative).

---

## Where things live

```
src/lib/types.ts          THE CONTRACT. VentureFile is the spine both halves
                          read and write. Part 1 writes extractedProblems,
                          chosenProblem, hubFindings, pvs. Part 2 writes
                          pitchTranscript, objections, verdict.

src/lib/agents/protocol.ts  The 5-round deliberation engine. GENERIC over the
                          roster — both councils run through it. ~515 lines,
                          the most important file in the repo.
src/lib/agents/hub/roster.ts    5 hub agents + Contrarian
src/lib/agents/vc/seats.ts      3 VC seats + Devil's Advocate + Chair
src/lib/agents/vc/moderator.ts  decides whether/who interrupts (cheap+fast)
src/lib/agents/vc/speak.ts      composes what a seat actually says

src/lib/discovery/crowd.ts      batched crowd reactions + aggregation
src/lib/discovery/problems.ts   solution -> candidate problems
src/lib/discovery/signals.ts    WHO responded, as attribute separators
src/lib/discovery/personaChat.ts  call one person from the crowd

src/lib/verdict.ts        weighted vote math — PURE, no async
src/lib/pvs.ts            validation score — PURE, no async
src/lib/llm.ts            provider seam: OpenAI / Anthropic / demo / replay
src/lib/providers/demo.ts attribute-driven fake output, 607 lines
src/lib/providers/fixtures.ts  record + replay for DEMO_MODE
src/lib/store.ts          venture file (persisted, key vision.session)
src/lib/sessions.ts       saved runs + diff — WRITTEN, NOT WIRED UP

src/data/hubs.json        20 hubs. SINGLE SOURCE — the persona generator and
                          the globe both read this. Do not duplicate it.
src/data/firms.ts         25 firms across 17 hubs
src/data/personas/library.json   326 generated personas (committed)

src/app/page.tsx          Part 1 — discovery. 863 lines, the main screen.
src/app/committee/page.tsx  Part 2 — deliberation
src/app/meeting/page.tsx    Part 2 — the voice pitch
src/app/report/page.tsx     the diligence report with live weight sliders
```

Routes: `/api/discovery/{run,council,persona}`, `/api/vc/{deliberate,preread,turn,firms}`,
`/api/voice/{stt,tts,status}`, `/api/system`.

---

## Decisions that should not be undone

Each of these was deliberate and reversing one will quietly break something.

**The crowd is asked which problem they have, not whether they like it.**
Sentiment averaging cannot produce the reveal. This is the single differentiating
mechanic — everything else is staging for it.

**Agents cross-examine each other.** Running N agents in parallel and averaging
is N single-agent calls with a mean. `protocol.ts` runs decompose → blind pass →
**directed** challenges → rebuttal with recorded belief revision → adversary.
Belief revision is what produces a conclusion no single agent held.

**Both councils use the same engine.** Different rosters, identical machinery.
That is the argument that this is infrastructure rather than two prompt chains,
and it is what to lead the multi-agent explanation with.

**`verdict.ts` and `pvs.ts` are pure and synchronous.** Moving a weight slider
must never call a model. If anything there needs to `await`, the design is wrong.

**Everything degrades.** No API key → demo provider. No ElevenLabs → browser
speech → text. Network dead → recorded fixtures. Nothing in the critical path
requires the network.

**Two persona attributes are ours and load-bearing.** `budgetAuthority`
separates someone who loves it from someone who can sign for it;
`painTolerance` separates a real problem from a mild annoyance. Both feed PVS.

**Only one firm has a populated `antiPortfolio`.** Exactly one firm in venture
publishes its misses. Inventing specific passes for a named company puts false
claims in its mouth. The others ship empty and the Skeptic argues thesis
mismatch instead.

**Negative is crimson, accent is coral.** If "look here" and "this is bad" are
the same colour, neither means anything.

**Sentiment runs cold-slate → coral, never red→green.** Reads as market heat
rather than pass/fail, and survives colourblindness.

---

## Done

| | |
|---|---|
| Deliberation protocol | 5 rounds, directed challenges, belief revision, metrics |
| Part 1 | problem split → retrieval → batched crowd → reveal → hub council → PVS |
| Part 2 | pre-read → deliberation → voice pitch → objections → weighted verdict → report |
| Persona call | talk to any one of 326, push-to-talk or typed |
| Crowd signals | which attributes separate the engaged from everyone else |
| Globe | three.js, coastlines, one merged `LineSegments`, click-to-drill |
| Stage rail | 8 stages, Part One / Part Two, derived from real state |
| Skin | warm ink + bone inserts + coral; aperture logo that opens as it loads |
| Demo mode | record/replay keyed on prompt hash, works offline |
| Docs | `README`, `ARCHITECTURE.md`, `DEMO.md` |

**52 tests, clean build.**

---

## Next, in priority order

### 1. Wire up the dashboard — `src/lib/sessions.ts` exists and is unused

The store is written and tested-by-typecheck but **nothing calls it**. Needed:

- `src/app/dashboard/page.tsx` — a grid of saved runs: solution, the reveal
  (pitched vs market problem), PVS, committee decision. Click to reload one.
- Call `useSessions().begin(solution)` when a run starts in `src/app/page.tsx`,
  and `record(summariseCrowd(...))` when the crowd verdict lands. Same for PVS
  and the committee decision.
- Surface `diffSessions(prev, next)` when a run has a `parentId`.

### 2. The refine loop — the reason the dashboard matters

After the reveal, offer *"rewrite it around the market's problem and run again"*.
Pass `parentId` so the two runs are linked, then show the diff: sentiment moved,
engagement moved, PVS moved. **Nobody demos iteration.** The architecture already
supports it — `diffSessions` is written.

### 3. Make the two parts feel like different places

`/` → `/committee` is currently a link. It should be a transition: Part 1 closes
on a verdict card, Part 2 opens like a door. Biggest presentation win left for
the effort.

### 4. Re-record fixtures against a real model

`fixtures/llm.json` currently holds a run recorded from the **demo** provider.
It proves the replay path works and would replay canned content on stage.
`RECORD_FIXTURES=1 npm run dev`, do one full run, commit.

### 5. Verify the globe's focus easing

Never confirmed visually. `requestAnimationFrame` is suspended in a backgrounded
automated tab, so the render loop never ran during testing — screenshots still
paint because CDP forces them. The maths was checked against the at-rest state.
**Just open it and watch whether the globe rotates to the committee.**

### 6. Smaller gaps

- Web scout (Playwright + Readability) for real cited evidence — planned, never
  built. Highest risk item; keep it out of the critical path.
- The `Chair` agent never adjudicates — it routes and synthesises but never
  rules a challenge answered.
- Rebuttal is one round. A convergence loop (repeat until `|Δvariance| < ε`) is
  the natural upgrade; deferred because it multiplies cost and latency.
- No coalition detection — agents that always agree could be down-weighted as
  correlated rather than independent evidence.

---

## Gotchas that will bite

**The demo provider is 607 lines and parses attributes out of prompts.**
`src/lib/providers/demo.ts` regex-matches persona scores from the user message
to compute reactions. If you change the prompt format in `crowd.ts` or
`personaChat.ts`, **the demo provider silently stops discriminating** and
everyone reacts identically. Tests catch this (`crowd.test.ts` asserts sentiment
spread and problem diversity) — run them after touching a prompt.

**Stream callbacks close over stale state.** `src/app/page.tsx` reads
`personasRef.current`, not `personas`, inside the SSE handler. Deployment and
reactions arrive in the same stream, so the state value is always the empty
array it was born with.

**Browsers refuse audio not started by a user gesture, silently.**
`unlockAudio()` runs inside the push-to-talk click. Test voice in a **fresh
browser profile** — it works in a warmed-up one and dies on stage.

**Hub list is in exactly one place.** `src/data/hubs.json`. The persona
generator reads it at build time and the globe reads it at runtime. Adding a hub
means re-running `npm run personas` and committing the regenerated library.

**Tests assert invariants, not counts.** Persona tests check
`length > 250` and seniority→authority ordering rather than magic numbers,
because head count is driven by `hubs.json`.

**Next 16, not 15.** `create-next-app@latest` installs 16.3.5. App Router API is
unchanged for what we use.

---

## Outstanding, needs a human decision

- **Three early commit messages name a competitor project.** All source and
  docs are clean, but `04ccdbe`, `ed3c088` and `024c1ad` mention it in their
  bodies. Scrubbing requires an interactive rebase and a force-push to
  `jaineel-changes` — destructive, and the branch is shared with an open PR.
  **Do not do this without the user saying so.**

- **Scope vs. the original two-person split.** This began as Track B (the
  committee) with Yehdar owning Track A (discovery). Both halves are now built
  here. The file-ownership table in the PR is stale. Yehdar needs to know before
  this merges or you get two discovery engines and a bad merge.

- **Still no API keys.** `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` turns 300
  canned reactions into an actual finding. This is the highest-value unblock and
  nothing else substitutes for it. Note that a Claude Pro subscription does
  **not** include API access — that is a separate, separately-billed key.
