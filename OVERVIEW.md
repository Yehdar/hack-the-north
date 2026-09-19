# Vision — compact overview

One page. Everything else expands on this.

| Doc | For |
|---|---|
| `TUTORIAL.md` | what every screen means, in order |
| `DEMO.md` | the three-minute presentation script |
| `ARCHITECTURE.md` | the agent protocol and why it is built this way |
| `HANDOFF.md` | picking the codebase up cold |

---

## What it is

Founders attach the wrong problem to their solution and learn it from an
investor much later.

**Part 1** asks a simulated market of 326 professionals across 20 cities *which
problem they actually have* — not whether they like the product. **Part 2**
makes you defend that problem out loud to a simulated investment committee at
one of 25 real firms.

The product exists to make one sentence possible: **you pitched this, they have
that, and they would pay for it.**

---

## Run it

```bash
npm install && npm run dev        # http://localhost:3000
```

No API keys needed. Without them a demo provider computes every reaction from
each persona's real attributes — the machinery is genuine, the words are
synthetic.

```bash
npm test          # 66 tests
npm run build
npm run personas  # regenerate the persona library from hubs.json
```

---

## The eight steps

| # | Step | What happens |
|---|---|---|
| 1 | Product | You describe what you built |
| 2 | Problem split | 4–5 problems it could be solving; the first is your framing |
| 3 | Deploy | 120 of 326 people chosen — 70% best fit, **30% deliberate sceptics** |
| 4 | Listen | Each answers *which problem do you have*, not *do you like it* |
| 5 | **Reveal** | Yours vs theirs, ranked by weight of feeling not headcount |
| 6 | Hub council | 5 agents + a Contrarian argue about one city, over 5 rounds |
| 7 | Validation | Score /100: severity, gap, hub fit, evidence strength |
| 8 | Committee | 3 partner agents at a real firm; you pitch by voice |

---

## The three things that make it different

**1. The question.** Asking a crowd "do you like this?" and averaging produces
a number. Asking "which of these problems do you actually have?" produces a
finding a sentiment survey structurally cannot reach.

**2. The agents argue.** Running N agents in parallel and averaging is N
single-agent calls with a mean — no agent learns anything, so the system can
never conclude something no member already held. Both councils here run one
shared engine: decompose → blind pass → **directed** cross-examination →
rebuttal with recorded belief revision → adversarial attack. When an agent
concedes and moves its stance, that is a conclusion nobody walked in with.

**3. It is falsifiable.** Stance variance per round, challenge and concession
counts, per-agent belief revision. **If the agents ever collapse into one voice
the test suite fails the build.**

---

## Two persona traits most tools omit

- **budgetAuthority** — separates someone who loves it from someone who can sign
- **painTolerance** — separates a real problem from a mild annoyance

Both feed the validation score directly. They are also what produce the most
useful warning the app gives: *your enthusiasts cannot buy.*

---

## Numbers

| | |
|---|---|
| Personas | 326 across 20 cities, deterministic from a seed |
| Crowd per run | 120 (70% best fit, 30% contrast) |
| Agents | 11 deliberating — 6 hub council, 5 committee |
| Firms | 25 across 17 cities |
| Rounds per deliberation | 5 |
| Cost per full deliberation | ~$0.27 on a real model |
| Tests | 66 |

---

## Everything degrades

| Missing | Falls back to |
|---|---|
| LLM key | demo provider (attribute-driven, not canned) |
| ElevenLabs | browser speech → text |
| Network entirely | recorded fixtures (`DEMO_MODE=1`) |

Nothing in the critical path requires the network. A key scoped to
`text_to_speech` only is fine — the app says it could not verify voice IDs and
carries on speaking.

---

## Design rules

- Sentiment runs **cold slate → coral**, never red-to-green: market heat rather
  than pass/fail, and it survives colourblindness.
- **Coral is reserved** for the reveal, dissent and the live step.
- **Negative is crimson, not coral.** If "look here" and "this is bad" are the
  same colour, neither means anything.
- Findings print on **bone cards** — light paper inside a dark app. Chrome stays
  dark; conclusions get printed.

---

## Known gaps

- **No LLM key yet.** Everything works; the words are synthetic until one is
  set. This is the highest-value unblock.
- `fixtures/llm.json` holds a *demo-provider* run. Re-record against a real
  model before presenting, or you replay canned content on stage.
- Council agents do not speak aloud yet — only the committee does.
- The Chair routes and synthesises but never rules a challenge answered.
- Rebuttal is one round; a convergence loop is the natural upgrade.
