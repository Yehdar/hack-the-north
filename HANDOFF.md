# Handoff

For whoever picks this up next. Read this first, then `TUTORIAL.md` for what
each screen means and `ARCHITECTURE.md` for the agent protocol.

---

## Get running

```bash
git clone https://github.com/Yehdar/hack-the-north.git
cd hack-the-north
git checkout jaineel-changes      # ALL the work is here. master is an empty README.
npm install
npm run dev                       # http://localhost:3000
```

```bash
npm test          # 90 tests
npm run typecheck
npm run build
npm run personas  # regenerate the persona library from hubs.json
```

`.env.local` is gitignored and holds an **ElevenLabs key that works** (scoped to
`text_to_speech` + `speech_to_text`, no `voices_read` — that is fine and
handled). **There is no LLM key**, which is the single most important fact on
this page. See the next section.

---

## READ THIS FIRST: the hallucination problem

**The partners cannot hear you.** Without an LLM key every agent response comes
from `src/lib/providers/demo.ts`, which cannot read what the founder said.

Observed in a real session:

```
YOU:       Hey, I think we need this. Let's do it.
PRINCIPAL: You said teams would pay. Who has? Name one company and what they paid.
YOU:       What I want is that these fridges are very cheap, 'cause they're eco-friendly.
SKEPTIC:   We have seen this shape before. Coverage dashboards promised the same
           thing and became a number teams gamed.
```

Coverage dashboards, in a pitch about fridges. It reads as broken software
rather than as a simulation.

**Before you trust a key, check it.** Restart the dev server after adding it,
then open `/api/system/check` (or the system panel, top right of Part 1 →
"check the live model"). It makes one tiny call per tier and shows ✓/✗, the
model and the latency. A model that rejects a request parameter fails every
call, and every caller swallows that into a neutral placeholder — so without
this, a bad key looks like a committee with nothing to say.

Both providers were fixed for the models they default to (`llm.test.ts` pins
the request shapes): Anthropic no longer sends an assistant prefill or
`temperature` (both 400 on `claude-opus-5`), gives thinking room in
`max_tokens`, and enables the server-side refusal fallback; OpenAI sends
`max_completion_tokens` and `reasoning_effort` instead of `max_tokens` and
`temperature` to GPT-5-family models. Calls time out at 90s with one retry.
`LLM_EFFORT=low|medium|high` trades speed for depth (default low).

**Partially mitigated, not fixed.** `seatResponse()` now pulls the subject out
of the venture file and asks questions that are hard about *any* business, so
the words at least belong to the conversation:

```
SKEPTIC: What stops the incumbent shipping fridge as a feature the quarter
         after you launch?
```

That is the ceiling without a model. The partners still cannot respond to the
*content* of an answer, cannot tell a good answer from a bad one, and cannot
follow up. **Setting `OPENAI_API_KEY` in `.env.local` fixes all of it** and is
the highest-value thing anyone can do to this repo. Everything downstream — the
objection tracker, the verdict, the report's advice — is already wired to use
real responses the moment one exists.

Same applies to `fixtures/llm.json`: it currently holds a run recorded from the
*demo* provider, so `DEMO_MODE=1` replays canned content. Re-record it against a
real model (`RECORD_FIXTURES=1 npm run dev`, do one full run) before presenting.

---

## What this is

Founders attach the wrong problem to their solution and learn it from an
investor much later.

**Part 1** asks a simulated market of 326 professionals across 20 cities *which
problem they actually have* — not whether they like the product. **Part 2**
makes you defend that problem out loud to a committee at one of 25 real firms.

Eight steps: product → problem split → deploy → listen → **the reveal** → hub
council → validation score → the committee.

---

## Where things are

