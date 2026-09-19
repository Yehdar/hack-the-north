import type { LLMProvider, LLMRequest } from "@/lib/llm";
import { MARKETS, marketProblems, readPitch, type Market, type Pitch } from "@/lib/providers/pitch";

// ============================================================================
// DEMO PROVIDER — realistic, differentiated, deterministic, and free.
//
// The plain mock returns "[mock]" for every field, which is fine for asserting
// shapes and useless for looking at. This one reads the founder's pitch — what
// it is, who it is for, which market — and writes every line from that, in the
// way people actually talk in a partner meeting, so the app can be run and
// demoed with no API key, no network, and no cost.
//
// It used to be one script written for one dev-tools pitch, and every idea got
// that argument: pitch a feeder for cats and the committee debated "coverage
// dashboards". It still cannot truly listen — only a model can — but it now
// argues about the idea on the table.
//
// It is also the stage insurance policy: if the venue wifi dies mid-demo,
// LLM_PROVIDER=demo produces a full deliberation that looks like the real one.
// ============================================================================

type Seat =
  | "gp" | "principal" | "skeptic" | "devil" | "chair"
  | "market" | "founder" | "customer" | "regulatory" | "capital" | "contrarian";

function whoAmI(system: string): Seat {
  // Investment committee
  if (system.includes("Devil's Advocate")) return "devil";
  if (system.includes("Skeptical Partner") || system.includes("Anti-Portfolio")) return "skeptic";
  if (system.includes("Principal")) return "principal";
  if (system.includes("Lead Partner") || system.includes("General Partner")) return "gp";
  // Hub council
  if (system.includes("Contrarian")) return "contrarian";
  if (system.includes("Market Analyst")) return "market";
  if (system.includes("Local Founder")) return "founder";
  if (system.includes("Customer Proxy")) return "customer";
  if (system.includes("Regulatory")) return "regulatory";
  if (system.includes("Capital & Talent")) return "capital";
  return "chair";
}

const HUB_SEATS = new Set(["market", "founder", "customer", "regulatory", "capital", "contrarian"]);

export class DemoProvider implements LLMProvider {
  readonly name = "demo";

  async complete(req: LLMRequest): Promise<string> {
    return JSON.stringify(await this.completeJSON(req));
  }

