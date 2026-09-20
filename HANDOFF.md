# Handoff

For whoever picks this up next, person or AI, on any machine. Read this, then
**`WALKTHROUGH.md`**, which is the current product direction and the reason for
most of the work below. Then `TUTORIAL.md` for what each screen means,
`ARCHITECTURE.md` for the agent protocol, `DEMO.md` for the stage script.

---

## Read first

**Branch `shafia`** is the head. It is `jaineel-changes` plus a merge and two
documents, so it holds everyone's work. Check that one out.

**State:** 110/110 tests pass. The dev server runs and every page returns 200.
The production build has not been re-run since this machine ran out of disk
(see gotchas). Tests and dev are fine.

**The product owner (Shafia) walked the flow and found it confusing.** In her
words: the four candidate problems are not needed, the problem it hands back
does not match the pitch, the screens are numbers without conclusions, and she
wants advice and analysis instead. `WALKTHROUGH.md` takes that apart step by
step and proposes a six step flow. **Start there, not with polish.**

**Do these in order:**

1. **Fix the pitch reader.** `src/lib/providers/pitch.ts` scores the word
   "software" as the market, so "software that reconciles invoices across three
   ERPs" is read as developer tools and the app answers with a problem about
   code breaking. "Software", "app", "platform", "tool", "system", "service"
   and "device" are shapes a product takes, not markets it sits in. Score the
   object instead: invoices, ERPs, reconciliation. Small fix, and everything
   downstream looks broken until it is done. Add a test per market.
