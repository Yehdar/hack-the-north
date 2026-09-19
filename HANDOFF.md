# Handoff

For whoever picks this up next, person or AI. Read this first, then
`TUTORIAL.md` for what each screen means, `ARCHITECTURE.md` for the agent
protocol, `DEMO.md` for the stage script.

---

## Get running

```bash
git clone https://github.com/Yehdar/hack-the-north.git
cd hack-the-north
git checkout jaineel-changes      # all the work is here
npm install
npm run dev                       # http://localhost:3000
```

```bash
npm test          # 110 tests
npm run lint      # clean
npm run typecheck
npm run build
npm run personas  # regenerate the persona library from hubs.json
```

**State:** 110/110 tests pass, lint clean, build clean, nothing half-finished.
Branch `jaineel-changes` at `dca6b53`.

`.env.local` holds a working **ElevenLabs** key (scoped to `text_to_speech` and
`speech_to_text` only, which is fine and handled). **There is no LLM key.** That
is the single most important fact on this page.

---

## READ FIRST: the agents cannot hear you

Without `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`, every word in the app comes
from `src/lib/providers/demo.ts`. It reads the founder's pitch and picks
sensible-sounding lines, but it cannot respond to the *content* of an answer,
cannot tell a good answer from a bad one, and cannot follow up.

This gets raised as "the responses are stale" or "it sounds AI generated", and
the honest answer is that it is not the model. **The models are already
`gpt-5.6-sol` and `claude-opus-5`** — the best available. There is simply no key
for them to run on.

Setting one key fixes: persona depth, committee responses, the chair's rulings,
the problem split, and the advice in the report. Everything downstream is
already wired for it.

Then re-record the fixtures, because `fixtures/llm.json` currently holds a run
captured from the *demo* provider, so `DEMO_MODE=1` replays canned content:

```bash
RECORD_FIXTURES=1 npm run dev    # do one full run: intake -> verdict -> pitch
DEMO_MODE=1 npm run dev          # check it replays with the network off
```

---

## What changed in this session

Five commits on top of `c70e941`.

**`d575c1a` + `97099c3` — the last two open bugs from the previous handoff.**

- *Bug 17, Part 1 forgot a finished run.* Going back from the committee showed
  "Nobody asked yet" over an empty globe while the dashboard listed the same run
  as complete. The crowd verdict alone could not rebuild the screen: it holds
  reactions but no coordinates and no way to map a person to a city. The
  deployed crowd is saved now (`deployed` in `store.ts`) and Part 1 restores
  itself once on mount, guarded so it cannot touch a run in progress.
- *Bug 9, the chair never adjudicated.* After the rebuttal round it now rules on
  each challenge and is told to be strict: restating a position or changing the
  subject is not an answer, conceding honestly is. A challenge that drew no
  reply is unanswered regardless of what the ruling says, tested against a
  provider that claims everything was answered. Unanswered challenges get their
  own section in the minutes.

**`5bd7fa7` — a UX review, applied.** The reviewer's structural points:

- The report was scoring a founder when it should be coaching one. **The Verdict
  section is gone.** What the room concluded still reaches the founder as words
  and as actions, never as a grade. The decision is still computed and saved
  because the dashboard compares runs, just not shown.
- **"How the room behaved" is gone.** Challenges, rebuttals and variance per
  round are how *we* know the deliberation worked. Nobody could tell how they
  were calculated and none of it is actionable.
- **The weight sliders are gone.** A founder cannot tell what re-weighting a
  partner is supposed to mean, so it was a control inviting a question it could
  not answer.
- Stances read as words now (*backed it / undecided / against it*) rather than
  `stance 0.14 · conf 0.65`.
- Persona reactions are three clauses instead of one line: where they are today,
  what they make of it, the condition attached. Measured at 45 words against 12,
  with 17 distinct answers across 40 people.

**`8551e53` — copy and navigation.**

- The stage rail is **numbered 1 to 8** instead of ticked.
- **"Step 3 of 8 · Deploy" removed** from mid-screen; the rail already says it.
- Narrator copy rewritten in a human voice. "Your idea could be solving any of
  these 4 problems, the first is how you framed it, keep an eye on it" became
  "Here are 4 problems this could be fixing. The top one is yours. See if the
  crowd agrees."
