# Atlas

Founders build solutions before they understand the problem. Atlas tells you
which problem you are actually solving, whether a market wants it, and whether
an investor would fund it — in that order, because that is the order the answers
matter in.

**Part 1 — the market.** You describe what you built. Three hundred simulated
professionals are asked not "do you like this?" but "which of these problems do
you actually have?" The answer is frequently not the one you pitched. A council
of five agents then argues about whether the problem is worth solving in a
specific city, and the run produces a Problem Validation Score.

**Part 2 — the committee.** You pitch out loud to three VC partner agents. They
interrupt, track what you dodged, and vote — weighted by seat, with dissent
surfaced rather than averaged away.

> All partner personas are AI simulations. Not affiliated with, endorsed by, or
> representing any real firm. Personas are composites, never real individuals.

## Setup

```bash
npm install
cp .env.example .env.local   # works with no keys at all
npm run dev
```

Open http://localhost:3000.

**No API keys are required.** With none set, a demo provider computes crowd
reactions from each persona's real attributes, so the mechanism is visible and
the whole product is demoable having configured nothing. It is also the
stage insurance policy if venue wifi fails.

Provider is chosen automatically: `OPENAI_API_KEY` if present, else
`ANTHROPIC_API_KEY`, else demo. Force one with
`LLM_PROVIDER=openai|anthropic|demo|mock`.

## The flow

| Route | What happens |
| --- | --- |
| `/` | Enter your product. Candidate problems fan out, 120 people are selected and deployed onto the globe, reactions stream in, and the market's problem is compared against yours. Pick a city and five agents deliberate about it. |
| `/committee` | The investment committee deliberates over five rounds before you ever speak. |
| `/meeting` | Pitch by voice. Partners interrupt; the objection tracker fills. |
| `/report` | The diligence report. Re-weight any seat and the verdict recomputes instantly. |

## How it works

Read [ARCHITECTURE.md](./ARCHITECTURE.md). The short version: running N agents
in parallel and averaging their scores is not multi-agent collaboration, it is N
single-agent calls with a mean at the end. Both councils here run a five-round
protocol — decompose, blind independent pass, directed cross-examination,
rebuttal with recorded belief revision, adversarial attack on the consensus —
through one shared engine, and emit metrics that make the claim falsifiable.

The system panel in the bottom right of `/` shows what is live: provider,
models, agent count, and the protocol itself.

## Scripts

```bash
npm run dev
npm test            # vitest
npm run typecheck
npm run build
npm run personas    # regenerate the 300-persona library (deterministic)
```

## Demo mode

```bash
RECORD_FIXTURES=1 npm run dev   # do one full run for real
DEMO_MODE=1 npm run dev         # replay it, network off
```

Replay is keyed on a hash of each exact prompt, so a replayed run is the same
deliberation rather than an approximation. An unrecorded prompt degrades to the
demo provider instead of throwing in front of an audience.

`fixtures/llm.json` currently holds a run recorded from the demo provider, which
proves the path works. **Re-record it against a real model before presenting.**
