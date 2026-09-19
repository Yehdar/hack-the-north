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
npm test          # 73 tests
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
| 1 | **Agents cannot hear the founder** | See the section above. Needs an API key. |
| 2 | **Map focuses the wrong city** | The committee header says one city while the camera sits on another. Focus is passed in `src/app/committee/page.tsx`; check it against `firm.hqHubId`. |
| 3 | **Hub council has no audio** | `/committee` has a working "hear them" toggle using `SpeechQueue`. The hub council on `/` does not — the same component drops in, roughly ten minutes. |
| 4 | **No force-move-on button** | If a run stalls or grades badly mid-demo there is no way to skip forward. Was requested; not built. |
| 5 | **Globe focus easing unverified** | `requestAnimationFrame` is suspended in a backgrounded automated tab so it could never be confirmed by screenshot. Open it and watch. |
| 6 | **Side panel too narrow / globe too large** | Requested: widen the deliberation panel and shrink the globe when it opens. `aside` is `w-96` in `committee/page.tsx`; `DeliberationGraph` is hard-coded `W = 300`. |
| 7 | **Faces could be friendlier** | Requested. `AgentFace.tsx` — softer proportions, larger eyes. |
| 8 | **`fixtures/llm.json` is a demo recording** | Re-record against a real model. |
| 9 | **Chair never adjudicates** | It routes and synthesises but never rules a challenge answered. |
| 10 | **Rebuttal is one round** | A convergence loop (repeat until variance stops moving) is the natural upgrade; deferred for cost and latency. |

---

## Testing that still needs doing

The suite covers the maths and the protocol well and the UI barely at all.

**Covered (73 tests):** vote maths, PVS purity, deliberation protocol including
directed challenges and belief revision, crowd aggregation and diversity floor,
persona library invariants, retrieval, advice grading, session diffing.

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
- **`localStorage` migration.** The key was renamed `atlas.ventureFile` →
  `vision.session` with a migrate function that is untested.
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