- **317 em dashes removed** from source and UI copy.

**`dca6b53` — one progress component.** There were six indicators in four
designs. Now `src/components/Progress.tsx`: `<Progress>` for completion,
`<Meter>` for a value, sharing a rounded track with a lit head at the leading
edge. The head glows while the bar is moving, so you can see whether something
is working or stuck.

---

## Still open

| # | Item | Notes |
|---|---|---|
| 1 | **No LLM key** | See the top. Nothing else here matters as much. |
| 2 | **`fixtures/llm.json` is a demo recording** | Re-record once a key exists. |
| 3 | **Typography** | The reviewer's most repeated point: text too small, too technical, too many different fonts, too much of it. Largely untouched. |
| 4 | **Rounder corners, transparent popups** | "If it's a five, turn it into 25." Cards over the globe should let the globe through. |
| 5 | **Avatar on the defend page** | She asked for a figure in a suit so it feels like talking to a person, like ChatGPT voice mode. `FigureAvatar` already exists and is used on calls. |
| 6 | **Candidate problems one at a time** | Four cards at once is too much; she suggested centred pop-ups in sequence. |
| 7 | **PDF or DocX export of the report** | Asked for directly. |
| 8 | **Trim the minutes** | She wanted *where they disagreed*, *conditions*, *decided* and *in the room* removed, and the pitch section turned into feedback on how to pitch better rather than a transcript. |
| 9 | **"If they pass, why is it red?"** | A real inconsistency she caught: a run showing pass while sitting under the 60 threshold. Worth chasing before a demo. |
| 10 | **Rebuttal is one round** | A convergence loop is the natural upgrade. Deferred for cost and latency. |
| 11 | **`npm run walkthrough` is a script, not a test** | It drives the whole app in Chrome but has no assertions. |

---

## Gotchas that will cost you time

**The demo provider parses attributes out of prompts.** This is the one that
bites hardest, and it bit me this session. The persona line in
`src/lib/discovery/crowd.ts` uses a dash as a **field separator**:

```
id 42 — Platform Engineer, Senior, software, ... tech 8 risk 6 price 3 ...
```

`demo.ts` regex-matches that. I rewrote it as prose during a copy pass, no
persona matched, every one fell through to a neutral default, and the crowd came
back with a sentiment spread of **exactly zero** — a room of 120 people all
feeling identically. Tests caught it. The parser no longer depends on the dash,
but **run `npm test` after touching any prompt**; `crowd.test.ts` asserts the
spread for this reason.

**Stream callbacks close over stale state.** `src/app/page.tsx` reads
`personasRef.current`, not `personas`, inside the SSE handler. Deployment and
reactions arrive on the same stream.

**Mutating refs inside an effect freezes them everywhere.** My first attempt at
bug 17 passed tests and typecheck but broke lint in three unrelated places: the
React compiler decided `auto`, `narrated` and `personasRef` were immutable
because a closure in an effect touched them. Defer to a microtask and do not
touch playback refs from a restore path.

**Browsers refuse audio not started by a gesture, silently.** `unlockAudio()`
runs inside the push-to-talk click. Test voice in a **fresh browser profile**.

**`Line2` needs `material.resolution`.** Zero resolution divides by zero and
every arc renders as a straight ray off the screen.

**Hub list lives in exactly one file.** `src/data/hubs.json`. Adding a hub means
re-running `npm run personas` and committing the regenerated library.

**`requestAnimationFrame` is throttled in a backgrounded automated tab.** Screens
driven through Chrome DevTools can look frozen or blank when they are fine.
Confirm against the DOM, not the screenshot.

---

## Needs a human decision

- **Scope.** This began as Track B (the committee) with Yehdar owning Track A
  (discovery). Both halves are built here. The ownership table in PR #1 is
  stale, and Yehdar should know before this merges.
- **Three early commit messages name a competitor project.** Source and docs are
  clean. Scrubbing needs an interactive rebase and a force-push to a shared
  branch. Do not do it unasked.
- **The ElevenLabs key was shared in a chat transcript.** It works and is in
  `.env.local`. Rotate it after the event.
