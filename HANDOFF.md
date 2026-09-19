# Handoff

For whoever picks this up next — person or AI. Read this first, then
`TUTORIAL.md` for what each screen means, `ARCHITECTURE.md` for the agent
protocol, and `DEMO.md` for the stage script. Written 2026-09-19 (Hack the
North). **All the work now lives on `master`**, which is `shafia` plus the two
sessions described below; `jaineel-changes` points at the same commit.

**If you are an AI picking this up on another laptop:** every one of Shafia's
nine open requests has now been built and checked in a browser — see "Open
requests" below for what each one turned into and what is still worth doing.
The one thing that still changes everything is an API key (step 1).

---

## Where we stopped, and what to do next

**State at handoff:** everything is on `origin/master`. On a clean install:
**107/107 tests pass**, `npm run lint` is clean, `npm run typecheck` and
`npm run build` both succeed on a fresh clone. No half-finished edits.

**This session** (on top of `74140b5`): Shafia's nine open requests, plus the
bugs found by walking the app end to end. In short:

- **The hub council is the main view.** The side panel widens and the globe
  steps back while a council sits; `CouncilStage.tsx` shows what the chair
  asked each agent, the current exchange in large type, and every challenge
  with the answer it got. Round-0 tasks were being streamed and thrown away.
- **The narrator speaks.** Each new line once, muted with the speaker button
  next to it (remembered), never before your first click, and through the same
  queue as the councils so two voices never overlap (`lib/voice/narrator.ts`).
- **Voices stopped sounding like a screen reader.** The browser's best natural
  voice is picked and matched to the figure each speaker is drawn as
  (`lib/voice/browserVoices.ts`); with an OpenAI key, `/api/voice/tts` uses
  OpenAI's own voices (`lib/voice/openaiTts.ts`).
- **The call feels like a call.** They pick up and say hello, in their own
  voice, as a big figure that nods and mouths the words while it talks.
- **The committee keeps minutes** (`lib/minutes.ts`): who was there, each
  partner's view and whether it moved, where they disagreed, the decision, the
  conditions and the next steps. On `/committee`, on `/report`, and saved with
  the run so `/dashboard` keeps them. Pure, so it needs no key.
- **The validation score is harsher** and says why in words (`pvs.ts`):
  willingness to pay weighs three times what it did, evidence is discounted by
  how many people actually stand behind it, and a pitched-vs-market mismatch
  costs points. The same run that scored 58 now scores 50.
- **Two bugs that ate real work:** the crowd result was never saved, so the
  report's grade never appeared; and a new run kept the previous run's
  committee verdict, which showed up on the dashboard as a verdict for a run
  that never pitched.
- **Demo text that read as broken:** "shops,," and "1 of 6 people has/have",
  a fridge classified as a health product, "Teams have no…" for a consumer
  app, incumbents whose clauses ran into the next sentence, and the hub chair
  being told it chairs an investment committee (so the hub council fell back
  to "Assess this venture on: …").

**The session before** (commit `63c0b8c`, "Figures on the globe, a key check,
and a pitch provider"):

- **People on the globe.** Personas and committee partners are small 3D figures
  instead of dots (`src/components/globe/figures.ts`, `FigureAvatar.tsx`). See
  "People on the globe" below.
- **Key check.** `GET /api/system/check` (`src/app/api/system/check/route.ts`)
  makes one tiny call per model tier and reports ✓/✗, model and latency. Also
  wired into the system panel (`src/components/hud/SystemPanel.tsx`).
- **Providers fixed for current models** (`src/lib/llm.ts`, pinned by
  `src/lib/llm.test.ts`). Details in the hallucination section.
- **Pitch provider** (`src/lib/providers/pitch.ts`). With no model, the demo
  provider now reads the founder's own pitch (what it is, who for, which of 12
  domains) so a cat-feeder pitch no longer gets a dev-tools script back.
  `demo.ts` was largely rewritten around it.
