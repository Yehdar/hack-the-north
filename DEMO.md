# Demo script — three minutes

The run order matters more than the feature list. Judges see a hundred demos;
what they remember is a moment where the product told someone something they did
not already know. That moment is the reveal at 1:10. Everything before it exists
to set it up, and everything after it exists to cash it in.

**Before you start:** fresh browser profile, `DEMO_MODE=1`, network off to prove
it. Clear `localStorage` so intake appears. Have the system panel collapsed.
The screen narrates itself (the line above the button says what is happening),
so you can talk over it rather than explain it.

---

## 0:00 — the problem, in one sentence

> "Founders build a solution and then go looking for a problem to attach it to.
> They usually attach the wrong one, and they find out eighteen months later
> from an investor."

Do not explain the architecture yet. Nobody has earned it.

## 0:15 — submit a product

Type the idea live. Use something the room understands — a developer tool, not
a niche B2B workflow.

> "This is what the founder thinks they built."

## 0:30 — the split

Four candidate problems fan out.

> "Before asking anyone anything, we split the solution into the distinct
> problems it could be solving. The first one is the founder's own framing.
> Watch what happens to it."

**Plant the flag here.** The audience now has something to be wrong about, which
is what makes the reveal land.

## 0:45 — deploy and listen

The globe turns to Waterloo and arcs fly out to twenty cities; every answer
ripples on the map; reactions stream top-right.

> "Your idea just left Hack the North for twenty cities. Three hundred simulated professionals, each with seven attributes —
> including whether they can actually sign a cheque, and how much friction they
> tolerate before they complain. A hundred and twenty are selected for this
> idea, and every selection is explainable."

Click one person on the globe mid-run — each is a small figure wearing their
answer, and they wave hello. Show the persona: their attributes, what they
said, and **why they were selected**.

> "Retrieval you cannot interrogate is retrieval you have no reason to trust."

## 1:10 — THE REVEAL *(the whole demo)*

> "Here is the thing we do that a sentiment survey cannot.
>
> We did not ask them whether they liked it. We asked which of those problems
> they actually have.
>
> **You pitched this one. The market has that one — and they would pay for it.**"

Let it sit. Do not talk over it.

Point at the vote counts: incidence, severity, and pay rate side by side.

> "Ranked by weight of feeling, not headcount. Twelve people who hurt badly and
> would pay beat thirty who are mildly inconvenienced."

## 1:30 — rewrite and ask again *(iteration — nobody demos it)*

Press **Rewrite around it · ask again**, accept the draft, run it.

> "Same product, pitched at their problem. Same hundred and twenty people, same
> four problems — the only thing that changed is how the founder said it."

The card comes back **aligned**, with what moved: mismatched → aligned,
sentiment up, full attention up. The dashboard keeps both runs side by side.

*Short on time? Skip this beat and press "Take theirs · convene" instead.*

## 1:50 — the council *(the multi-agent story)*

Press **Convene the San Francisco council**. The globe turns to the city; five
agents deliberate, drawn live in the sidebar.

> "Now five agents argue about whether that problem is worth solving in that
> city. And they are not voting in parallel — they read each other."

Point at the graph: coral lines are **directed challenges**, green is a
**concession**, the ring is who changed their mind:

> "The Market Analyst sized the market on people who reported the problem. The
> Customer Proxy pointed out those are not the people who pay. The analyst
> conceded and moved his own position.
>
> That is a conclusion no single agent walked in with. An architecture that
> averages independent opinions cannot produce it at all."

This is the sentence that wins a multi-agent prize. Say it slowly.

## 2:15 — the score, and the gate

> "That produces a validation score. Below sixty we tell the founder to fix it
> first — and let them pitch anyway, because founders do."

Press **Take it to the committee**. Part one closes on a printed card — what
the market said, the city, the score — then the doors close and open on the
committee room at the firm's own headquarters.

## 2:25 — the committee

Convene them. The same graph draws the partners arguing. Then **Now defend
it**: pitch one sentence out loud; a partner interrupts.

> "Same deliberation engine, different roster — you can see it's the same
> drawing. The partners read the Part 1 findings, so weak research makes them
> measurably harsher. Anything you dodge is logged and costs you at the vote."

## 2:45 — the report, and the close

Open the report. **Move a weight slider.** The verdict changes live.

> "Every agent's weight is yours to argue with, and re-weighting never calls a
> model. And the dissent is never averaged away — one partner certain this
> fails is the most useful thing in here."

Close on the system panel:

> "No API keys were used in that run. That was the offline replay."

---

## Questions you will get, and the honest answers

**"Is this just hallucinating?"**
Every agent claim cites a field. Uncited claims are marked speculative and they
lower the evidence component of the score directly — a score built on
speculation says so.

**"How is this different from asking one model five times?"**
Show the transcript. Directed challenges, recorded belief revision, and stance
variance per round. If the agents ever collapse into one voice the test suite
fails the build — that is the failure mode we instrumented against first.

**"Where does the persona data come from?"**
Procedurally generated and committed, deterministic from a seed, so two runs of
the same idea are comparable. It is a simulation and we call it one. The
psychographic distributions are the honest weak point, and swapping in real
panel data is a data problem, not an architecture change.

**"Why these models?"**
A deep model for reasoning under adversarial pressure, a fast cheap one for the
moderator that runs on every speech turn. Roughly $0.27 per full deliberation.
Open the system panel.

**"What breaks?"**
Nothing in the critical path needs the network. Voice degrades ElevenLabs →
browser speech → text, and the LLM layer degrades to recorded fixtures. Say this
before they ask; it reads as engineering judgement rather than luck.