  async completeJSON<T>(req: LLMRequest): Promise<T> {
    // Deliberate pacing so streaming UI can be seen working rather than
    // resolving instantly and hiding the round structure.
    await delay(400 + Math.random() * 900);
    const seat = whoAmI(req.system);
    const hub = HUB_SEATS.has(seat);

    switch (req.schema?.name) {
      case "diligence_tasks":
        // The chair prompt names the room, so we can tell which council this is.
        return (req.system.includes("investment committee")
          ? committeeTasks(readDeal(req.user))
          : councilTasks(readCouncil(req.user))) as T;
      case "agent_verdict":
        return (hub
          ? shiftStance(councilVerdict(seat, readCouncil(req.user)), "stance", hubLean(seat, req.user))
          : committeeVerdict(seat, readDeal(req.user))) as T;
      case "challenges":
        return {
          challenges: hub ? councilChallenges(seat, readCouncil(req.user)) : committeeChallenges(seat, readDeal(req.user)),
        } as T;
      case "rebuttal":
        return (hub
          ? shiftStance(councilRebuttal(seat, readCouncil(req.user)), "revisedStance", hubLean(seat, req.user))
          : committeeRebuttal(seat, readDeal(req.user))) as T;
      case "problem_split":
        return demoProblems(req.user) as T;
      case "crowd_reactions":
        return demoReactions(req.user) as T;
      case "refined_pitch":
        return demoRefine(req.user) as T;
      case "persona_reply":
        return demoPersonaReply(req.system, req.user) as T;
      case "seat_pre_read":
        return preRead(seat, readDeal(req.user)) as T;
      case "moderator_decision": {
        // Speak on most turns, but stay silent on one in four so the room does
        // not read as heckling.
        const idx = turnCounter++;
        const silent = idx % 4 === 3;
        const who = MODERATOR_ROTATION[idx % MODERATOR_ROTATION.length];
        return {
          shouldRespond: !silent,
          seatId: silent ? "" : who,
          objectionType: who === "principal" ? "unit-economics" : who === "skeptic" ? "competitor" : "timing",
          trigger: silent ? "Nothing here needs pressing yet." : "The founder made a claim with nothing behind it.",
          resolutions: [],
        } as T;
      }
      case "seat_response":
        return seatResponse(seat, req.user) as T;
      default:
        return {} as T;
    }
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** One of a few ways to say it, fixed per idea — two pitches do not get the
 *  identical sentence, and one pitch always gets the same one. */
function oneOf<T>(key: string, options: T[]): T {
  return options[hash(key) % options.length];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round2 = (n: number) => Math.round(n * 100) / 100;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The first clause of a problem statement, for saying out loud. */
function gist(statement: string): string {
  const first = statement.split(/,\s*so\b|\s—\s|;\s/)[0].replace(/[.!]+$/, "").trim();
  return /^[A-Z][a-z]/.test(first) ? first.charAt(0).toLowerCase() + first.slice(1) : first;
}

/** "Working cat owners who already hold the budget for…" → "working cat owners".
 *  A bare "people" says nothing, so then the whole description is kept. */
function whoShort(who: string): string {
  const full = who.replace(/[.]+$/, "").trim();
  const short = full
    .split(/\s+(?:who|that|which|and the)\s+|\s+you pictured\b|,\s*/i)[0]
    .replace(/^the\s+/i, "")
    .trim()
    .toLowerCase();
  if (/^(?:people|everyone|anyone|users|customers)$/.test(short)) return lowerFirst(full);
  return short;
}

/** "the banks' own apps, which are already on everyone's phone" needs its
 *  clause closed before the sentence carries on after it. */
function clause(phrase: string): string {
  return /,\s*(?:which|who)\b/.test(phrase) ? `${phrase},` : phrase;
}

// =============================================================================
// THE INVESTMENT COMMITTEE
//
// A partner meeting, not a panel of scorecards: people who have read the memo
// saying what they think of this product, disagreeing by name, and some of
// them moving. Stances follow the evidence — the validation score and whether
// the research found a problem at all — so a strong file gets a warmer room.

type Deal = {
  pitch: Pitch;
  market: Market;
  problem: string | null;
  who: string | null;
  wtp: string | null;
  pvs: number | null;
  evidence: number | null;
  moved: boolean;
};

function readDeal(user: string): Deal {
  const solution =
    user.match(/THE FOUNDER'S SOLUTION, IN THEIR OWN WORDS:\s*\n([^\n]+)/)?.[1] ??
    user.match(/PRODUCT:\s*\n?"([^"]+)"/)?.[1] ??
    "this product";
  const pitch = readPitch(solution);
  const pvs = Number(user.match(/PROBLEM VALIDATION SCORE: (\d+)\/100/)?.[1] ?? NaN);
  const evidence = Number(user.match(/Evidence strength (\d+)/)?.[1] ?? NaN);
  return {
    pitch,
    market: MARKETS[pitch.domain],
    problem: user.match(/ACTUALLY SOLVING:\s*\n"([^"]+)"/)?.[1] ?? null,
    who: user.match(/Who has it: ([^\n]+)/)?.[1]?.trim() ?? null,
    wtp: user.match(/Willingness to pay: ([^\n]+)/)?.[1]?.trim() ?? null,
    pvs: Number.isNaN(pvs) ? null : pvs,
    evidence: Number.isNaN(evidence) ? null : evidence,
    moved: /the research moved them/.test(user),
  };
}

/** How the evidence moves every partner: a validated, high-scoring problem
 *  warms the room; no validated problem at all chills it. */
function evidenceLean(d: Deal): number {
  if (!d.problem) return -0.25;
  if (d.pvs === null) return -0.1;
  return clamp((d.pvs - 58) / 80, -0.3, 0.3);
}

function committeeVerdict(seat: Seat, d: Deal) {
  const it = d.pitch.short;
  const lean = evidenceLean(d);
  const problem = d.problem ? gist(d.problem) : null;
  const key = d.pitch.solution;

  switch (seat) {
    case "gp":
      return {
        stance: round2(clamp(0.4 + lean, -0.9, 0.9)),
        confidence: 0.6,
        position: problem
          ? oneOf(key, [
              `Look, I like the problem — ${problem}. That's real. What I can't see yet is a company rather than a feature: what stops ${clause(d.market.incumbent)} from shipping their own ${it} the moment this works?`,
              `I'll be the one who likes it. ${cap(problem)} — people genuinely feel that. My worry is size. Is this a big company, or a nice product that tops out at a few million?`,
            ])
          : `Honestly, I came in wanting to like the ${it}, but the file never says whose problem it solves. Without that I can't tell you how big it gets.`,
        reasoning: `${problem ? `The research moved this from "${it}" to a real problem, which is the right direction.` : "There is no validated problem in the file."} In ${d.market.category} the question is always whether the product owns a relationship — recurring revenue, retention, a reason to stay — or gets absorbed by ${d.market.incumbent}. Nothing here compounds yet.`,
        evidence: ["vf.chosenProblem", "firm.thesis[0]"],
        whatWouldChangeMyMind: "A reason this gets bigger every month a customer keeps it — not just a better version of something that exists.",
      };
    case "principal":
      return {
        stance: round2(clamp(-0.15 + lean, -0.9, 0.9)),
        confidence: 0.85,
        position: d.wtp
          ? `I did the homework on this one, and I'm not there yet. There's no price in the file and nobody's paid. The research says willingness to pay is "${d.wtp.replace(/[.]$/, "")}" — that's a feeling, not a number.`
          : `I did the homework on this one, and I'm not there yet. There's no price, no paying customer, and no sense of what it costs to win one.`,
        reasoning: `${d.who ? `The people who have this problem are ${whoShort(d.who)}. ` : ""}The people who liked it in the research and the people who'd pay for it aren't obviously the same people, and that gap shows up later as an expensive sale.${d.evidence !== null ? ` Evidence strength is ${d.evidence}, and that's the part I'd want to see move.` : ""}`,
        evidence: ["vf.chosenProblem.willingnessToPay", "vf.pvs.evidenceStrength"],
        whatWouldChangeMyMind: "Three customers who paid — and who hold the budget themselves.",
      };
    case "skeptic":
      return {
        stance: round2(clamp(-0.6 + lean * 0.6, -0.95, 0.9)),
        confidence: 0.75,
        position: oneOf(key, [
          `I've seen this movie. In ${d.market.category}, ${d.market.failure}. What makes the ${it} different on day ninety?`,
          `Here's my problem: products like this don't fail for lack of interest. They fail because ${d.market.failure}. Nothing in this file tells me that won't happen here.`,
        ]),
        reasoning: `The failure mode for this category is well known and it's retention, not demand. Until someone shows me usage in month three, I'm treating the enthusiasm in the research as first-week enthusiasm.`,
        evidence: ["crowd.attention", "vf.chosenProblem.frequency"],
        whatWouldChangeMyMind: "Real usage data from month three, not sign-ups from week one.",
      };
    case "devil":
      return {
        stance: round2(clamp(0.5 - lean, -0.9, 0.9)),
        confidence: 0.55,
        position:
          lean >= 0
            ? `Everyone's warming up to this, and that's exactly when I get nervous. If it's this obvious, why isn't it already being done by ${d.market.incumbent}? Somebody here should be arguing it's already too late.`
            : `The room's heading for "nice idea, not a business". That's the comfortable call — and it's the call every room makes right before someone else funds the category leader.`,
        reasoning: "When the room converges quickly, it has usually found the obvious answer, which everyone else has found too.",
        evidence: ["room.consensus"],
        whatWouldChangeMyMind: "A credible argument I haven't heard yet — in either direction.",
      };
    default:
      return { stance: 0, confidence: 0.5, position: "", reasoning: "", evidence: [], whatWouldChangeMyMind: "" };
  }
}

function committeeChallenges(seat: Seat, d: Deal): { to: string; text: string }[] {
  const it = d.pitch.short;
  switch (seat) {
    case "principal":
      return [{
        to: "gp",
        text: `You said the problem's real. Real for whom — and who pays? There's no price in this file and nobody's paid a cent. A wedge nobody's bought is still a hypothesis.`,
      }];
    case "skeptic":
      return [{
        to: "gp",
        text: `You want the ${it} to become part of their routine. Which moment does it own — ${d.market.moment}? If you can't name it, "habit" is a wish, not a plan.`,
      }];
    case "gp":
      return [{
        to: "skeptic",
        text: `You're arguing from products that got abandoned, but most of those added work. Does the ${it} add work or take it away? Is your analogy doing real work, or is it just the one that came to mind?`,
      }];
    default:
      return [];
  }
}

function committeeRebuttal(seat: Seat, d: Deal) {
  const lean = evidenceLean(d);
  switch (seat) {
    case "gp":
      return {
        response: "Fair, both of you. I was describing where it ends up, not how it gets there, and I can't name the moment it owns yet. I'm coming down — but not off it. The problem is still the most interesting thing in this file.",
        conceded: true,
        revisedStance: round2(clamp(0.1 + lean, -0.9, 0.9)),
        revisedConfidence: 0.65,
      };
    case "principal":
      return {
        response: "This isn't me being fussy about a model. No price and no paying customer is the whole question at this stage. I'm holding.",
        conceded: false,
        revisedStance: round2(clamp(-0.15 + lean, -0.9, 0.9)),
        revisedConfidence: 0.88,
      };
    case "skeptic":
      return {
        response: `That's a fair distinction, and I'll grant it — if it genuinely takes work away, it has a better shot. But the first time it lets them down, they stop using it. Same position, a little less sure.`,
        conceded: false,
        revisedStance: round2(clamp(-0.52 + lean * 0.6, -0.95, 0.9)),
        revisedConfidence: 0.7,
      };
    default:
      return { response: "", conceded: false, revisedStance: round2(clamp(0.5 - lean, -0.9, 0.9)), revisedConfidence: 0.55 };
  }
}

function committeeTasks(d: Deal) {
  const it = d.pitch.short;
  return {
    tasks: [
      { question: `Is the market for the ${it} big enough to return the fund?`, assignedTo: "gp", why: "Market size is the lead partner's call." },
      { question: `Who actually pays for it, and has anyone paid yet?`, assignedTo: "principal", why: "The principal did the diligence on customers." },
      { question: `What has this kind of product failed as before?`, assignedTo: "skeptic", why: "Finding the flaw is the skeptical partner's job." },
      { question: `Could ${clause(d.market.incumbent)} ship this within two quarters?`, assignedTo: "gp", why: "Timing sits with the lead partner." },
      { question: `How do the first thousand customers find it, and what does each one cost?`, assignedTo: "principal", why: "Go-to-market is diligence." },
    ],
  };
}

function preRead(seat: Seat, d: Deal) {
  const it = d.pitch.short;
  const lean = evidenceLean(d);
  const bySeat: Record<string, { lean: number; q: string[]; kill: string }> = {
    gp: { lean: 0.3, q: [`Why does the ${it} have to exist now?`, `What stops ${clause(d.market.incumbent)} from shipping it?`], kill: "The market tops out below a fund-returning outcome." },
    principal: { lean: -0.1, q: ["Who signs the cheque?", "What does one customer cost to win?"], kill: "Nobody's paid, and the people who liked it can't pay." },
    skeptic: { lean: -0.5, q: ["What has this failed as before?", "What happens on day ninety?"], kill: `The usual ${d.market.category} story: ${d.market.failure}.` },
  };
  const s = bySeat[seat] ?? bySeat.gp;
  return {
    initialLean: round2(clamp(s.lean + lean, -0.95, 0.95)),
    topQuestions: s.q,
    killCriterion: s.kill,
    rationale: "Read the memo before the meeting.",
  };
}

// --- the live meeting ---------------------------------------------------------

const MODERATOR_ROTATION: Seat[] = ["principal", "skeptic", "gp"];
let turnCounter = 0;

/**
 * WITHOUT A MODEL, A PARTNER CANNOT ACTUALLY LISTEN — but it can notice what
 * kind of thing was just said. A founder who names a customer and a number
 * should not be asked "has anyone paid?" as if they had said nothing; they
 * should be pushed one level deeper on the thing they offered. With a key set,
 * the partners genuinely respond to what was said.
 */
function seatResponse(seat: Seat, user: string) {
  const solution =
    user.match(/THE FOUNDER'S SOLUTION[^:]*:\s*\n?"?([^"\n]{8,200})/i)?.[1]?.trim() ??
    user.match(/PRODUCT:\s*\n?"([^"]{8,200})"/i)?.[1]?.trim() ??
    "this";
  const it = readPitch(solution).short;
  const market = MARKETS[readPitch(solution).domain];

  const last = user.match(/THE FOUNDER JUST SAID:\s*\n?"([^"]{0,600})"/i)?.[1]?.trim() ?? "";
  const words = last.split(/\s+/).filter(Boolean).length;
  const vague = words > 0 && words < 10;
  const amount = last.match(/[$€£]\s?\d[\d,.]*(?:\s?(?:k|m|million|thousand))?(?:\s?(?:a|per)\s(?:month|year|week))?/i)?.[0];
  const said = {
    money: Boolean(amount) || /\b(paid|paying|revenue|pilot|contract|mrr|arr|signed|sales?|subscri\w*|invoice)\b/i.test(last),
    traction: /\b(users?|downloads?|waitlist|sign-?ups?|growth|retention|customers?|orders?)\b/i.test(last),
    rival: /\b(competitor|unlike|versus|vs\.?|incumbent|nobody else|alternative|different from|better than)\b/i.test(last),
    timing: /\b(now|this year|recently|finally|changed|cheaper|since|new)\b/i.test(last),
  };

  const bySeat: Record<string, { line: string; objectionText: string }> = {
    principal: said.money
      ? {
          line: `${amount ? `Okay — ${amount} is a real number, thank you.` : "Okay, that's a start."} Is it renewing, and did the person who signed it actually own the budget, or borrow it for a pilot?`,
          objectionText: "Revenue named, renewal and buyer unproven",
        }
      : said.traction
        ? {
            line: `Users are nice. How many of them pay, and what did it cost you to get each one?`,
            objectionText: "Traction without payment",
          }
        : {
            line: `Let me ask it plainly: who has paid for the ${it}? One name, one number.`,
            objectionText: "No paying customer named",
          },
    skeptic: said.rival
      ? {
          line: `Everyone's different on the slide. What stops ${market.incumbent} copying the one thing you just said within a quarter?`,
          objectionText: "Differentiation claimed, not defended",
        }
      : vague
        ? {
            line: "That wasn't really an answer. I'll ask again: what makes this hard to copy?",
            objectionText: "Dodged the defensibility question",
          }
        : {
            line: `I keep coming back to the same thing — in ${market.category}, ${market.failure}. What's your plan for day ninety?`,
            objectionText: "Retention risk unaddressed",
          },
    gp: said.timing
      ? {
          line: "Okay — that's a why-now I can work with. So if you're right, how big does this get? Walk me to a hundred million.",
          objectionText: "Why-now plausible, scale unproven",
        }
      : vague
        ? {
            line: `Say more. Why does the ${it} have to exist this year rather than next?`,
            objectionText: "No why-now established",
          }
        : {
            line: `I hear you. What I still can't see is the shape of this at a hundred million in revenue — help me see it.`,
            objectionText: "Cannot see the path to a fund-returning outcome",
          },
  };

  const pick = bySeat[seat] ?? bySeat.gp;
  return { line: pick.line, isObjection: true, objectionText: pick.objectionText };
}

// =============================================================================
// THE HUB COUNCIL
//
// Five people assessing one problem in one city, from what that city's crowd
// actually said. The numbers they quote are parsed back out of their brief, so
// two cities never get the same conversation.

type Council = {
  problem: string;
  who: string;
  city: string;
  asked: number;
  have: number;
  pay: number;
  capital: number | null;
  market: Market;
  consumer: boolean;
};

function readCouncil(user: string): Council {
  const problem = user.match(/THE PROBLEM UNDER ASSESSMENT:\s*\n"([^"]+)"/)?.[1] ?? "this problem";
  const who = user.match(/Felt by: ([^\n]+)/)?.[1]?.trim() ?? "the people who have it";
  const num = (re: RegExp) => Number(user.match(re)?.[1] ?? NaN);
  const pitch = readPitch(`${problem} ${who}`);
  const capital = num(/Capital density (\d+)\/100/);
  return {
    problem,
    who,
    city: user.match(/THE CITY: ([^\n]+)/)?.[1]?.trim() ?? "this city",
    asked: num(/\((\d+) people asked\)/) || 0,
    have: num(/(\d+) of them have this specific problem/) || 0,
    pay: num(/(\d+) of those would pay/) || 0,
    capital: Number.isNaN(capital) ? null : capital,
    market: MARKETS[pitch.domain],
    consumer: pitch.consumer,
  };
}