2. **Move the analysis to where the founder needs it.** `assess()` in
   `src/lib/advice.ts` already writes the right coaching ("Your fans are not
   your buyers", with the measurement and the action). It is rendered only in
   `src/app/report/page.tsx`, the last screen after the committee. It belongs on
   the Part 1 result screen. Shape in `WALKTHROUGH.md`, step 5.
3. **One bet instead of four candidate problems.** The crowd still needs rival
   framings internally to choose between, which is what makes pivot advice
   possible, but the founder should see one sentence: the problem their product
   implies, who it belongs to, editable. Open decision at the end of
   `WALKTHROUGH.md`.
4. **Give "nobody has this problem" something to say.** Today it renders close
   to blank. It is the most interesting outcome in the product: already solved,
   too early, or not a problem at all. Say which, and what they use instead.
5. **Then the open list below.**

Two things need Shafia, not you: there is still no LLM key in `.env.local`, and
the fixtures need re-recording once there is one.

---

## Get running

```bash
git clone https://github.com/Yehdar/hack-the-north.git
cd hack-the-north
git checkout shafia               # everything is here
npm install
npm run dev                       # http://localhost:3000
```

```bash
npm test          # 110 tests, about 8s
npm run lint
npm run typecheck # after a build or a dev start, see gotchas
npm run build
npm run personas  # regenerate the persona library from hubs.json
npm run walkthrough  # drives the whole app in Chrome. No assertions yet
```

Node 22 on an arm64 Mac. Next **16.3.5**, not 15: read
`node_modules/next/dist/docs/` before touching framework APIs, and see
`AGENTS.md`.

---

## READ FIRST: put a key in .env.local before demoing

Without `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`, every word in the app comes
from `src/lib/providers/demo.ts`. It reads the founder's pitch and picks
sensible lines, but it cannot respond to the *content* of an answer, cannot
tell a good answer from a bad one, and cannot follow up. That is what gets
reported as "the responses are stale" or "it sounds AI generated".

**It is not the model.** The models are already `gpt-5.6-sol` and
`claude-opus-5`. There is no key for them to run on. Do not spend an afternoon
swapping models.

**One line of local setup, not product work:**

```bash
echo 'OPENAI_API_KEY=sk-...' >> .env.local   # or ANTHROPIC_API_KEY
npm run dev
open http://localhost:3000/api/system/check  # both tiers should show live
```

`.env.local` is gitignored, the provider is picked from whichever key is
present (`selectBase` in `src/lib/llm.ts`), and `/api/system/check` makes one
tiny call per tier and reports back. Restart the server after editing the file.

One key turns on: persona depth, committee responses, the chair's rulings, the
problem split, and the advice in the report.

Then record the fixtures, because `fixtures/llm.json` currently holds a run
captured from the *demo* provider:

```bash
RECORD_FIXTURES=1 npm run dev    # one full run: intake -> verdict -> pitch
DEMO_MODE=1 npm run dev          # check it replays with the network off
```

That replay is the stage insurance: no key, no network, so venue wifi cannot
take the demo down.

---

## What changed recently

**This session.** Merged `origin/jaineel-changes` into `shafia`, so one branch
now holds: the 3D figures and the pitch provider, the teammates' work on
Shafia's nine requests (council up front, spoken narration, minutes), the chair
ruling on challenges, Part 1 remembering a finished run, the UX review (no
grade in the report, stances as words, longer persona answers), the numbered
rail, one progress component, and 317 em dashes removed.

**`WALKTHROUGH.md`, this session.** The product direction: what each step is
for, why the current flow confuses a founder, the six step target, what to cut,
and three open decisions for Shafia.

Earlier on `shafia`: 3D mini figures on the globe with screen space layout and
no overlaps, the key check at `/api/system/check`, both live providers fixed for
the models they default to (pinned by `src/lib/llm.test.ts`), the pitch provider
so a cat feeder stops getting a dev tools script, and the store migration that
never worked.

---

## Still open

| # | Item | Notes |
|---|---|---|
| 1 | **No LLM key in `.env.local`** | One line, see above. Nothing else matters as much. |
| 2 | **`fixtures/llm.json` is a demo recording** | Re-record once a key exists. |
| 3 | **The walkthrough redesign** | `WALKTHROUGH.md`, and items 1 to 4 at the top of this file. |
| 4 | **Typography** | The reviewer's most repeated point: too small, too technical, too many fonts, too much of it. Largely untouched. |
| 5 | **Rounder corners, transparent popups** | "If it's a five, turn it into 25." Cards over the globe should let the globe through. |
| 6 | **Avatar on the defend page** | A figure in a suit, so pitching feels like talking to a person. `FigureAvatar` exists and is used on calls. |
| 7 | **PDF or DocX export of the report** | Asked for directly. |
| 8 | **Trim the minutes** | Drop *where they disagreed*, *conditions*, *decided*, *in the room*. Turn the pitch section into feedback on how to pitch better, not a transcript. |
| 9 | **"If they pass, why is it red?"** | A real inconsistency: a run showing pass while under the 60 threshold. Chase it before a demo. |
| 10 | **Harsher validation score** | It lands near 60 for almost every idea, so it reads as decorative. Either make it spread out and meaningful, or let the words carry the verdict and drop the number. `src/lib/pvs.ts`, pure and synchronous. |
| 11 | **Rebuttal is one round** | A convergence loop is the natural upgrade. Deferred for cost and latency. |
| 12 | **`npm run walkthrough` has no assertions** | It drives the whole app in Chrome and proves nothing. `window.__globeFigures()` exists to make the globe assertable. |

"Candidate problems one at a time" was on the old list and is superseded: the
redesign shows one bet, not four cards.

---

## Where things are

```
src/lib/types.ts             THE CONTRACT. VentureFile is the spine.
src/lib/agents/protocol.ts   5 round deliberation engine, GENERIC over roster.
                             Both councils run through it. Most important file.
src/lib/agents/hub/roster.ts    5 hub agents + Contrarian
src/lib/agents/vc/seats.ts      Lead Partner, Principal, Skeptical Partner,
                                Devil's Advocate, Managing Partner (chair)
src/lib/agents/vc/moderator.ts  decides whether and who interrupts
src/lib/agents/vc/speak.ts      composes what a seat says

src/lib/discovery/crowd.ts      batched crowd reactions
src/lib/discovery/aggregate.ts  crowd aggregation, pure
src/lib/discovery/signals.ts    WHO responded, as attribute separators
src/lib/discovery/personaChat.ts  call one person from the crowd

src/lib/advice.ts            the coaching. Belongs on Part 1, see above.
src/lib/minutes.ts           the meeting minutes
src/lib/verdict.ts           weighted vote maths. PURE, no async
src/lib/pvs.ts               validation score. PURE, no async
src/lib/llm.ts               provider seam: openai / anthropic / demo / replay
src/lib/providers/demo.ts    every word when there is no key
src/lib/providers/pitch.ts   reads the founder's pitch. Has the market bug.
src/lib/voice/narrator.ts    the spoken narration
src/lib/voice/agentVoices.ts per role voices + SpeechQueue
src/lib/voice/client.ts      voice tiers: ElevenLabs, Web Speech, text
src/lib/store.ts             venture file, crowd, firm (persisted)
src/lib/sessions.ts          saved runs + diff

src/data/hubs.json           20 hubs. SINGLE SOURCE for generator and globe.
src/data/firms.ts            25 firms across 17 cities
src/data/personas/library.json  326 generated personas (committed)

src/components/globe/Globe.tsx   three.js globe, arcs, place labels
src/components/globe/figures.ts  the people: instanced 3D figures, screen
                                 space layout, picking, the wave
src/components/FigureAvatar.tsx  the same figure, flat, on the call card
src/components/Minutes.tsx       the minutes
src/components/Progress.tsx      the one progress component
src/components/StageRail.tsx     the walkthrough rail

src/app/page.tsx             Part 1, discovery. The main screen.
src/app/committee/page.tsx   Part 2, deliberation
src/app/meeting/page.tsx     Part 2, the voice pitch
src/app/report/page.tsx      the report
src/app/dashboard/page.tsx   saved runs
src/app/api/system/check/    the key check
```

---

## Decisions that should not be undone

- **The crowd is asked which problem they have, not whether they like it.**
  Sentiment averaging cannot produce a pivot. This is the whole product.
- **Agents cross-examine each other.** `protocol.ts` runs decompose, blind,
  directed challenges, rebuttal with recorded belief revision, adversary.
- **Both councils share one engine.** Different rosters, identical machinery.
- **`verdict.ts` and `pvs.ts` are pure and synchronous.** A weight slider must
  never call a model.
- **Everything degrades.** No LLM key, demo. No ElevenLabs, browser speech,
  then text. No network, recorded fixtures.
- **Retrieval reserves 30% for people the ranking does NOT favour.** Without it
  the crowd is a fan club, measured at sd 0.02 before the fix.
- **Only Bessemer has a populated `antiPortfolio`.** It is the only firm that
  publishes its misses. Inventing passes for a named firm puts false claims in
  its mouth.
- **A persona's figure (girl or boy) is an explicit generated attribute**, never
  inferred from their name. Names are picked to suit it, not the other way.
- **Red means bad and nothing else.** The blue accent is deliberately none of
  the traffic light colours.

---

## Gotchas that will cost you time

**This machine is out of disk.** A 228GB drive with under 1GB free. The
symptoms are wild: `npm run build` dies with "No space left on device", `echo`
itself fails, and macOS offloads iCloud files inside `node_modules` so typecheck
reports that `lucide-react` has no types and vitest cannot find
`rolldown-binding.wasi.cjs`. `npm cache clean --force` buys about 1GB. The
durable fix is to keep the clone off the iCloud synced Desktop and free real
space.

**The demo provider parses attributes out of prompts.** The persona line in
`src/lib/discovery/crowd.ts` is a field list that `demo.ts` regex matches.
Rewriting it as prose once made every persona fall through to a neutral default
and the crowd came back with a sentiment spread of exactly zero.
`crowd.test.ts` asserts the spread for this reason. **Run `npm test` after
touching any prompt.**

**Stream callbacks close over stale state.** `src/app/page.tsx` reads
`personasRef.current`, not `personas`, inside the SSE handler. Deployment and
reactions arrive on the same stream.

**Mutating refs inside an effect freezes them everywhere.** The React compiler
decides a ref is immutable if a closure in an effect touches it, and lint then
fails in unrelated files. Defer to a microtask, and do not touch playback refs
from a restore path.

**Browsers refuse audio not started by a gesture, silently.** `unlockAudio()`
runs inside the push to talk click. Test voice in a **fresh browser profile**.

**Arcs that look like straight rays are the camera, not `Line2`.** Seen from
directly above the launch city, every great circle through it projects as a
straight line, and a high lift carries the long ones out of frame. That is why
the deploy view looks at Waterloo from due south (`focus` on `<Globe>` in
`src/app/page.tsx`) and `arcPoints` caps the lift. `material.resolution` is set
every frame as well, but it was never the cause.

**Hub list lives in exactly one file.** `src/data/hubs.json`. Adding a hub means
re-running `npm run personas` and committing the regenerated library.

**Driving the app in headless Chrome:** use the installed Chrome through
`playwright-core` and do **not** pass `--use-angle=swiftshader`. Software GL
runs the globe at about 2.5fps and nothing settles, so screenshots look broken
when the app is fine. `requestAnimationFrame` is also throttled in a
backgrounded tab: confirm against the DOM, not the picture.

**`npm run typecheck` fails on a fresh clone** with `Cannot find name
'LayoutProps'`. Next 16 generates route types during dev or build. Run one
first.

---

## How Shafia works

Short, fast messages. She wants things built and then **checked in the running
app**, not just typechecked. She cares that it feels like the real thing:
talking to a person, a real partner meeting, spoken narration, natural voices,
plain language. She often says something feels wrong before she can say why, so
take the feeling seriously and go and find the mechanism behind it. Commit and
push when she asks, and she does ask.

---

## Needs a human decision

- **Scope.** This began as Track B (the committee) with Yehdar owning Track A
  (discovery). Both halves are built here. The ownership table in PR #1 is
  stale, and Yehdar should know before this merges.
- **Three early commit messages name a competitor project.** Source and docs are
  clean. Scrubbing needs an interactive rebase and a force push to a shared
  branch. Do not do it unasked.
- **The ElevenLabs key was shared in a chat transcript.** It works and is in
  `.env.local`. Rotate it after the event.
- **The three product decisions** at the end of `WALKTHROUGH.md`: whether the
  rival framings stay hidden or go, whether the validation score survives, and
  whether the founder can edit the bet before it is tested.
