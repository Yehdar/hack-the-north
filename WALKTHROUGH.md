# The walkthrough

What each step is for, why it exists, and where the current build gets in its
own way. Written after a founder walked the flow and said it felt confusing.
This is a proposal to argue with, not a spec that has been agreed.

---

## What this product is for

A founder describes what they built. Every product carries a silent claim:

> Somebody has a problem this solves, and feels it badly enough to pay.

That claim is almost never tested, because the obvious test is useless.
"Do you like my product" gets a yes from everyone and teaches nothing. The
useful question is the one nobody asks: **which problem do you actually have,
and would you pay to fix it.**

So the product does two things, in this order:

1. **Test the claim against a market.** 326 simulated people, chosen for
   relevance, each with attributes that decide how they react. They are asked
   which problem they have, not whether the idea is nice.
2. **Make the founder defend the strongest surviving version of it**, out loud,
   to people whose job is to find the flaw.

The output that matters is not a score. It is one of four sentences:

- Keep going, this is real.
- Right problem, wrong buyer. Sell to someone else.
- Wrong problem. The pain is over here instead.
- Nobody has this. Stop, or find out why you are early.

Everything on screen should be working towards one of those four.

---

## Why the current build feels wrong

This is the founder's own example, and every line of it is worth taking
seriously:

```
You walked in with
  Teams have no software that reconciles invoices across three ERPs.

You are taking in
  The team fixes the easy parts first because those are obvious. The parts
  most likely to break get left alone, and nobody knows which those are
  until something goes down.

Asked 120 · Full attention 18 · Have this problem 31 · Of them would pay 68%
Strongest city Berlin · fit 78
Problem validation 47/100 · below 60. They will be told
```

Five separate things are wrong here.

**1. The problem it handed back is from the wrong industry.** The pitch is about
invoices and ERPs. The answer is about code that breaks. This is a bug, not a
design choice: the pitch reader scored the word "software" as the market, and
"software" beat "invoices". "Software", "app", "platform" and "tool" are shapes
a product takes, not markets it sits in. Fixed separately, and it has to be
fixed first, because nothing else on the screen can be believed while this is
wrong.

**2. Four candidate problems is the machine showing its workings.** The founder
made one claim. The system invents four so the crowd has something to choose
between, which is a reasonable internal mechanism and a strange thing to put in
front of a person. They did not write four problems and should not have to read
four.

**3. "You walked in with X, you are taking in Y" is a trick, not a service.**
It tells the founder they were wrong and stops. Even when Y is correct, the
honest next question is "so what do I do", and the screen does not answer it.

**4. Six numbers, no sentence.** Asked 120, full attention 18, have it 31, 68%
would pay, Berlin fit 78, validation 47 out of 100. Every one of those is
evidence for a conclusion that is never stated. A founder cannot act on 47/100.
They can act on "the people who feel this cannot buy it, go and find a
controller".

**5. "They will be told" is inside language.** It means the committee will be
told you pitched below the bar. Nobody outside this codebase can parse that.

The deeper pattern: **the app performs a reveal when it should deliver an
assessment.** And the assessment already exists. `src/lib/advice.ts` writes
exactly the right kind of line ("Your fans are not your buyers", with the number
behind it and what to do on Monday). It is only rendered on the report, at the
very end, after the committee. The analysis is in the building. It is in the
wrong room.

---

## The walkthrough, step by step

For each step: what the founder sees, why it exists, the question it has to
answer, and what should change.

### 1. Your idea

**Sees:** one box. "What have you built?" Three examples to borrow.

**For:** capturing the claim in the founder's own words, before anyone
interprets it. Those words are quoted back later, so the founder can always
tell what was tested.

**Answers:** nothing yet. It collects.

**Change:** none. This step works.

### 2. The bet

**Sees:** one sentence. The problem their product implies, named plainly, with
who it belongs to.

> Finance teams lose days at month end because three ERPs disagree and
> somebody reconciles it by hand.
> Felt by: the person who owns the close.

**For:** making the silent claim explicit before it is tested, so the test is
fair and the founder can object ("that is not my problem, it is this"). It is
the hypothesis, stated once.

**Answers:** what exactly are we about to test.

**Today:** four candidate problems in a list, which is the internal mechanism on
display.

**Change:** show one. Keep the rival framings internal, because the crowd has to
be able to choose something else. That choice is what later becomes pivot
advice, and it is worth keeping. Let the founder edit the sentence if it is
wrong. An editable hypothesis is a feature: it is the founder's bet, not ours.

### 3. Who we asked

**Sees:** the globe filling with people, in cities, with a line about who they
are and why they were picked.

**For:** credibility. A verdict from a crowd is worthless if you cannot see who
the crowd was. Clicking one person and reading why they were selected is the
single most convincing thing in the app.

**Answers:** why should I believe this sample.

**Today:** works, and is the best part of the demo.