const BASE_HUB_STANCE: Record<string, number> = {
  market: 0.35, founder: 0.6, customer: -0.25, regulatory: 0.1, capital: 0.3, contrarian: -0.55,
};

function councilVerdict(seat: Seat, c: Council) {
  const incidence = c.asked ? c.have / c.asked : 0;
  const payRate = c.have ? c.pay / c.have : 0;
  const who = whoShort(c.who);
  const problem = gist(c.problem);

  const position: Record<string, string> = {
    market: c.asked
      ? `${c.have} of the ${c.asked} people we asked in ${c.city} ${c.have === 1 ? "has" : "have"} this, and ${c.pay} would pay to fix it. ${incidence >= 0.4 ? "That's a real market" : "It's real, but it's a niche"} — mostly ${who}, not everyone.`
      : `I don't have enough people from ${c.city} to size this honestly. That's a finding in itself.`,
    founder: `You could build this in ${c.city}. The first ten customers are probably two introductions away from people already here — the question is whether that edge lasts past year one.`,
    customer:
      payRate >= 0.5
        ? `The people here who have this would actually pay — ${c.pay} of ${c.have}. That's the strongest signal we've got.`
        : `I'd use it. I'm just not the one who'd pay — and the person who pays wasn't really asked.`,
    regulatory: c.consumer
      ? `Nothing here blocks it, but it needs ${c.market.regulation}. Budget for that before launch, not after.`
      : `No hard blocker in ${c.city}, but buying here is slow enough that it's part of the market, not an inconvenience.`,
    capital: `${c.city} can fund a seed round for this${c.capital !== null ? ` — capital density is ${c.capital} out of 100` : ""}. The harder part is finding people who've built ${c.market.category} before; they're not all here.`,
    contrarian: `This council's heading for "good problem, hard sale", which is what every room concludes about everything. Nobody's asked whether ${who} would actually drop ${c.market.incumbent} for it.`,
  };

  const reasoning: Record<string, string> = {
    market: `The problem — ${problem} — shows up here, but it clusters. Size the market on who has it and who'd pay, not on everyone who nodded.`,
    founder: `${c.city} produces companies like this, which cuts both ways: the talent's here, and so are the competitors nobody's named yet.`,
    customer: `Enthusiasm and budget sit with different people. That gap is the whole sale.`,
    regulatory: `The friction here is ${c.consumer ? "certification and returns" : "procurement"}, and it adds months, not years.`,
    capital: `Money for the first round isn't the constraint. Experienced people are.`,
    contrarian: `Three of us reached for the same gap independently — that's pattern-matching, not reasoning.`,
  };

  return {
    stance: BASE_HUB_STANCE[seat] ?? 0,
    confidence: seat === "customer" ? 0.8 : seat === "contrarian" ? 0.5 : 0.65,
    position: position[seat] ?? "",
    reasoning: reasoning[seat] ?? "",
    evidence: seat === "capital" ? ["hub.capitalDensity"] : ["crowd.reactions", "crowd.problemVotes"],
    whatWouldChangeMyMind:
      seat === "customer" ? "One buyer who actually paid, rather than a user who liked it." : "A number from this city that points the other way.",
  };
}

