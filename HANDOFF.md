# Handoff

For whoever picks this up next, person or AI, on any machine.

Read this first, then `WALKTHROUGH.md` (product direction), `TUTORIAL.md` (what
each screen means), `ARCHITECTURE.md` (the agent protocol), `DEMO.md` (the stage
script).

---

## Where things stand right now

**Branch `master`.** Last push is `36531c3` "Give the committee faces, hands,
and a side of the table".

The working tree is clean. Everything described below is committed and pushed.

**State:** 155 tests pass, `npm run lint` is clean, `npx tsc --noEmit` is clean.
The production build compiles. Anthropic and ElevenLabs keys are in
`.env.local`, which is gitignored and confirmed untracked.

---

## The task in flight: make the boardroom figures look real

Jaineel's words: *"make the figure more realistic in the round table they seem
as if they are not rendering or missing."* He gave a reference, the Hack the
North 2025 first place winner **Stu3dio** (`devpost.com/software/vibe-director`,
the page title says Stu3dio, not Vibe Director). Their characters are chunky
stylised 3D people with **arms and hands, glasses, a scarf, volumetric hair,
jacket lapels, and grounded contact shadows**. That list is the spec. Mine were
armless, faceless capsules, which is exactly why they read as unrendered.

### What is already done

All in `src/components/Boardroom.tsx`:

- **Arms.** A `limb(from, to, radius, mat)` helper stretches a capsule between
  two joints, so an arm is posed by shoulder, elbow and wrist. Hands rest on the
  table. Their absence was the single biggest problem: a torso with a head on it
  is a mannequin.
- **Faces.** Eyes, brows, nose, mouth, ears, all parented to the head mesh so
  they turn when the head turns.
- **Glasses** on two of the five: rims, bridge, temple arms.
- **Hair in two pieces.** A cap for the top and a separate mass for the back and
  sides. One shell could not do both jobs, and the generous version came down
  over the eyes and nose.
- **Lapels, collar, tie knot, neck.** The detail that makes a capsule read as a
  suit, for about eight triangles.
- **Five different people.** `SUITS`, `SHIRTS` and a `LOOKS` table give each
  seat its own suit, shirt, hair style and props. A room of identical figures
  reads as placeholder art however well it is lit.
- **Props.** A notepad and a coffee cup at some seats.
- **Real shadows.** `renderer.shadowMap` on, the key light casts, floor and
  table receive. Without a shadow under them the figures hover, and hovering is
  most of what "not rendered" looks like.
- **`edgeAt(angle)`** returns the distance from the middle of the table to its
  edge along a seat's line. Seats sit a fixed 0.62 beyond it, so every partner
  is the same distance from the table. They used to sit on their own ellipse,
  which meant some rested their hands on the table and others on thin air.
- **Arc seating, not a full ring.** `seatAngle()` spreads five partners across
  `Math.PI * 0.76` on the far side. Ringing the table sat two partners with
  their backs to you for the whole meeting, and the faces are the point. A real
  pitch is arranged this way too: the committee on one side, you on the other.
- **Nameplates on the table**, projected to the same measured edge, like place
  settings. They used to float over heads, and from this angle heads are close
  together so the plates landed on each other.
- Warmer light, a face light from the viewer's side (the lamp is directly
  overhead, so without it every face turned toward you sat in its own shadow),
  and a wall around the room so the top of the frame is not void.

### What to do next

1. **Watch the animation, which cannot be checked from an automated tab.** The
   head turns toward whoever is being addressed, the speaker lifts and nods, the
   floor ring pulses, the tie lerps to the stance colour, and clicking a partner
   eases the camera onto them. All of it is bound to real state, none of it has
   been seen running. The still frame is verified; the motion is not.
2. **Then go after typography**, under Still open below. It is the biggest
   remaining complaint and nothing has been done about it.

---

## Get running

```
npm install
npm run dev          # localhost:3000
npm test             # 155 tests
npm run lint
npm run build
```

`.env.local` holds `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY`. Without the
Anthropic key the app falls back to the demo provider and the agents say generic
things. **This only has to work on our machines for the demo**, not for other
users, so do not turn a missing key into product work.

---

## Still open

**From the UX review, in rough priority order:**

- **Typography.** Her most repeated complaint: text too small, too technical,
  too many fonts. Nothing has been done about it yet, and it is the highest
  value remaining change.
- Rounder corners and transparent popups.
- Candidate problems presented one at a time rather than all at once.
- PDF and DocX export of the report.
- The minutes are too long; trim them.
- "If they pass, why is it red?" The verdict colour and the verdict text
  disagree in at least one state.

**Boardroom specific:**

- The old `AgentFeed` speech bubble card is a leftover from the globe layout and
  can overlap the room at the top right. It now duplicates the right hand
  meeting log, so the honest fix is probably to delete it here.