**Change:** keep. Say the selection rule in one line ("120 people whose work
touches invoices, in 20 cities, including 30% who would not obviously care").

### 4. What they said

**Sees:** answers landing person by person, the colour of the crowd changing,
one voice at a time in the feed.

**For:** evidence gathering you can watch. It earns the conclusion that follows.

**Answers:** what did real, specific people say.

**Today:** works. The pace is good.

**Change:** keep. Consider letting the founder stop early once the pattern is
obvious, which they can already do with Skip.

### 5. What it means

This is the screen the whole product exists to produce, and today it is the
weakest one.

**Sees:** a verdict on the bet, in words, with the evidence under each line and
one thing to do next.

```
THE BET YOU MADE
  Finance teams lose days at month end because three ERPs disagree
  and someone reconciles it by hand.

IT IS REAL
  31 of the 120 people we asked have it. 68% of those would pay.
  It costs them days, every month, and it is worst at quarter end.

YOU ARE SELLING TO THE WRONG PERSON
  Of the 31 who have it, 9 control a budget. The people who feel it
  are analysts. The people who sign are controllers, and not one
  controller we asked has this on their list.

WHAT THEY USE TODAY
  Spreadsheets and a week of overtime. That is your competitor.
  Not another product.

DO THIS NEXT
  Ask one controller at a 200 person company what the close costs
  them. If they cannot name a number, this is a tool, not a company.
```

**For:** turning evidence into a decision. This is the product.

**Answers:** is the bet good, and what do I do on Monday.

**Today:** "you pitched X, they have Y", six numbers, and a 47/100. The advice
that should be here is rendered at the end of the report instead.

**Change:** move `assess()` from the report to here. Keep the numbers, but
always under a sentence that says what they mean. Four outcomes, not one
template:

- **Real and buyable.** Keep going. Name the buyer and the next conversation.
- **Real, wrong buyer.** The gap between who feels it and who pays, with names.
- **Wrong problem.** "The strongest pain we found was X, felt by Y, and 71%
  would pay. If you want the market that exists, it is that one." That is the
  pivot, phrased as a choice rather than a correction.
- **Nobody has it.** Not a failure state and not a blank screen. Either the
  market already solved it (say what they use), or the founder is early (say
  what would have to change), or the idea is a preference, not a problem.

The blank screen the founder saw is this last case falling through with nothing
to say. It is the most interesting outcome in the product and it currently
renders as an empty panel.

### 6. Where it is strongest, and why

**Sees:** cities ranked, then five analysts arguing about the top one: market
size, whether it is buildable there, the buyer's view, regulation, capital.
They challenge each other by name and some change their minds.

**For:** two things at once. For the founder, the reasons behind the ranking.
For a judge watching the demo, this is the multi-agent system doing something no
single model call could: disagreeing with itself and recording who moved.

**Answers:** where should I start, and why there.

**Today:** good, and the recent work put it front and centre, which was right.

**Change:** keep. It should be clear that the council argues about **the
problem**, not the product, because that is what makes its conclusion different
from the committee's.

### 7. Validated or not

**Sees:** one sentence, then the parts that made it.

> Not validated yet. The problem is real but the people who feel it cannot
> buy, and nothing here is evidence anyone has paid.

**For:** an honest gate before the founder spends another month building.

**Answers:** is this ready to pitch.

**Today:** "47/100, below 60, they will be told". A grade with no explanation,
and a number that lands near 60 for almost every idea, which makes it feel
decorative.

**Change:** lead with the sentence and keep the number as supporting detail. Say
plainly what "below the bar" costs: the committee will be told this problem is
unvalidated, and they will press on it. Make the score harsher and more spread
out, or it is not worth showing at all.

### 8. The committee

**Sees:** partners at a named firm who have read the file, arguing before the
founder speaks. Then the founder pitches by voice and gets interrupted.

**For:** the pressure test. The founder finds out which questions they cannot
answer, which is worth more than the verdict.

**Answers:** does this survive contact with people whose job is to say no.

**Today:** works, and the minutes make it feel like a real meeting.

**Change:** keep. The verdict matters less than the list of questions that went
unanswered. Lead with those.

### 9. What to do

**Sees:** the report and the minutes. What the room concluded, what to fix, in
what order.

**For:** the thing the founder takes away and acts on.

**Answers:** what now.

**Change:** since the assessment moves to step 5, the report becomes the record
of the whole run rather than the first time the founder hears the analysis.

---

## What to cut

- **The four candidate problem cards.** One bet, stated once, editable.
- **"The reveal" as its own step.** It becomes one of four outcomes in step 5.
- **The score as a headline.** A sentence, with the number underneath.
- **Repeated numbers.** The same crowd counts currently appear on the reveal,
  the closing card and the report. Say each number once, where it is being used
  to make a point.
- **Insider phrasing.** "They will be told", "fit 78", "full attention 18".

That takes the rail from eight steps to six: your idea, who we asked, what they
said, what it means, the committee, what to do. The council lives inside "what
it means" as the reason behind the ranking.

## What stays

The crowd and the reason each person was picked. The council arguing and
changing its mind. The committee, the interruptions, the minutes. The globe.
These are the parts that make the claim credible and the demo watchable.

---

## Open decisions

1. **Rival framings: hidden or gone?** Keeping two or three alternatives
   internally is what lets the crowd say "my problem is a different one", which
   is the only way to give real pivot advice. The alternative is to ask only
   about the single bet, which is simpler and honest but can only ever answer
   yes or no.
2. **Does the score survive?** Either it becomes harsh and meaningful, or it
   goes and the words carry the verdict.
3. **Can the founder edit the bet?** It makes the test fair and adds a screen.

---

## The bug behind the example

Independent of any of the above: the pitch reader treats "software" as a
market. It is not, and neither are "app", "platform", "tool" or "system". Those
words describe the shape of a thing. The market is in what it acts on:
invoices, ERPs, reconciliation. Until that is fixed, a finance product gets a
developer tools problem handed back to it, and none of the rest of the
walkthrough can be trusted by the person reading it.