function councilChallenges(seat: Seat, c: Council): { to: string; text: string }[] {
  const who = whoShort(c.who);
  switch (seat) {
    case "market":
      return [{ to: "founder", text: `You said two introductions away. Two introductions from whom? Nothing here says the founder knows anyone in ${c.city}.` }];
    case "founder":
      return [{ to: "customer", text: `You're treating "the payer wasn't asked" as fatal. Plenty of products start with the person who uses them and get bought by the person who pays later.` }];
    case "customer":
      return [{ to: "market", text: `You counted who has the problem. I'm telling you who'd pay is a smaller group. Your number's the optimistic one.` }];
    case "capital":
      return [{ to: "market", text: `If it's really concentrated in ${who}, the price has to carry small numbers. Which is it — a big market or a premium one?` }];
    default:
      return [];
  }
}

function councilRebuttal(seat: Seat, c: Council) {
  const base = BASE_HUB_STANCE[seat] ?? 0;
  switch (seat) {
    case "market":
      return {
        response: "Fair — I counted people with the problem, not people who'd pay, and those are different groups. I'm coming down a bit.",
        conceded: true, revisedStance: round2(base - 0.3), revisedConfidence: 0.75,
      };
    case "founder":
      return {
        response: `The network edge in ${c.city} is real for year one, and I said as much. I'm not moving.`,
        conceded: false, revisedStance: base, revisedConfidence: 0.6,
      };
    case "customer":
      return {
        response: "Bought-later works when one person can start using it alone. This needs the payer involved from day one. Same position.",
        conceded: false, revisedStance: base, revisedConfidence: 0.85,
      };
    default:
      return { response: "", conceded: false, revisedStance: base, revisedConfidence: 0.55 };
  }
}