```
src/lib/types.ts             THE CONTRACT. VentureFile is the spine.
src/lib/agents/protocol.ts   5-round deliberation engine, GENERIC over roster.
                             Both councils run through it. Most important file.
src/lib/agents/hub/roster.ts    5 hub agents + Contrarian
src/lib/agents/vc/seats.ts      3 VC seats + Devil's Advocate + Chair
src/lib/agents/vc/moderator.ts  decides whether/who interrupts
src/lib/agents/vc/speak.ts      composes what a seat says
src/lib/agents/vc/preread.ts    seats prepare before you speak

src/lib/discovery/crowd.ts      batched crowd reactions + aggregation
src/lib/discovery/signals.ts    WHO responded, as attribute separators
src/lib/discovery/personaChat.ts  call one person from the crowd

src/lib/advice.ts            grades the idea from THIS run's numbers. Harsh.
src/lib/verdict.ts           weighted vote maths — PURE, no async
src/lib/pvs.ts               validation score — PURE, no async
src/lib/llm.ts               provider seam: openai / anthropic / demo / replay
src/lib/providers/demo.ts    attribute-driven fake output (~900 lines)
src/lib/voice/agentVoices.ts per-role voices + SpeechQueue
src/lib/store.ts             venture file, crowd, firm (persisted)
src/lib/sessions.ts          saved runs + diff

src/data/hubs.json           20 hubs. SINGLE SOURCE — generator and globe both
                             read it. Never duplicate this list.
src/data/firms.ts            25 firms across 17 cities
src/data/personas/library.json  326 generated personas (committed)

src/components/globe/Globe.tsx   three.js globe, dots, arcs, place labels
src/components/globe/figures.ts  the people: instanced 3D mini figures,
                                 screen-space layout (no overlaps), picking,
                                 the wave. Places stay dots.
src/components/FigureAvatar.tsx  the same figure, flat, on the call card
src/components/DeliberationGraph.tsx  the council, drawn
src/components/AgentFace.tsx     animated faces
src/components/Light.tsx         approval lights (go/caution/stop)

src/app/page.tsx             Part 1 — discovery (~1500 lines, the main screen)
src/app/committee/page.tsx   Part 2 — deliberation
src/app/meeting/page.tsx     Part 2 — the voice pitch
src/app/report/page.tsx      the diligence report
src/app/dashboard/page.tsx   saved runs
```

---

## Decisions that should not be undone

Each was deliberate; reversing one quietly breaks something.

- **The crowd is asked which problem they have, not whether they like it.**
  Sentiment averaging cannot produce the reveal. This is the whole product.
- **Agents cross-examine each other.** `protocol.ts` runs decompose → blind →
  directed challenges → rebuttal with recorded belief revision → adversary.
- **Both councils share one engine.** Different rosters, identical machinery.
- **`verdict.ts` and `pvs.ts` are pure and synchronous.** A weight slider must
  never call a model.
- **Everything degrades.** No LLM key → demo. No ElevenLabs → browser speech →
  text. No network → recorded fixtures.
- **Retrieval reserves 30% for people the ranking does NOT favour.** Without it
  the crowd is a fan club — measured at sd 0.02 before the fix.
- **Only Bessemer has a populated `antiPortfolio`.** It is the only firm that
  publishes its misses; inventing passes for a named firm is putting false
  claims in its mouth.
- **Colour: blue accent, red/amber/green lights.** The accent is deliberately
  none of the three so it can never be confused with a verdict. Red means "bad"
  and nothing else.

---

## Known bugs and rough edges

Ordered by how much they hurt a demo.

| # | Issue | Notes |
|---|---|---|
| 1 | **Agents cannot hear the founder** | See the section above. Needs an API key — then run the check. |
| 2 | ~~Map focuses the wrong city~~ | **Fixed.** The camera was right; the *seats* were not. Dots were positioned only on creation, and the first render always has the default firm (the persisted one arrives after hydration), so the committee stayed in San Francisco. Positions now update every sync. |
| 3 | ~~Hub council has no audio~~ | **Fixed.** "Hear them" on Part 1 from the reveal on; each line waits for the last to be spoken, Skip silences it, and a watchdog stops a stuck `speechSynthesis` from holding the room. |
| 4 | ~~No force-move-on button~~ | **Built.** Part 1 offers "Grade the N who answered ▸" / "End the council here ▸" / "Skip to the committee ▸" after 25s of nothing (at once if the stream closed early), and "Take it to the committee anyway →" when nobody had any problem. The committee offers "Run it again ↻" / "Skip to the pitch →". |
| 5 | ~~Globe focus easing unverified~~ | **Verified** in headless Chrome at 60fps for SF, Toronto, London, Bangalore, Sydney. Easing is now per unit of time, so a slow machine or a tab back from the background lands instead of stopping mid-turn. |
| 6 | ~~Side panel too narrow / globe too large~~ | **Done.** The committee panel widens to `min(560px, 40vw)` when convened and the globe steps back (`distance`); `DeliberationGraph` measures its width. |
| 7 | ~~Faces could be friendlier~~ | **Done.** Bigger eyes with pupils that follow the gaze, blush, softer brows, a resting half-smile; per-face blink offsets. |
| 8 | **`fixtures/llm.json` is a demo recording** | Re-record against a real model. |
| 9 | **Chair never adjudicates** | It routes and synthesises but never rules a challenge answered. |
| 10 | **Rebuttal is one round** | A convergence loop (repeat until variance stops moving) is the natural upgrade; deferred for cost and latency. |
| 11 | ~~Deploy arcs "shoot off-screen"~~ | **Fixed, and it was never the resolution.** From directly above Waterloo every great circle through it projects as a straight line, and the 0.45 lift carried long arcs out of frame. The deploy view now sits due south and the lift is capped at 0.18. |

