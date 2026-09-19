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

No API keys are required to run the app. The LLM layer falls back to a mock
provider and voice falls back to browser speech, so any feature can be built
and demoed before keys land.

```bash
npm test         # vitest
npm run typecheck
npm run build
```

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