function councilTasks(c: Council) {
  return {
    tasks: [
      { question: `How many people in ${c.city} actually have this — is that a market?`, assignedTo: "market", why: "Sizing is the market analyst's job." },
      { question: `Could a team build this and find its first customers in ${c.city}?`, assignedTo: "founder", why: "Execution reality." },
      { question: `Would the person who pays in ${c.city} actually pay for it?`, assignedTo: "customer", why: "The buyer's view." },
      { question: "What rules or red tape apply here?", assignedTo: "regulatory", why: "Constraints." },
      { question: `Is there money and experienced talent for this in ${c.city}?`, assignedTo: "capital", why: "The inputs to building here." },
    ],
  };
}

// The written positions set the argument; what moves each stance is the crowd
// data for the city under assessment, parsed back out of the brief the way a
// model would read it. Without this every city scores identically.
function hubLean(seat: Seat, user: string): number {
  const read = (re: RegExp) => Number(user.match(re)?.[1] ?? NaN);
  const asked = read(/\((\d+) people asked\)/);
  const have = read(/(\d+) of them have this specific problem/);
  const pay = read(/(\d+) of those would pay/);
  const capital = read(/Capital density (\d+)\/100/);
  if (!asked || Number.isNaN(have)) return 0;

  const incidence = have / asked;
  const payRate = have && !Number.isNaN(pay) ? pay / have : 0;
  // Stable per city, so the same city always argues the same way.
  const jitter = ((hash(user.match(/THE CITY: (.+)/)?.[1] ?? "") % 21) - 10) / 100;

  switch (seat) {
    case "market":
      return (incidence - 0.45) * 0.9;
    case "customer":
      return (payRate - 0.6) * 0.8;
    case "capital":
      return Number.isNaN(capital) ? jitter : (capital - 70) * 0.008;
    case "founder":
      return jitter;
    case "regulatory":
      return -jitter / 2;
    case "contrarian":
      // Leans against wherever the evidence pushes everyone else.
      return -(incidence - 0.45) * 0.5;
    default:
      return 0;
  }
}

/** Moves one stance field, so a verdict and its rebuttal shift together and
 *  the recorded change of mind keeps its size and direction. */
function shiftStance(base: Record<string, unknown>, key: string, by: number) {
  if (!by) return base;
  const moved = Math.max(-0.95, Math.min(0.95, Number(base[key]) + by));
  return { ...base, [key]: Math.round(moved * 100) / 100 };
}