---

## People on the globe

Every persona and every committee partner is a small 3D figure — a girl or a
boy, shirt in their stance colour — not a dot. `figure` is an explicit
attribute generated in `scripts/generate-personas.mjs` from its own seeded
stream (first names are then picked to suit it; nothing else changed), never
inferred from a name; the call voice follows it. Figures stand upright on
screen, are drawn in a second pass over the globe so the planet never cuts
into them, and are laid out in screen space every frame so none overlap —
the less important one shrinks or steps back, city labels keep off them. Click
one: they wave, the globe turns them into view above the call card, and the
card shows the same figure waving. In dev, `window.__globeFigures()` returns
who is on screen and where, for tests.

## Testing that still needs doing

The suite covers the maths and the protocol well and the UI barely at all.

**Covered (90 tests):** vote maths, PVS purity, deliberation protocol including
directed challenges and belief revision, crowd aggregation and diversity floor,
persona library invariants, retrieval, advice grading, session diffing, the
live providers' request shapes, the store rename, globe focus, and the figure
layout (no overlaps, picking, the wave).

**Not covered — worth writing:**

- **A full run end to end through the UI.** Every bug found this session was
  found by clicking, not by a test: arcs shooting off-screen, labels printing on
  each other, the pre-read never being called, the crowd being a fan club.
- **The eight-step flow.** Nothing asserts you can get from intake to verdict
  without a dead end. Playwright would pay for itself here.
- **Voice tiers.** `detectTier` → capture → send has no test. It is also the
  most fragile path (autoplay policy, mic permissions, tier chosen at mount).
- **Error paths in the UI.** The API routes return correct 400/404s (verified by
  hand across ten routes), but nothing checks the pages render sensibly when a
  stream fails midway.
- ~~`localStorage` migration.~~ It never worked — zustand's `migrate` only
  sees the current key. Fixed with a storage fallback; tested in `store.test.ts`.
- **Concurrent runs.** Starting a second discovery run while one streams is
  untested and probably interleaves state.

---

## Gotchas that will cost you time

- **The demo provider parses attributes out of prompts.** It regex-matches
  persona scores from the user message. Change the prompt format in `crowd.ts`
  or `personaChat.ts` and it silently stops discriminating — every persona
  reacts identically. `crowd.test.ts` catches this; run the tests after touching
  a prompt.
- **Stream callbacks close over stale state.** `src/app/page.tsx` reads
  `personasRef.current`, not `personas`, inside the SSE handler. Deployment and
  reactions arrive in the same stream.
- **Browsers refuse audio not started by a gesture, silently.** `unlockAudio()`
  runs inside the push-to-talk click. Test in a **fresh browser profile**.
- **`Line2` needs `material.resolution`.** A zero resolution divides by zero and
  every arc renders as a straight ray off the screen. It is now set at mount,
  per-arc at creation, and every frame.
- **Hub list lives in exactly one file.** `src/data/hubs.json`. Adding a hub
  means re-running `npm run personas` and committing the regenerated library.
- **Next 16, not 15.** App Router API is unchanged for what we use.

---

## Needs a human decision

- **Scope vs. the original split.** This began as Track B (the committee) with
  Yehdar owning Track A (discovery). Both halves are built here now. The file
  ownership table in PR #1 is stale, and Yehdar needs to know before this merges
  or you get two discovery engines and a bad merge.
- **Three early commit messages name a competitor project.** All source and docs
  are clean. Scrubbing needs an interactive rebase and a force-push to a shared
  branch — do not do it without being asked.
- **The ElevenLabs key was shared in a chat transcript.** It works and is in
  `.env.local`. Rotate it after the event.
