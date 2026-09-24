# Vision, the Devpost writeup

Copy each section into the matching Devpost field. The shot list at the bottom
is what to record before submitting.

**Tagline (Devpost limits this to 200 characters)**

> Founders validate the wrong problem. Vision asks a simulated market which
> problem they actually have, then makes you defend it to an investment
> committee that argues with itself.

---

## Inspiration

Every founder we know has the same story. They built something for six months,
showed it to a customer, and found out the customer had a different problem. Not
a smaller version of the one they solved. A different one.

So we looked at what the existing validation tools actually ask, and they all
ask the same thing. Do you like this. Would you use this. Rate this one to five.
Then they average the answers and hand back a number.

That question cannot find the failure we were trying to prevent. Someone can
genuinely like your product and still not have the problem it solves, and no
amount of averaging their enthusiasm will tell you which of those two things you
are looking at. The number goes up either way.

The second half came from watching a friend get turned down by an investment
committee. He did not lose on the idea. He lost because one partner asked a
question he had not thought about, and he had no answer, and that single
unanswered question was the whole meeting. He never got to hear the argument
that happened after he left the room. That argument was the useful part.

---

## What it does

Vision runs a founder through the two conversations that decide whether a
company exists, in the order the answers matter in.

**Part one, the market.** You describe what you built. Vision splits it into
four or five candidate problems it could be solving, one of which is your own
framing. It then selects 120 people out of a library of 326 simulated
professionals across 20 world hubs, deliberately including 30% who are a poor
fit, and deploys them onto a 3D globe. Each person is asked which of these
problems they actually have, not whether they like your product. Their reactions
stream back in as they land.

The reveal sets the market's problem against yours, ranked by weight of feeling
rather than headcount, because ten people who cannot sleep over something matter
more than forty who find it mildly annoying. If those two problems are different,
that is the single most valuable thing the app will ever tell you, and you can
rewrite your pitch around the market's problem and ask the same people again.

A council of five agents plus a Contrarian then argues about whether the problem
is worth solving in one specific city, and the run produces a Problem Validation
Score out of 100 built from severity, the gap in current solutions, hub fit and
evidence strength.

**Part two, the committee.** You choose one of 25 real firms, from Sand Hill
Road to Lagos, and three of its partner agents read your file and deliberate for
five rounds before you say a single word. You watch it happen in a 3D boardroom,
with the argument drawn live as a graph of who challenged whom.

Then you pitch out loud. They interrupt. An objection tracker fills with what
you dodged. You can pull any partner aside for a private word, and the room
stops and waits while you do. At the end they vote, weighted by seat, and a lone
hard no from the Skeptic is promoted to the top of the report rather than
averaged into the middle.

You leave with a diligence report and a set of minutes written by the chair. Who
was in the room, where each partner stood and whether they moved, where they
disagreed with each other, which challenges nobody ever answered, and what to do
on Monday.

---

## How we built it

Next.js 16 and React 19 on the front, TypeScript throughout, Three.js for both
the globe and the boardroom, Tailwind v4, Zustand for shared state, and Server
Sent Events for every long-running thing, because the counting up is the beat.
A single response that resolves after forty seconds is the same data and a far
worse product.

The interesting part is the agent protocol, and the reason it is interesting is
what we refused to build.

The obvious way to do "many AI agents give opinions" is a fan-out. Same prompt,
different persona header, run them in parallel, average the scores, call it
consensus. Almost every multi-agent demo is built this way, and it has three
specific failures. No agent learns anything, so the system can never reach a
conclusion no individual member already held, which is the entire reason to
convene a committee in the first place. Averaging destroys the signal, so one
expert who is certain the thing is fatally flawed is cancelled out by four who
are mildly positive. And the personas collapse, because one model prompted N
ways regresses to one opinion wearing N costumes, and a fan-out has no mechanism
that would even notice.

So we built the argument instead. Five rounds, through one shared engine.

1. **Decompose.** A non-voting chair breaks the decision into five to seven
   concrete diligence questions and assigns each to the agent whose declared
   lane owns it. The partners are not all answering "what do you think". The
   GP is answering whether the market returns the fund, the Principal is
   answering what CAC payback looks like, the Skeptic is answering what this
   rhymes with that they passed on.
2. **Independent, and blind.** They answer only their own questions, in
   parallel, unable to see each other. Blindness is deliberate. Agents that read
   each other before forming a position anchor, and anchoring is exactly how N
   agents quietly become one agent.