// =============================================================================
// PART 1: DISCOVERY
//
// The crowd's reactions are NOT canned. They are computed from each persona's
// actual attributes, parsed out of the prompt: price-sensitive people with no
// budget ignore things, low pain-tolerance people feel the problem, and the
// buyers land on a different problem from the users. That mismatch is the
// reveal, and it emerges here the same way it would from a model.

const STOP = new Set(
  "the and for that this with from into your their they them when which what whom have has had not but are was were will would can cannot could should does did its our out all any more most some such than then there these those very just also only over under about after before because while where here each other same how why own one ones get gets goes make makes made instead being been who".split(
    " "
  )
);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (w.length >= 4 && !STOP.has(w)) out.add(stem(w));
  }
  return out;
}

/**
 * Which kind of person a problem belongs to, read from what it says rather
 * than where it sits in the list. Position-based assignment breaks the moment
 * a re-run reorders the problems, and the refine loop does exactly that.
 */
const SEGMENTS = {
  buyer: /accountab|owns? the outcome|budget|\bleads?\b|manager|\brisk|incident|dangerous/i,
  compliance: /audit|complian|regulat|executive|standard|director|report(?:ing)? (?:upward|back)|report\w* (?:to|progress|numbers|spending|results)|can(?:no|')t (?:tell|prove)|cannot prove/i,
  tedium: /tedious|avoid|by hand|manual|individual contributor|\bskip/i,
} as const;

type Segment = keyof typeof SEGMENTS;

type ParsedProblem = { id: string; segment: Segment | null; words: Set<string> };

/** The founder's own framing is the absence of their product, whatever words
 *  it happens to contain — "There is no budgeting app" is not a buyer's problem. */
const FOUNDER_FRAMING = /^(?:there is no|teams have no|nobody has this yet)\b/i;

function parseProblems(user: string): ParsedProblem[] {
  const full = [...user.matchAll(/^\s{2}(p\d+): "(.*)" \(felt by (.*)\)\s*$/gm)];
  if (full.length > 0) {
    return full.map((m) => {
      const text = `${m[2]} ${m[3]}`;
      const segment = FOUNDER_FRAMING.test(m[2])
        ? null
        : ((Object.keys(SEGMENTS) as Segment[]).find((s) => SEGMENTS[s].test(text)) ?? null);
      return { id: m[1], segment, words: contentWords(text) };
    });
  }
  return [...user.matchAll(/^\s{2}(p\d+):/gm)].map((m) => ({
    id: m[1],
    segment: null,
    words: new Set<string>(),
  }));
}

type ParsedPersona = {
  id: number;
  tech: number; risk: number; price: number;
  budget: number; pain: number; brand: number; influence: number;
};

function parsePersonas(user: string): ParsedPersona[] {
  const re =
    /id (\d+) —[^\n]*?tech (\d+) risk (\d+) price (\d+) budget (\d+) pain (\d+) brand (\d+) influence (\d+)/g;
  const out: ParsedPersona[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(user)) !== null) {
    out.push({
      id: +m[1], tech: +m[2], risk: +m[3], price: +m[4],
      budget: +m[5], pain: +m[6], brand: +m[7], influence: +m[8],
    });
  }
  return out;
}

function demoReactions(user: string) {
  const people = parsePersonas(user);
  const problems = parseProblems(user);
  const ids = problems.map((p) => p.id);
  const productText = user.match(/PRODUCT:\n"([\s\S]*?)"\n/)?.[1] ?? "";
  const product = contentWords(productText);
  const pitch = readPitch(productText || "this");

  const bySegment = new Map<Segment, string>();
  for (const p of problems) {
    if (p.segment && !bySegment.has(p.segment)) bySegment.set(p.segment, p.id);
  }
  // The people who use the thing have the problem it literally solves — the
  // founder's own framing, wherever the list now puts it.
  const literal = problems.find((p) => !p.segment)?.id ?? ids[0] ?? "p1";

  // The reveal, emerging rather than scripted: people who can actually sign
  // are answering a different question from the people who use the thing.
  const pick = (p: ParsedPersona): string => {
    if (ids.length > 1) {
      if (p.budget >= 7) return bySegment.get("buyer") ?? ids[1];
      if (p.pain <= 3) {
        const id = bySegment.get("compliance") ?? ids[2];
        if (id) return id;
      }
      if (p.tech <= 3) {
        const id = bySegment.get("tedium") ?? ids[3];
        if (id) return id;
      }
    }
    return literal;
  };

  /** How squarely the pitch speaks to this person's problem, 0..1. A pitch
   *  that names someone's actual pain gets a warmer hearing — which is the
   *  whole reason rewriting around the market's problem can move the crowd. */
  const fit = (problemId: string): number => {
    const words = problems.find((p) => p.id === problemId)?.words;
    if (!words) return 0;
    let overlap = 0;
    for (const w of words) if (product.has(w)) overlap++;
    return Math.min(1, overlap / 5);
  };

  return {
    reactions: people.map((p) => {
      const problemId = pick(p);
      const addressed = fit(problemId);

      // Enthusiasm rises with appetite for new things, falls with price
      // sensitivity and loyalty to incumbents — through a logistic, so a hub
      // tilted one way still comes back as individuals rather than a block.
      const z =
        (p.tech - 5.5) * 0.34 +
        (p.risk - 5.5) * 0.26 -
        (p.price - 5.5) * 0.24 -
        (p.brand - 5.5) * 0.18 +
        (5.5 - p.pain) * 0.14 +
        addressed * 0.7;
      const sentiment = 1 / (1 + Math.exp(-z));

      // Real research is mostly indifference. A crowd that is 60% enthusiastic
      // has been flattered, and it teaches a founder nothing.
      const engagement = sentiment * 0.55 + ((10 - p.pain) / 10) * 0.45;
      const attention = engagement > 0.72 ? "full" : engagement > 0.52 ? "partial" : "ignore";

      const hasProblem = attention !== "ignore" || p.pain <= 4;

      return {
        personaId: p.id,
        attention,
        sentiment: Number(sentiment.toFixed(2)),
        problemId: hasProblem ? problemId : "",
        problemSeverity: hasProblem ? Math.round((10 - p.pain) * 9 + p.budget * 1.5) : 0,
        wouldPay: p.budget >= 6 && p.price <= 6 && sentiment > 0.45,
        reason: hasProblem ? demoReason(p, addressed, pitch) : demoShrug(p, pitch),
      };
    }),
  };
}

