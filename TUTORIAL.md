# Tutorial — what every part means

Written to be read in order, once. By the end you should be able to drive the
app and explain any screen to someone standing behind you.

---

## The idea in one paragraph

A founder builds a solution, then goes looking for a problem to attach it to.
They usually attach the wrong one and find out much later, from an investor.
**Part 1** asks a simulated market which problem they actually have. **Part 2**
makes you defend that problem to a simulated investment committee. The whole
product exists to make one sentence possible: *you pitched this, they have
that.*

---

## Running it

```bash
npm install
npm run dev
```

http://localhost:3000. No API keys required — with none set, a demo provider
computes every reaction from each persona's real attributes, so the machinery
is genuine even when the words are synthetic.

The bar at the bottom always tells you the step number and what to do. If you
are lost, read that line.

---

## Part 1 — the market

### Step 1 · The product

Type what you built, in your own words. Not the problem — the *thing*.

> "An AI tool that plugs into your repo and writes unit tests for untested code."

### Step 2 · Problem split

The app lists four or five distinct problems this solution could be solving.

**The first one is always your own framing** — read off your description
uncritically. The others are genuinely different problems the same tool would
also serve. Keep an eye on the first one; the whole demo turns on what happens
to it.

### Step 3 · Deploy

120 people are chosen from a library of 326 across 20 cities, and they appear
on the globe.

They are not chosen at random, and they are not all the best matches either.
70% are the closest fits — right industry, hold a budget, feel friction. The
other 30% are deliberately drawn from people who scored *lower*, so the room
contains sceptics and people with no buying power. Without that slice the
result is a fan club, which is a pleasant and useless thing to show a founder.

**Click any dot.** You get that person, their attributes, what they said, and
*why they were selected*. Retrieval you cannot interrogate is retrieval you
have no reason to trust.

Each person carries seven traits scored 1–10:

| Trait | High means |
|---|---|
| techAdoption | tries new tools early |
| riskTolerance | will pilot something unproven |
| priceSensitivity | balks at cost regardless of value |
| influenceScore | their opinion moves others |
| brandLoyalty | prefers the incumbent |
| **budgetAuthority** | **can actually sign — not just advocate** |
| **painTolerance** | **absorbs friction quietly and rarely complains** |

The last two are the ones that matter most and the ones most tools omit.
Budget authority separates someone who loves it from someone who can buy it.
Pain tolerance separates a real problem from a mild annoyance.

### Step 4 · Listen

Everyone answers. The globe recolours — **cold slate = indifferent, warm coral
= engaged** — and the sidebar fills with what they actually said.

The critical detail: they are **not** asked "do you like this?" They are asked
**"which of these problems do you actually have?"** A sentiment average cannot
produce a finding. A vote on *which problem* can.

### Step 5 · The reveal

The one screen that matters.

> **The one you pitched** — 28 people · 29% of them would pay · hurts mildly
> **The one they have** — 57 people · 86% of them would pay · hurts badly

Problems are ranked by **weight of feeling, not headcount**: twelve people who
hurt badly and would pay beat thirty who are mildly inconvenienced.

Two things you can do here:

- **Use their problem** — carry it forward into the council and the committee.
- **Re-pitch it their way, ask again** — the app rewrites your description
  around *their* problem and re-runs the same 120 people against the same
  problems. Only the pitch changed. You then see exactly what moved.

That second button is the iteration loop, and almost nothing demos it.

### Step 6 · Hub council

Pick a city. Five agents argue about whether the problem is worth solving
*there*, plus a Contrarian who attacks whatever they agree on.

| Agent | Cares about |
|---|---|
| Market Analyst | is the market here real and big enough |
| Local Founder | can it be built and sold here |
| Customer Proxy | would the buyer here actually pay |
| Regulatory & Ops | regulation, procurement, cost of operating |
| Capital & Talent | local money, and people who have solved this |
| Contrarian | the strongest case against whatever the room concluded |

They do not vote in parallel. They run five rounds:

1. **Decompose** — a chair splits the decision into questions and assigns each
   to whoever owns that lane.