3. **Cross-examine.** Now they see everything. Each may issue at most two
   challenges, and every challenge must name its recipient, because a challenge
   addressed to nobody produces generic scepticism. They are explicitly told to
   return no challenges rather than manufacture disagreement, so the count means
   something.
4. **Rebut.** Challenged agents answer and may revise their stance. Conceding
   when a colleague is right is doing the job properly, but the prompt is clear
   that convictions are not up for negotiation just because someone pushed. We
   record conceding separately from the numeric stance change so we can tell
   persuaded apart from drifted.
5. **Adversarial.** The Devil's Advocate runs last, sees where the room landed,
   and attacks that. Convergence is suspicious. A committee that agrees quickly
   has usually found the obvious answer, which everyone else has also found.

Everything agents say to each other is a typed, threaded message rather than a
string appended to a growing prompt, which is what makes the deliberation a
graph you can render, replay and test.

The protocol is generic over a roster, so Part one's hub council and Part two's
investment committee are the same engine with different people in the chairs.
That is the argument that this is infrastructure rather than one bespoke prompt
chain.

Synthesis is confidence-weighted, not averaged. A fifty percent weight GP who
admits low confidence does not steamroll a twenty percent weight Skeptic who is
certain, because seat authority and epistemic authority are different things.
All of the scoring is pure functions with no model calls, so re-reading a report
recomputes instantly and works offline.

---

## Challenges we ran into

**Making the claim falsifiable.** Saying "our agents collaborate" is easy and
worth nothing. We spent real time building metrics whose only purpose is to let
someone prove us wrong. Stance variance after each round, challenge counts,
concession counts, per-agent belief revision from round one to final, and a
signed convergence figure where a negative value means deliberation surfaced a
disagreement that independent sampling had hidden. Then we put a stance-variance
floor in the test suite, so if the agents ever homogenize into one voice the
build fails. We found that out at hour seven instead of on stage.

**A crowd with a sentiment spread of exactly zero.** We did a pass to strip em
dashes out of the copy, and it rewrote the persona line in one prompt from a
field list into prose. The demo provider parses attributes out of that exact
shape, so every persona silently fell through to a neutral default and the
entire market came back agreeing perfectly. Nothing threw. Nothing failed. The
output was just quietly meaningless. There is now a test that asserts the spread.

**The boardroom read as unrendered.** Our first partners were armless, faceless
capsules, and everyone who looked at it said the same thing, that the figures
were not loading. They were loading fine. A torso with a head on it is a
mannequin. Arms with hands resting on the table fixed most of it, and real
shadows fixed the rest, because without a shadow underneath them the figures
hover, and hovering is most of what "not rendered" looks like. We also stopped
seating them in a full ring, which had put two partners with their backs to you
for the entire meeting.

**Animation is unverifiable from an automated browser.** `requestAnimationFrame`
is throttled to zero in a backgrounded tab, so a frame rate probe times out
outright. Screenshots still work because the render is forced, which means the
static scene is checkable and nothing driven by the render loop is. We burned
three attempts on camera moves that returned empty frames before working out
why, and after that we checked motion in a real foreground browser like a
person.

**Audio that a browser silently refuses.** Browsers will not play anything that
was not started by a user gesture, and they do not tell you. Every audio path
now unlocks inside the click that leads to it.

---

## Accomplishments that we're proud of

The protocol produces conclusions nobody walked in with. Watching a partner
concede in round three and move their stance is the moment the whole idea stops
being a claim, and it is a thing a fan-out architecture structurally cannot do.

Two persona traits most tools leave out are doing real work. `budgetAuthority`
separates someone who loves it from someone who can sign, and `painTolerance`
separates a real problem from a mild annoyance. Together they produce the most
useful warning the app gives, which is that your enthusiasts cannot buy.

Everything degrades. No key falls to a provider that computes reactions from
each persona's real attributes rather than canned text. A dead agent degrades to
one quiet seat instead of an empty room. No ElevenLabs key falls to browser
speech and then to text. No network at all replays recorded fixtures. Nothing in
the critical path needs the internet, which is why the deployed link still works
for whoever opens it next year.

177 tests, a clean build, and three of those tests exist purely to stop us
fooling ourselves.

---

## What we learned

The question you ask determines the ceiling on what you can learn, and no amount
of engineering downstream raises it. We could have built a beautiful sentiment
pipeline and it still could not have surfaced a problem mismatch, because it
never asked.