- The right column is cramped carrying lean, direction, summaries and log all at
  once.

**Elsewhere:**

- `fixtures/llm.json` is still a recording of the **demo** provider, not the
  real model. Re-record it against Claude so replay mode is representative.
- Jaineel asked for a detailed README with diagrams, comparable in depth to a
  strong Devpost writeup. It was requested and then overtaken by other work.
  **Do not name any competitor project in anything pushed to GitHub.**

---

## Where things are

| What | File |
|---|---|
| The 3D boardroom | `src/components/Boardroom.tsx` |
| Committee page (Part 2) | `src/app/committee/page.tsx` |
| Subtitles (still used) | `src/components/RoundTable.tsx` |
| Per partner chat panel | `src/components/TableChat.tsx` |
| Right column: lean + log | `src/components/TableLog.tsx` |
| Where the room stands | `src/lib/lean.ts` |
| A private word with one partner | `src/app/api/vc/ask/route.ts` |
| The seats and their priors | `src/lib/agents/vc/seats.ts` |
| Deliberation protocol (shared) | `src/lib/agents/protocol.ts` |
| Weighted verdict (pure) | `src/lib/verdict.ts` |
| Projects dashboard | `src/app/page.tsx` |
| Discovery run (Part 1) | `src/app/study/page.tsx` |
| Saved runs | `src/lib/sessions.ts` |
| Shared state | `src/lib/store.ts` |
| Provider seam | `src/lib/llm.ts` |

Seat **ids** (`chair`, `gp`, `principal`, `skeptic`, `devils-advocate`) key the
voices, the weights and every saved run. The **titles** shown on screen are
Managing Partner, General Partner, Principal, Operating Partner, Associate.
Change a title freely; changing an id breaks saved runs.

---

## Decisions that should not be undone

- **The committee shows a lean, not a score.** A number out of a hundred invites
  a founder to optimise the figure instead of listening to the argument under
  it, and it claims a precision five simulated partners do not have.
- **Scoring is pure.** `verdict.ts`, `pvs.ts` and `lean.ts` never call a model,
  so sliders and re-reads recompute instantly and offline.
- **Partners are hard to move.** The ask prompt says being likeable, confident
  or persistent is not an argument. Most exchanges should change nothing, or the
  committee opinion above them is a decoration.
- **The deliberation is five rounds with real cross-examination**, not fan-out
  and averaging. That is the Huawei track argument and the thing a competitor
  architecture structurally cannot produce.
- **No em dashes in any user facing copy.** Simple, conversational sentences.

---

## Gotchas that will cost you time

**`requestAnimationFrame` is throttled to zero in a backgrounded automated
Chrome tab.** A frame rate probe there times out outright. Screenshots still
work because CDP forces a paint, so the **static** scene is verifiable but
animation and anything driven by the render loop is not. Three attempts to move
the camera for a close-up returned empty frames for this reason and were a dead
end. Check motion in a real foreground browser instead. Do not repeat that loop.

**The demo provider parses attributes out of prompts.** The persona line in
`src/lib/discovery/crowd.ts` is a field list that `demo.ts` regex matches. An
em dash sweep once rewrote it as prose, every persona fell through to a neutral
default, and the crowd came back with a sentiment spread of exactly zero.
`crowd.test.ts` asserts the spread for this reason. **Run `npm test` after
touching any prompt.**

**Do not edit JSX with blind Python string slicing.** It has broken
`PersonaCall.tsx` and `committee/page.tsx` once each. Read the region first, or
use the Edit tool with an exact match.

**Mutating refs inside an effect freezes them everywhere.** The React compiler
decides a ref is immutable if a closure in an effect touches it, and lint then
fails in unrelated files. This passes tests and typecheck and fails only lint,
so run lint. Defer to a microtask, and do not touch playback refs from a restore
path.

**Each partner owns their suit colour now.** `Person.suit` carries it and the
render loop lerps from that. There is no module level `SUIT` any more; if you
reintroduce one the five partners become identical again.

**Stream callbacks close over stale state.** The SSE handlers read
`personasRef.current`, not `personas`.

**Browsers refuse audio not started by a gesture, silently.** `unlockAudio()`
runs inside the push to talk click. Test voice in a fresh browser profile.

**Hub list lives in exactly one file**, `src/data/hubs.json`. Adding a hub means
re-running `npm run personas` and committing the regenerated library.

**`npm run typecheck` fails on a fresh clone** with `Cannot find name
'LayoutProps'`. Next 16 generates route types during dev or build. Run one
first.

---

## How the team works

**Jaineel** wants things built and then **checked in the running app**, not just
typechecked. He often says something feels wrong before he can say why, so take
the feeling seriously and go and find the mechanism behind it rather than
arguing. Short messages, fast iteration. He asks for pushes, so push when asked.

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
