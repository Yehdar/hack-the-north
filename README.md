# Hack the North 2026

Founders build solutions before they understand the problem. This finds the
problem your solution actually solves, scores whether it is big enough, and
then makes you defend it out loud to a simulated VC investment committee.

**Phase 1 — Discovery.** You describe what you built. Agents extract the
problems it might actually solve, score each startup hub for fit, and produce a
Problem Validation Score.

**Phase 2 — Defense.** You pitch by voice to three VC partner agents. They
interrupt, probe, track what you dodged, and vote — weighted by seat.

> All VC partner personas are AI simulations. Not affiliated with, endorsed by,
> or representing any real firm. Personas are composites, never real individuals.

## Setup

```bash
npm install
cp .env.example .env.local   # works with no keys — falls back to mocks
npm run dev
```

Then open http://localhost:3000.

## The flow

1. **`/`** — enter what you built. The globe convenes the committee: the chair
   assigns diligence questions by lane, seats form positions blind, then
   challenge each other directly and may change their minds. Click any agent
   dot to see who challenged it and whether it moved.
2. **`/meeting`** — pitch out loud. Partners interrupt, and everything you
   dodge is logged against you.
3. **`/report`** — the diligence report. Re-weight any seat and the verdict
   recomputes instantly; no model is called.

**No API keys are required.** With no key set, the app uses a demo provider
that returns realistic, differentiated agent output — so you can watch a full
five-round deliberation, with challenges, concessions and a verdict, having
configured nothing. It is also the stage insurance policy if venue wifi dies.

Provider is chosen automatically: `OPENAI_API_KEY` if present, else
`ANTHROPIC_API_KEY`, else demo. Force one with `LLM_PROVIDER=openai|anthropic|demo|mock`.

```bash
npm test         # vitest
npm run typecheck
npm run build
```

## Demo mode

Venue wifi failing during a three-minute demo is not hypothetical.

```bash
RECORD_FIXTURES=1 npm run dev   # do one full run for real
DEMO_MODE=1 npm run dev         # replay it, network off
```

Replay is keyed on a hash of each exact prompt, so a replayed run is the same
deliberation rather than an approximation. An unrecorded prompt degrades to the
demo provider instead of throwing in front of an audience.

`fixtures/llm.json` currently holds a run recorded from the demo provider, which
proves the path works. **Re-record it against a real model before the demo.**

## Track split

Two people, zero overlapping files.

| Track A — Discovery | Track B — Defense |
| --- | --- |
| `src/app/api/discovery/**` | `src/app/api/vc/**`, `src/app/api/voice/**` |
| `src/components/discovery/**` | `src/components/defense/**`, `src/components/report/**` |
| `src/lib/agents/hub/**`, `src/lib/pvs.ts` | `src/lib/agents/vc/**`, `src/lib/voice/**`, `src/lib/verdict.ts` |
| `src/data/hubs.ts` | `src/data/firm.ts`, `src/mocks/ventureFile.mock.ts` |

**Shared and frozen:** `src/lib/types.ts`, `src/lib/llm.ts`.

`types.ts` is the contract between the two halves. Track A writes only the
Discovery fields of `VentureFile`, Track B writes only the Defense fields.
When the halves disagree at integration, that file is the arbiter.