- **Crowd aggregation split out** into `src/lib/discovery/aggregate.ts`.
- **Store migration actually works now** (`src/lib/store.ts`, tested in
  `store.test.ts`) — the old `atlas.ventureFile` key is read via a storage
  fallback, because zustand's `migrate` never sees the old key.

**Do these next, in this order:**

0. **Read "Open requests" below for what was built** and what is still worth
   doing on each. Nothing there is blocking any more.
1. **Get an LLM key into `.env.local`** (`OPENAI_API_KEY` or
   `ANTHROPIC_API_KEY`), restart `npm run dev`, open
   `http://localhost:3000/api/system/check`. Both tiers must show ✓. This is
   the single highest-value action — see the next section. Ask Shafia for a
   key; none is in the repo, and none is set in her local `.env.local` either.
2. **Get the ElevenLabs key** from Shafia (`ELEVENLABS_API_KEY`). Her local
   `.env.local` currently has it blank, so the voice pitch falls back to browser
   speech. It was shared in a chat transcript earlier — it should be rotated
   after the event anyway.
3. **Re-record `fixtures/llm.json` against the real model**:
   `RECORD_FIXTURES=1 npm run dev`, do one complete run (intake → verdict →
   pitch), stop the server, commit the fixture. Then check that
   `DEMO_MODE=1 npm run dev` replays it with the network off. That is the stage
   insurance.
4. **Rehearse `DEMO.md` end to end** with the real model, in a **fresh browser
   profile** (audio autoplay and mic permissions behave differently once
   granted). Every bug so far was found by clicking, not by tests.
5. **Talk to Yehdar before merging** (see "Needs a human decision").
6. Only if there is time: bugs #9 and #10 in the table below, then the missing
   tests.

---

## Open requests — what each one turned into