2. **Independent** — each answers blind. Seeing others first causes anchoring.
3. **Cross-examine** — each may challenge *specific* colleagues by name.
4. **Rebut** — challenged agents answer, and may change their stance.
5. **Adversarial** — the Contrarian attacks the consensus.

Watch for a **concession**: an agent whose stance moves because a colleague
argued them out of it. That is a conclusion no single agent walked in with, and
it is the thing an architecture that averages opinions cannot produce.

### Step 7 · Validation

A score out of 100, from four parts:

| Component | Weight | Means |
|---|---|---|
| Problem severity | 30% | how badly the market feels it, discounted by whether they'd pay |
| Market gap | 30% | how much room the council thinks is left |
| Hub fit | 25% | the council's weighted verdict on this city |
| Evidence strength | 15% | share of agent claims actually citing something |

Evidence strength is the one that keeps the rest honest — a score built on
unsupported claims says so.

**Below 60 you are warned and can still pitch.** Founders do. The committee is
told you pitched anyway, which makes them harsher.

---

## Part 2 — the committee

### Choosing the room

25 real firms across 17 cities. The firm changes the thesis the partners argue
from, so it changes the verdict rather than relabelling it.

Only **Bessemer** has a populated anti-portfolio, because it is the only firm in
venture that publishes what it passed on. For everyone else the Skeptic argues
thesis mismatch instead — inventing specific passes for a named firm would be
putting false claims in its mouth.

### The three seats

| Seat | Weight | Job |
|---|---|---|
| General Partner | 50% | owns the decision — market size, thesis fit, why now |
| Principal | 30% | diligence — unit economics, competition, go-to-market |
| Anti-Portfolio Skeptic | 20% | find the kill shot |

Plus a Devil's Advocate (10%) who must dissent, and a Chair who never votes and
writes the report.

They read your Part 1 findings before you speak. **Weak research makes them
measurably harsher**, because the venture file tells them your score and whether
you cleared the bar.

### Pitching

Press and hold to talk, or type. After each thing you say, a moderator decides
whether a partner should interrupt — and usually decides no, because a partner
who speaks after every sentence is heckling rather than diligence.

Everything they challenge lands in the **objection tracker** as open, answered
or dodged. Anything still unanswered at the vote costs you 0.08 of the score
each.

### The verdict

```
score = Σ(weight × confidence × stance) / Σ(weight × confidence)
        − 0.08 × unanswered objections

≥ 0.35  invest        −0.10 … 0.35  conditional        < −0.10  pass
```

Confidence gates weight: a 50% partner who admits low confidence does not
steamroll a 20% partner who is certain. Seat authority and being right are
different things.

**Dissent is never averaged away.** A lone hard no is promoted to the top of the
report — it is the single most useful output in here.

### The report

Every agent, its weight, its stance, its one-line position — with a **slider**.
Move any weight and the verdict recomputes instantly, because it is a pure
function over cached votes. It never calls a model. That is the point: you get
to argue with how the conclusion was reached, not just read it.

---

## Voice

Three tiers, and it degrades rather than failing:

1. **ElevenLabs** — set `ELEVENLABS_API_KEY` in `.env.local`
2. **Browser speech** — no key needed, works offline, sounds robotic
3. **Text** — always available

The tier is decided when the page loads, not on failure, because browser speech
recognition needs the live microphone and cannot be fallen back to after you
have already recorded.

**A scoped key is fine.** A key with only `text_to_speech` permission works —
the app will say it could not verify the voice IDs and carry on speaking.

---

## Demo mode

```bash
RECORD_FIXTURES=1 npm run dev   # do one full run for real
DEMO_MODE=1 npm run dev         # replay it with the network off
```

Replay is keyed on a hash of each exact prompt, so it is the same deliberation
rather than an approximation. Venue wifi failing during a three-minute demo is
not hypothetical.

---

## How to explain it in thirty seconds

> "Founders attach the wrong problem to their solution and find out from an
> investor eighteen months later.
>
> We ask three hundred simulated professionals not whether they like your
> product, but which of several problems they actually have. Then five agents
> argue about whether that problem is worth solving in a specific city — and
> they cross-examine each other, so the room reaches conclusions no single agent
> started with.
>
> Then you defend it, out loud, to a real firm's investment committee."

The full three-minute script is in `DEMO.md`.