Averaging is where signal goes to die. Almost every "consensus" feature is a
mean, and a mean is specifically designed to destroy the outlier, which in a
real investment committee is the voice that stops the deal.

Build the honesty check before the feature, not after. The stance-variance floor
caught a genuine personas-collapse regression the same afternoon we wrote it.

A failure that does not throw is far more expensive than one that does. The
zero-spread crowd was a working app producing meaningless output, and that is
much harder to notice than a stack trace.

---

## What's next for Vision

**A convergence loop.** Rebuttal is one round right now. Real committees iterate
until they stop moving, so repeating rounds two and three until the change in
variance drops below a threshold is the natural upgrade. We deferred it on
purpose because it multiplies both cost and latency.

**Coalition detection.** Agents that consistently agree with each other should
be identified and down-weighted as correlated rather than counted as independent
evidence.

**Grading challenges, not just counting them.** We know how many challenges were
issued and which went unanswered. We do not yet know whether any of them were
any good, so a sharp objection and a lazy one currently count the same.

**Memory across runs.** Every deliberation starts cold. Partners who remembered
your last pitch, and could ask why you have not fixed the thing they flagged,
would be a much harder room.

**Real market data behind the personas.** The library is generated
deterministically from hub definitions today. Grounding the attributes in actual
labour and spending data would move this from a rehearsal tool toward something
you could act on directly.

---

## Built With

`next.js` `react` `typescript` `three.js` `tailwindcss` `zustand` `framer-motion`
`google-gemini` `openai` `anthropic-claude` `elevenlabs` `web-speech-api`
`server-sent-events` `vitest` `vercel`

---

## Try it out

- **Live app**, no sign up and no API key needed — https://vision-phi-lovat.vercel.app
- **GitHub repository** — https://github.com/jaineelmodi11/vision
- **The architecture writeup**, for the protocol in full —
  [ARCHITECTURE.md](ARCHITECTURE.md)
- **Health check**, which probes underneath the fallback rather than reporting a
  degraded run as healthy — https://vision-phi-lovat.vercel.app/api/system/check

The deployment runs on Gemini's free tier, so the link costs nothing to keep up
and nothing for a judge to use.

---

# Shot list

Record these before submitting. The video is capped at three minutes on Devpost
and the first fifteen seconds decide whether a judge watches the rest.

## Video, in order

| Time | Shot | Say |
|---|---|---|
| 0:00 | Type a real product into the box on `/` | "Every founder validates the wrong problem. Here is one." |
| 0:15 | The problem split fanning out | "It is not one problem. It is five, and only one of them is yours." |
| 0:25 | 120 people deploying onto the globe | "120 people across 20 cities. 30% of them a deliberately bad fit." |
| 0:40 | Reactions streaming in, counter climbing | "They are not asked whether they like it. They are asked which of these they have." |
| 0:55 | **The reveal, held on screen** | "You pitched this. They have that." This is the money shot, give it room |
| 1:10 | The hub council arguing | "Five agents argue about whether it is worth solving in one city." |
| 1:20 | Walking through the door into the boardroom | Let the transition play, no narration |
| 1:30 | Deliberation running, graph drawing itself | "Three partners, five rounds, before you say a word." |
| 1:45 | **A partner conceding and the stance moving** | "That is a conclusion nobody walked in with. Averaging five opinions cannot produce that." The strongest fifteen seconds in the video |
| 2:00 | Pitching by voice, a partner interrupting | "Now you defend it. They interrupt." |
| 2:15 | Pulling one partner aside, the room pausing | "And you can take one of them aside." |
| 2:30 | The minutes, scrolled to "left unanswered" | "You leave with what nobody answered, which is the thing that actually loses the meeting." |
| 2:45 | The fan-out diagram against the five-round diagram | "Most multi-agent demos are this. We built this." |

## Screenshots, in gallery order

1. The reveal, yours against theirs. The one image that explains the product
2. The globe mid-deployment, people landing on cities
3. The boardroom with all five partners visible and the graph drawn
4. The deliberation graph on its own, who challenged whom
5. The minutes, showing where partners disagreed and what went unanswered
6. The fan-out versus five-round architecture comparison

## Before you submit

- Re-record `fixtures/llm.json` against a real model, otherwise replay mode
  plays back demo-provider output
- Check the live link in a private window, signed out, on a phone
- Confirm the OpenGraph card renders by pasting the link into a chat