Shafia's requests, in her priority order, with what was built and what is
still worth doing. Every one was checked in a real browser (see "How the UI
was tested").

1. **Answers that make sense for the idea pitched.** *Done, within what a
   demo provider can do.* The cat feeder, a budgeting app, a tutoring app and
   a solar fridge were each run end to end and every line read. Fixed: the
   fridge was classified as a health product (what it is and who it is for now
   outweigh words it merely mentions, `pitch.ts`); "mostly shops,, not
   everyone"; "1 of the 6 people … have this"; "Teams have no budgeting app"
   for a consumer product; incumbents with clauses running into the next
   sentence ("…on everyone's phone from shipping"); "the first time it fails,
   it's out of the house" about an app; "why hasn't the big pet brands…".
   Consumer products are now asked of people as people — the crowd is picked
   without the industry match that gave a cat feeder a room of factory
   automation leads, they are told to answer in their private life, and they
   are shown as "35–40 · climbing, woodworking" rather than by job title.
   *Still worth doing:* the persona library is 326 working professionals, so
   for a consumer product the crowd is still professionals answering at home.
   The earlier notes below are what each request started from.
   She pitched "a self feeding machine for cats" and got the dev-tools problem
   ("nobody can say which part was the risky one") and a dev-tools committee.
   Cause: without a key, `demo.ts` was one script for one pitch. Commit
   `63c0b8c` added `src/lib/providers/pitch.ts` (reads what it is, who it is
   for, and which of 12 markets) and rewrote `demo.ts` so problems, crowd
   quotes, hub council, committee, person calls and meeting replies are built
   from the pitch, in conversational language. **Not yet checked in a browser**
   with a non-software pitch: run the whole flow with the cat feeder and a
   couple of others (a budgeting app, a tutoring app) and read every line. The
   real fix is still an API key.

2. **Make the council the main thing, with more context.** *Done*
   (`CouncilStage.tsx`): while a council sits the panel widens to
   `min(640px,46vw)`, the globe steps back, the left column collapses to the
   problem being argued about, and the panel shows the chair's questions, the
   current exchange in large type, challenge → answer threads, and round one's
   findings. The original request was: On Part 1 the right
   panel (`<aside>` in `src/app/page.tsx`, currently `w-80`) should be much
   bigger and the globe smaller; during the hub council the argument should
   become the main view, showing what each agent was asked (the chair's round-0
   tasks), who is talking to whom, the current exchange in large text, and
   challenge → answer threads. The committee page already does the
   widen-and-step-back trick when convened (`convened`, `distance` on `<Globe>`,
   `DeliberationGraph` sizes itself to its width) — reuse it.

3. **The person on the call card should feel like a real call.** *Done:* they
   pick up and say hello in their own voice the moment the call connects
   (`greet` on `/api/discovery/persona`), the figure is 124px, nods and mouths
   the words while talking, and the card shows "calling" then "on call". The
   original request was: Make the
   figure in the card much bigger (`FigureAvatar` at `size={44}` in
   `src/components/PersonaCall.tsx`), animate it while they talk (it only has a
   glow for `speaking` today), and have them **greet you when the call
   connects**. Half done: `demoPersonaReply` in `demo.ts` already answers a
   greeting (a prompt containing "The call just connected", or a question
   starting hi/hello). Still needed: a greeting mode in `askPersona`
   (`src/lib/discovery/personaChat.ts`) and `PersonaCall` sending it on open
   and speaking the reply.

4. **Speak the narrator line out loud.** *Done* (`lib/voice/narrator.ts`): on
   by default, muted by the speaker button beside the line and remembered,
   silent until the founder's first click, each new line said once (counts
   ticking inside a line don't repeat it), and sharing one `SpeechQueue` with
   the councils so nothing overlaps. **Ask Shafia to confirm:** her words were
   "can we not output it as audio", read here as *can't we*. The original
   request was: The line at the bottom that says what
   is happening next (the `<Narrator>` on Part 1 and on `/committee`, e.g.
   "Bessemer Venture Partners's partners have read your file. Convene them…")
   should be read aloud, so it feels like a real app you pitch a fund through.
   She wrote "can we not output it as audio" — read as *"can't we"*, i.e. she
   wants it spoken; confirm if unsure. Needs a mute toggle, must start only
   after a user gesture (autoplay policy), and must share **one** queue with
   the "hear them" council audio so voices never overlap — `SpeechQueue` in
   `src/lib/voice/agentVoices.ts`, with the narrator as its own agent id.

5. **Voices that sound like ChatGPT's, not robotic.** *Done as far as a key
   allows* (`lib/voice/browserVoices.ts`): the best natural voice the browser
   has is picked (Premium/Enhanced/Natural/Google, never the novelty ones),
   matched to the figure each speaker is drawn as, with two slots per gender so
   two partners never share a voice, and pitch-bending damped on good voices.
   With `OPENAI_API_KEY` set, `/api/voice/tts` uses OpenAI's voices
   (`gpt-4o-mini-tts`, marin/coral/cedar/ash) — **written but never run against
   a real key; try it first.** The original request was: The browser tier speaks
   with the default `speechSynthesis` voice. Cheapest win: pick the best voice
   the browser has (names containing "Natural", "Premium", "Enhanced", "Google
   US English", "Samantha", "Ava") in `speakInBrowser`
   (`src/lib/voice/client.ts`), matched to each figure's girl/boy. ElevenLabs
   (tier already built) needs `ELEVENLABS_API_KEY`. Closest to ChatGPT: add
   OpenAI TTS (e.g. `gpt-4o-mini-tts`, voices such as `coral`, `sage`,
   `alloy`) to `/api/voice/tts` when `OPENAI_API_KEY` is set.

6. **The committee should feel like a VC partner meeting, with minutes.**
   *Done* (`lib/minutes.ts`, `components/Minutes.tsx`): the chair writes up the
   meeting the moment it ends — who was there and who votes, each partner's
   view and whether they moved, where they disagreed (challenges that were
   held, and standing dissent), the decision and what sank it, the conditions,
   and next steps. Rewritten after the pitch with what was answered and what is
   still open, shown on `/committee` and `/report`, and saved with the run so
   `/dashboard` keeps it. Pure, so it costs no model call. The original request
   was:
   Partners discussing the product and their opinions of it, and **a summary
   that is logged**: after the deliberation (and after the pitch), meeting
   minutes — who was there, each partner's view and whether it moved, the
   disagreements, the decision, conditions, next steps. Show them on
   `/committee` and `/report`, and save them with the run in
   `src/lib/sessions.ts` so `/dashboard` lists them. The Managing Partner
   (the chair) "keeps the minutes", so it is their document.

7. **Harsher validation score.** *Done* (`pvs.ts`, `pvs.test.ts`): pay weighs
   three times what it did, evidence is discounted by how many people stand
   behind it and capped at 90, and points come off for a pitched-vs-market
   mismatch or almost nobody paying. The score now says why in plain words
   ("below the bar of 60, mostly because only 9% would pay") on Part 1, in the
   narrator line and on the report. A run that scored 58 scores 50. The
   original request was: It lands on about 57–60 every time.
   `src/lib/pvs.ts` (must stay pure and synchronous). In demo runs evidence
   strength comes out near 95 because every canned verdict cites a field — that
   inflates the total. Ideas: cap or discount evidence, penalise a
   pitched-vs-market mismatch and low willingness to pay, weight severity ×
   pay harder. Update `pvs` tests and the "Below the bar" copy to match.

8. **Is the committee realistic?** *Answered in words — pass this to her.*
   Real investment committees are 3–6 partners who all vote; the partner who
   brought the deal presents a memo; principals usually prepare the diligence
   but do not formally vote; the managing partner chairs *and* votes; and the
   founder pitches to the partnership and then leaves before the discussion and
   the vote. This app is a stylised version: the partners read the memo and
   argue first, then you pitch, then they vote — and the chair here keeps the
   minutes without voting. The seats themselves match a real fund. She
   asked whether the roles and their number match a real VC fund. Seats were
   renamed in `63c0b8c` (`src/lib/agents/vc/seats.ts`): **Lead Partner** (the
   partner who brought the deal, 50%), **Principal** (did the diligence, 30%),
   **Skeptical Partner** (was "Anti-Portfolio Skeptic", 20%), **Devil's
   Advocate** (10%), **Managing Partner (chair)** (runs it, keeps the minutes,
   no vote here). Tell her plainly how it compares: real investment committees
   are 3–6 partners who all vote; the deal lead presents a memo; principals
   usually prepare but do not formally vote; the managing partner chairs *and*
   votes; and the founder pitches to the partnership and then leaves before
   the discussion and vote. The app's order (partners read the memo and argue →
   you pitch → verdict) is a stylised version of that.

9. **Nothing should sound robotic.** *Another pass done:* round labels and
   meanings are in plain English ("Round 2 · questioning each other"), the
   transcripts and "minds changed" name partners by role instead of `gp` and
   `skeptic`, the hub chair's fallback questions read like questions, and the
   council copy no longer refers to colours it doesn't use. Earlier: Demo lines were rewritten
   conversationally, and real models are now told to talk like people
   (`position` in `protocol.ts`'s verdict schema, and a rule in both system
   prompts). Still worth a pass: narrator lines and UI copy that read like a
   report.

---

## How Shafia works

- Short, fast messages; she wants things done, then **run and checked in the
  real app** — "run the software and test it and make sure it works like it is
  supposed to".
- She cares that it feels like the real thing: talking to real people, a real
  VC partner meeting, spoken narration, natural voices, plain language.
- Commit and push only when she asks; she does ask ("push it to the branch").

---

## How the UI was tested

**`npm run walkthrough`** (`scripts/walkthrough.mjs`) drives the whole app in
the Chrome already installed: intake → problem split → deploy → listen → a call
with one person → the reveal → the hub council → validation → the committee →
the pitch → the report → saved runs. Ninety seconds. It leaves screenshots in
`.walkthrough/`, prints every line spoken and the voice that said it, and
fails if a line talked over another, if the report loses its grade or its
minutes, or if anything hits the console. Run `npm run dev` first; pass a
pitch as an argument to try a different one, `HEADED=1` to watch it.

That script is where the rest of this section comes from — keep reading if you
are writing another one:

- **Do not** pass `--use-angle=swiftshader`: software GL runs the globe at
  ~2.5 fps and animations never settle; the default Metal path gives 60 fps.
- Seed state before loading a page:
  `localStorage.setItem("vision.session", JSON.stringify({ state: { ventureFile, firmId }, version: 1 }))`.
  Wait for the boot overlay ("Waking the room", "Committee ready", …) to go.
- The globe is assertable: `window.__globeFigures()` returns every figure on
  screen with its box in canvas pixels. Assert no two boxes (with `shown > 0.6`)
  intersect, and no visible city label (the divs inside the globe's
  `pointer-events-none absolute inset-0 overflow-hidden` overlay with
  `style.opacity === "1"`) covers a figure.
- Stub speech with `addInitScript`: replace `window.speechSynthesis` with an
  object whose `speak(u)` calls `u.onend()` after a second.
- Simulate a stuck model: `page.route("**/api/discovery/run", …)`, fetch the
  real response, keep only the first few SSE events, fulfil with those.
- The flow, by name: "Ask the market" → "Next: choose who to ask →" →
  "Next: ask them →" → "Show me what they said →" → "Use their problem, and
  study it in …" → "See the validation score →" → "Take it to the committee →"
  → "Enter the committee →" → "Convene the committee" → "Now defend it →" →
  type into "type, or hold the floor and talk" → Enter → `/report` →
  `/dashboard`. About 90 seconds. **"Now defend it", "Enter the committee" and
  "Take it to the committee" are links, not buttons** — match on
  `page.locator("button, a")`, or `getByRole("button")` silently waits forever.
- **To hear what the app says**, stub speech in `addInitScript`: replace
  `window.SpeechSynthesisUtterance` with a plain class (assigning a fake voice
  to a real one throws), give `speechSynthesis.getVoices()` a list of
  Mac/Chrome voice names, and have `speak()` record `{text, voice.name}` and
  call `onend()` after ~250ms. Record a flag when `speak` is called while
  another line is playing — that is how you prove two voices never overlap.
  `window.__spoken` is reset by navigation, so read it before leaving a page.
- The narrator will not speak until the page has had a real click
  (`navigator.userActivation`), which Playwright clicks satisfy.
- Text is compared as rendered, so `text-transform: uppercase` headings come
  back as "MINUTES OF THE MEETING". Match case-insensitively.

---

## Get running

```bash
git clone https://github.com/Yehdar/hack-the-north.git
cd hack-the-north
git checkout master                # ALL the work is here.
npm ci
cp .env.example .env.local         # then fill in keys — see below
npm run dev                        # http://localhost:3000
```

```bash
npm test          # 107 tests, ~9s
npm run lint
npm run typecheck # generates Next's route types first, so a fresh clone passes
npm run build
npm run walkthrough            # drives the whole app in Chrome — see below
npm run walkthrough -- "A budgeting app that warns you before payday"
npm run personas  # regenerate the persona library from hubs.json
```

Branches: **`master` is the current head** — `shafia`'s work plus the session
above. `jaineel-changes` points at the same commit. `shafia` stops at
`98308d7` (this file's previous version); pull `master` into it before working
there again. Check PR #1 on GitHub before opening anything new against
`master`.

Node 22 / npm 10 on an arm64 Mac is what it was built with. Next **16.3.5**,
not 15 — read `node_modules/next/dist/docs/` before touching framework APIs
(see `AGENTS.md`).

`.env.local` is gitignored. The app runs with **no keys at all** (demo
provider, browser speech), which is why it is easy to forget that it is running
without a brain.

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

Provider selection (`src/lib/llm.ts`, around line 245): `DEMO_MODE=1` wins over
everything (replays `fixtures/llm.json`); otherwise `LLM_PROVIDER` if set;
otherwise OpenAI if `OPENAI_API_KEY`, else Anthropic if `ANTHROPIC_API_KEY`,
else demo. `RECORD_FIXTURES=1` wraps whichever provider was selected (even demo) in a recorder.
Defaults: OpenAI `gpt-5.6-sol` / `gpt-5.6-luna`, Anthropic `claude-opus-5` /
`claude-haiku-4-5` (deep / fast tier). The fast tier is the moderator, which
runs on every founder speech turn — keep it fast.

**Partially mitigated, not fixed.** `seatResponse()` (`demo.ts:345`) and the
new `pitch.ts` pull the subject out of the venture file and ask questions that
are hard about *any* business, so the words at least belong to the
conversation:

```
SKEPTIC: What stops the incumbent shipping fridge as a feature the quarter
         after you launch?
```

That is the ceiling without a model. The partners still cannot respond to the
*content* of an answer, cannot tell a good answer from a bad one, and cannot
follow up. **A real key fixes all of it** and is the highest-value thing anyone
can do to this repo. Everything downstream — the objection tracker, the
verdict, the report's advice — is already wired to use real responses the
moment one exists.

Same applies to `fixtures/llm.json`: it currently holds a run recorded from the
*demo* provider, so `DEMO_MODE=1` replays canned content. Re-record it (step 3
above) before presenting.

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
src/lib/agents/vc/seats.ts      Lead Partner, Principal, Skeptical Partner,
                                Devil's Advocate, Managing Partner (chair)
src/lib/agents/vc/moderator.ts  decides whether/who interrupts
src/lib/agents/vc/speak.ts      composes what a seat says
src/lib/agents/vc/preread.ts    seats prepare before you speak

src/lib/discovery/crowd.ts      batched crowd reactions
src/lib/discovery/aggregate.ts  crowd aggregation (split out of crowd.ts)
src/lib/discovery/signals.ts    WHO responded, as attribute separators
src/lib/discovery/personaChat.ts  call one person from the crowd

src/lib/advice.ts            grades the idea from THIS run's numbers. Harsh.
src/lib/verdict.ts           weighted vote maths — PURE, no async
src/lib/pvs.ts               validation score + why it landed there — PURE
src/lib/minutes.ts           the chair's record of the meeting — PURE
src/lib/llm.ts               provider seam: openai / anthropic / demo / replay
src/lib/providers/demo.ts    attribute-driven fake output (~960 lines)
src/lib/providers/pitch.ts   reads the founder's pitch for the demo provider
src/lib/voice/agentVoices.ts per-role voices + SpeechQueue (replace/drop)
src/lib/voice/client.ts      voice tiers: ElevenLabs/OpenAI → Web Speech → text
src/lib/voice/browserVoices.ts  picks the best browser voice, by figure — PURE
src/lib/voice/narrator.ts    the spoken narrator: mute, and what counts as new
src/lib/voice/openaiTts.ts   OpenAI voices, SERVER ONLY. Never run with a key.
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
src/components/CouncilStage.tsx  the hub council as the main view: the chair's
                                 questions, the line being said now, threads
src/components/Minutes.tsx       the minutes, rendered
src/components/AgentFace.tsx     animated faces
src/components/Light.tsx         approval lights (go/caution/stop)
src/components/hud/SystemPanel.tsx  provider status + "check the live model"

src/app/page.tsx             Part 1 — discovery (~1900 lines, the main screen)
src/app/committee/page.tsx   Part 2 — deliberation
src/app/meeting/page.tsx     Part 2 — the voice pitch
src/app/report/page.tsx      the diligence report
src/app/dashboard/page.tsx   saved runs
src/app/api/system/check/    the key check

scripts/walkthrough.mjs      the whole app, driven in Chrome
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
- **A persona's figure (girl/boy) is an explicit generated attribute**, never
  inferred from their name. Names are picked to suit it, not the other way.

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
| 8 | **`fixtures/llm.json` is a demo recording** | Re-record against a real model (step 3 at the top). |
| 9 | **Chair never adjudicates** | It routes, synthesises (`seats.ts:101`) and now writes the minutes, but never rules a challenge answered. Natural place: after the rebuttal round in `protocol.ts` (~line 264), a Chair pass that marks each challenge answered / unanswered, feeding the objection tracker. The minutes already say which challenges were held and which were conceded, which is the same judgement written down after the fact. |
| 10 | **Rebuttal is one round** | `protocol.ts` ~lines 215–264 (challenges, then rebuttal). A convergence loop (repeat until verdict variance stops moving, cap at 3) is the natural upgrade; deferred for cost and latency. Keep the `fast` option that skips it. |
| 11 | ~~The report never showed its grade~~ | **Fixed.** `setCrowd` existed in the store and was never called by anything, so `/report`'s "What to fix" always said "Run the market first" even after a full run. Saved at the reveal; the grade, its findings and the advice now render. |
| 12 | ~~A new run inherited the last run's committee~~ | **Fixed.** Starting a run clears the stored crowd *and* deliberation; the dashboard was showing "PASS −0.24" against a run that never pitched. |
| 13 | ~~Speech bubbles printed over each other~~ | **Fixed.** `AgentFeed` stacked cards at a fixed 86px offset while the cards are as tall as their text; it is a column now, and names partners by role. |
| 14 | ~~The lead partner had no label~~ | **Fixed.** The biggest face sits at the top of `DeliberationGraph` and its name was drawn above the canvas edge; the canvas now grows upwards by what the highest label needs. |
| 15 | ~~Captions and buttons slid under the problem cards~~ | **Fixed.** The narrator line, the button bar and the call card centre on the space left of that column. |
| 16 | ~~`npm run typecheck` failed on a fresh clone~~ | **Fixed.** It runs `next typegen` first. |
| 17 | **Part 1 forgets a finished run when you navigate away** | Going back to Part 1 from the committee shows "Nobody asked yet" — the run is in `/dashboard`, but the screen is empty. Everything needed is in the store; the screen state (problems, reactions, verdict) is not. Worth doing before a demo where anyone might click back. |
| 18 | ~~Deploy arcs "shoot off-screen"~~ | **Fixed, and it was never the resolution.** From directly above Waterloo every great circle through it projects as a straight line, and the 0.45 lift carried long arcs out of frame. The deploy view now sits due south and the lift is capped at 0.18. |

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
who is on screen and where, for tests (`Globe.tsx:349`).

## Testing that still needs doing

The suite covers the maths and the protocol well and the UI barely at all.

**Covered (107 tests, 16 files):** vote maths, the validation score (purity,
the pay weighting, the evidence discount, the penalties and the plain-words
reason), the minutes (who was present, who moved, which disagreements stand,
next steps before and after the pitch), browser voice picking (quality order,
gender matching, novelty voices excluded), the deliberation protocol including
directed challenges and belief revision, crowd aggregation and the diversity
floor, persona library invariants, retrieval, advice grading, session diffing,
the live providers' request shapes, the store rename, globe focus, and the
figure layout (no overlaps, picking, the wave).

**Not covered — worth writing:**

- **A full run end to end through the UI.** Still the gap that matters. Every
  bug found in the last two sessions was found by clicking or by the throwaway
  Playwright script in "How the UI was tested" — never by a unit test: the
  report's missing grade, the inherited committee verdict, the overlapping
  bubbles, the clipped label, the call card that never picked up.
- **The eight-step flow.** Nothing asserts you can get from intake to verdict
  without a dead end. The script below does exactly that run in about 90
  seconds — it is worth committing as a Playwright test rather than leaving in
  a scratch folder. `window.__globeFigures()` makes the globe assertable.
- **Voice tiers.** `detectTier` → capture → send has no test. It is also the
  most fragile path (autoplay policy, mic permissions, tier chosen at mount).
- **Error paths in the UI.** The API routes return correct 400/404s (verified by
  hand across ten routes), but nothing checks the pages render sensibly when a
  stream fails midway.
- **Concurrent runs.** Starting a second discovery run while one streams is
  untested and probably interleaves state.

---

## Gotchas that will cost you time

- **iCloud Desktop eats `node_modules`.** Shafia's checkout lives in an
  iCloud-synced `~/Desktop`, and macOS offloads files to `.icloud`
  placeholders. Symptoms: `npm test` dies with `Cannot find module
  './rolldown-binding.wasi.cjs'`, or typecheck says `lucide-react` has no
  declaration file. The code is fine — `rm -rf node_modules .next && npm ci`,
  or better, keep the clone outside iCloud.
- **Effects run twice in development.** A "do this once" ref guard around an
  effect that also cleans up will skip the second mount and leave the first
  mount's work discarded — which is how the call card sat on "calling…"
  forever. Let it run twice and cancel the first instead.
- **The demo provider parses attributes out of prompts.** It regex-matches
  persona scores, and the product, from the user message. Adding a line between
  `PRODUCT:` and `CANDIDATE PROBLEMS:` in `crowd.ts` broke the product match and
  every quote became "another **this** that works for a month". Add new
  instructions after the people list, and run the tests after touching a
  prompt — `crowd.test.ts` and `demo.test.ts` catch most of it.
- **Both councils share one chair prompt.** It used to say "You chair an
  investment committee" for the hub council too, so the demo handed the hub
  agents the committee's questions, none of them matched a hub id, and every
  city council fell back to "Assess this venture on: …". `deliberate({ room })`
  names the room now; keep it set if you add a third council.
- **Stream callbacks close over stale state.** `src/app/page.tsx` reads
  `personasRef.current`, not `personas`, inside the SSE handler. Deployment and
  reactions arrive in the same stream.
- **Browsers refuse audio not started by a gesture, silently.** `unlockAudio()`
  runs inside the push-to-talk click. Test in a **fresh browser profile**.
- **Arcs that look like straight rays are a camera problem, not a
  `Line2` bug.** Seen from directly above the launch city, every great circle
  through it projects as a straight line. That is why the deploy view looks at
  Waterloo from due south (`src/app/page.tsx`, the `focus` on `<Globe>`) and the
  arc lift is capped (`arcPoints` in `geo.ts`). `material.resolution` is also
  set every frame; it was never the cause.
- **Hub list lives in exactly one file.** `src/data/hubs.json`. Adding a hub
  means re-running `npm run personas` and committing the regenerated library.
- **Restart the dev server after editing `.env.local`.** Keys are read at
  startup; the key check will say "no live model" until you do.
- **`AGENTS.md` is rewritten by `next dev`.** If it shows up in a diff,
  committing it keeps the tree clean.

---

## Needs a human decision

- **Scope vs. the original split.** This began as Track B (the committee) with
  Yehdar owning Track A (discovery). Both halves are built here now. The file
  ownership table in PR #1 is stale, and Yehdar needs to know before this merges
  or you get two discovery engines and a bad merge.
- **Three early commit messages name a competitor project.** All source and docs
  are clean. Scrubbing needs an interactive rebase and a force-push to a shared
  branch — do not do it without being asked.
- **The ElevenLabs key was shared in a chat transcript.** Rotate it after the
  event.
- **Does Shafia want the narrator spoken?** "Can we not output it as audio"
  was read as *can't we*, so it is on by default with a mute that is
  remembered. One word from her flips the default (`useNarratorVoice` in
  `lib/voice/narrator.ts`).
- **Consumer products are asked of professionals.** The library is 326 working
  people; for a cat feeder they are now asked as themselves rather than as
  their job, but they are still the same 326. Generating a consumer crowd
  (`scripts/generate-personas.mjs` + `hubs.json`) is a real piece of work and
  changes every saved run, so it needs a decision before anyone starts.