/**
 * The problem as the founder frames it: the absence of their own product.
 * That is the classic mistake, and it is exactly what the reveal exists to
 * catch, so it is worth stating grammatically rather than as a fragment.
 */
function founderFraming(solution: string, consumer = false): string {
  // The first sentence is the product; the rest ("It keeps milk cold for 18
  // hours") is a feature list, and a problem statement that trails off into
  // one reads as a clipped paste.
  const s = solution
    .trim()
    .split(/(?<=[.!?])\s+/)[0]
    .replace(/[.!\s]+$/, "")
    .replace(/^we(?:'ve| have)? (?:built|made|are building)\s+/i, "");
  const end = (t: string) => (t.length > 150 ? `${t.slice(0, 150).trimEnd()}…` : `${t}.`);

  const relative = s.match(/^(?:an?\s+|the\s+)?(.+?)\s+(?:that|which)\s+(.+)$/i);
  if (relative) {
    return end(`${consumer ? "There's no" : "Teams have no"} ${lowerFirst(relative[1])} that ${relative[2]}`);
  }

  const bare = s.match(/^(?:an?|the)\s+(.+)$/i);
  if (bare) return end(`There is no ${lowerFirst(bare[1])}`);

  return end(`Nobody has this yet: ${lowerFirst(s)}`);
}

/** "Software" → "software", but "AI tool" stays "AI tool". */
function lowerFirst(t: string): string {
  return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

function demoProblems(user: string) {
  const solution = (user.match(/"([^"]{10,400})"/)?.[1] ?? "the product").trim();
  const pitch = readPitch(solution);

  return {
    problems: [
      {
        statement: founderFraming(solution, pitch.consumer),
        whoHasIt: `The ${pitch.audience} you pictured when you started building.`,
        severity: 44,
        frequency: "All the time",
        currentWorkaround: "They cope, and grumble about it.",
        willingnessToPay: "Not much — it doesn't feel like something to buy.",
        confidence: 0.82,
      },
      // What the market might be feeling instead, written for this market in
      // the words the person with the problem would use.
      ...marketProblems(pitch),
    ],
  };
}

/** Varied by attribute rather than random, so the reaction list reads as many
 *  different people instead of one sentence pasted 120 times. */
function demoReason(p: ParsedPersona, addressed: number, pitch: Pitch): string {
  const it = pitch.short;
  const heard = [
    "This is pitched at the problem I actually have — and I'd pay for that.",
    "Finally framed around the part that actually costs me. I'd try it.",
    `If the ${it} really does that, I'll pay for it this month.`,
  ];
  if (p.budget >= 7 && addressed >= 0.6) return heard[(p.id * 7) % heard.length];

  const buyer = [
    `I'd pay for it, but only if it replaces something I already spend money on.`,
    `I can afford it. What I won't pay for is another ${it} that works for a month.`,
    "The money's not the issue. Whether it still works in six months is.",
  ];
  const advocate = pitch.consumer
    ? [
        "I feel this every week, but money's tight and this isn't top of the list.",
        `I'd use the ${it} tomorrow. Talking myself into paying for it is the hard part.`,
        "This is my problem. I just can't justify spending on it right now.",
      ]
    : [
        "I feel this every week, but I'm not the one who decides what we spend on.",
        `I'd use the ${it} tomorrow. Convincing whoever holds the wallet is the hard part.`,
        "This is my problem, and I've got no budget to fix it.",
      ];
  const skeptic = [
    `I tried something like the ${it} before and stopped using it within a month.`,
    "The problem's real, but I don't think a product fixes it — it's a habit thing.",
    "Show me it still works after six months and I'll care.",
  ];
  const eager = [
    `I'd try the ${it} the day it came out.`,
    "I've been hacking together a worse version of this myself.",
    "If it actually works, this changes my week.",
  ];

  const pool =
    p.budget >= 7 ? buyer : p.brand >= 7 || p.risk <= 3 ? skeptic : p.tech >= 8 ? eager : advocate;
  return pool[(p.id * 7) % pool.length];
}

function demoShrug(p: ParsedPersona, pitch: Pitch): string {
  const pool = [
    "Not something I think about. It's fine as it is.",
    "Honestly, it reads like a solution looking for a problem.",
    "I've got bigger problems than this one.",
    `I wouldn't pay for a ${pitch.short}, and I wouldn't tell anyone about it either.`,
  ];
  return pool[(p.id * 5) % pool.length];
}

// --- the refine loop ---------------------------------------------------------

/**
 * Same product, pointed at the market's problem. The product words are kept
 * verbatim on purpose: a rewrite that invents features is a different product,
 * and the comparison between the two runs would stop meaning anything.
 */
function demoRefine(user: string) {
  const solution =
    user.match(/THE FOUNDER'S DESCRIPTION:\n"([\s\S]*?)"\n\nTHE PROBLEM/)?.[1]?.trim() ??
    "Our product";
  const statement = user.match(/ACTUALLY HAS:\n"([\s\S]*?)"\n/)?.[1]?.trim() ?? "";
  const who = user.match(/Felt by: (.+)/)?.[1]?.trim().replace(/\.$/, "") ?? "";

  const text = `${statement} ${who}`.toLowerCase();
  const aim = /accountab|\brisk|dangerous/.test(text)
    ? "so the leads accountable for it can see which part actually carries risk and point the effort at the dangerous areas first"
    : /audit|standard|executive/.test(text)
      ? "so the directors who answer for it can show an auditor or an executive that the work met the standard"
      : /tedious|avoid|by hand/.test(text)
        ? "so nobody has to do the tedious part by hand"
        : `built for ${lowerFirst(whoShort(who) || "the people who have this problem")}, because ${lowerFirst(gist(statement))}`;

  return { solution: `${solution.replace(/[.!\s]+$/, "")}, ${aim}.` };
}

// --- talking to one person -------------------------------------------------

/**
 * Replies driven by the persona's own attributes, parsed back out of the system
 * prompt, and about the product they were actually shown. A sceptic stays a
 * sceptic, someone with no budget says so, and nobody is talked round by a
 * single question — which is what makes a research call worth anything.
 */
function demoPersonaReply(system: string, user: string) {
  const num = (label: string) => Number(new RegExp(label + "\\s+(\\d+)").exec(system)?.[1] ?? 5);

  const budget = num("budget authority");
  const price = num("price");
  const tech = num("new tools");
  const pain = num("pain tolerance");
  const brand = num("brand loyalty");
  const name = system.match(/^You are ([^,]+),/)?.[1]?.split(" ")[0] ?? "";

  const product = user.match(/THE PRODUCT: "([^"]*)"/)?.[1] ?? "";
  const pitch = readPitch(product || "this");
  const it = pitch.short;
  const market = MARKETS[pitch.domain];
  const theirProblem = system.match(/The problem you actually have is: "([^"]+)"/)?.[1];
  const today = system.match(/What you do about it today: "([^"]+)"/)?.[1];
  const workaround = market.incumbent;

  const question = (user.match(/THE FOUNDER ASKS: "([^"]*)"/)?.[1] ?? "").toLowerCase();
  const greeting = /the call just connected/i.test(user) || /^(hi|hey|hello)\b/.test(question);
  const aboutPrice = /price|cost|pay|budget|sign|buy|purchas|afford|\$|money|spend/.test(question);
  const aboutToday = /what do you (?:do|use)|how do you (?:handle|deal|cope|manage)|today|currently|right now|at the moment/.test(question);
  const aboutUse = /use|workflow|day|how would|integrate|routine|set up|setup/.test(question);
  const aboutRival = /competitor|alternative|instead|versus|who else|anyone else|already|rival|vs\b/.test(question);
  const aboutProblem = /problem|pain|struggle|frustrat|annoy|hard|difficult|why/.test(question);
  const aboutIgnore = /ignore|never|wouldn't|would not|stop you|put you off|deal.?breaker/.test(question);
  const aboutWho = /who (?:in|at)|who would|who decides|sign for|approve/.test(question);

  let line: string;

  if (greeting) {
    line = `Hi${name ? ` — ${name} here` : ""}. You wanted to talk about the ${it}? Happy to — ask me anything.`;
  } else if (aboutPrice) {
    line =
      budget >= 7
        ? `I could pay for it. But I'd need it to replace something I already spend money on — tell me what the ${it} replaces.`
        : price >= 7
          ? `Whatever the price is, it's probably too high for me. I'd need to see it save me money first.`
          : `Honestly? I'm not the one who'd pay. You'd need whoever holds the budget in the room, not me.`;
  } else if (aboutWho) {
    line = budget >= 7
      ? "That'd be me, actually. I sign for this kind of thing — which is why I'm hard to impress."
      : "Not me. I'd bring it to whoever holds the budget, and they'd ask me why we need it.";
  } else if (aboutRival) {
    line =
      brand >= 7
        ? `Right now I'd just stick with ${workaround}. It's not great, but nobody ever got in trouble for it.`
        : "Honestly, the real alternative is doing nothing. That's what you're actually up against.";
  } else if (aboutIgnore) {
    line = tech >= 8
      ? "If it's unreliable even once, I'm out. I'll try anything, but I drop things fast."
      : "If it needs another app, another account and another charger, I won't bother.";
  } else if (aboutToday) {
    line = today
      ? `Right now? ${cap(today.replace(/[.]+$/, ""))}. It's not great, but it's what I've got.`
      : "Honestly, nothing — it's not something I have to deal with.";
  } else if (aboutUse) {
    line =
      tech >= 8
        ? `I'd set up the ${it} the day it arrived and poke at it all week to see if I trust it.`
        : `It'd have to fit into what I already do. If it's one more thing to remember, I'll use it twice and forget it.`;
  } else if (aboutProblem && theirProblem) {
    line =
      pain <= 3
        ? `It genuinely gets to me. The way I'd put it: ${gist(theirProblem)}. That's the bit I'd pay to fix.`
        : `It's a mild annoyance, if I'm honest. ${cap(gist(theirProblem))} — but I've worked around it for years.`;
  } else {
    line =
      pain <= 3
        ? `It's a real irritation for me, and I notice it every single week. I just haven't found anything that fixes it.`
        : `It's a small thing for me. I've made my peace with it, and nobody's ever asked me to fix it.`;
  }

  return {
    line,
    // One good question does not change a mind, and pretending otherwise turns
    // the call into a flattery machine.
    shifted: false,
    sentiment: Math.min(1, Math.max(0, (tech * 0.8 + (10 - price) * 0.6 + budget * 0.4) / 18)),
  };
}
