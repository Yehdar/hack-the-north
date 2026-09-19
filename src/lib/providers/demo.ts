import type { LLMProvider, LLMRequest } from "@/lib/llm";

// ============================================================================
// DEMO PROVIDER — realistic, differentiated, deterministic, and free.
//
// The plain mock returns "[mock]" for every field, which is fine for asserting
// shapes and useless for looking at. This one returns content written in each
// seat's actual voice, so the app can be run, demoed and screenshotted with no
// API key, no network, and no cost.
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
  if (system.includes("Anti-Portfolio")) return "skeptic";
  if (system.includes("Principal")) return "principal";
  if (system.includes("General Partner")) return "gp";
  // Hub council
  if (system.includes("Contrarian")) return "contrarian";
  if (system.includes("Market Analyst")) return "market";
  if (system.includes("Local Founder")) return "founder";
  if (system.includes("Customer Proxy")) return "customer";
  if (system.includes("Regulatory")) return "regulatory";
  if (system.includes("Capital & Talent")) return "capital";
  return "chair";
}

const VERDICTS: Record<string, Record<string, unknown>> = {
  gp: {
    stance: 0.45,
    confidence: 0.6,
    position:
      "Risk attribution is a real wedge, but I am not yet convinced it is a company rather than a feature.",
    reasoning:
      "The reframing from test generation to risk ranking is the right move and it is defensible. What I cannot see yet is the path from a ranking tool to something that owns the reliability budget. Our thesis is that recurring revenue with real retention beats one-time capture, and ranking is the kind of thing a platform absorbs.",
    evidence: ["firm.thesis[0]", "hub.sf.unserved"],
    whatWouldChangeMyMind:
      "Evidence that the ranking becomes a system of record teams plan against, not a report they read once.",
  },
  principal: {
    stance: -0.15,
    confidence: 0.85,
    position:
      "No pricing, no design partners, and the buyer they named does not control the budget they are counting on.",
    reasoning:
      "They claim reliability budget pays for this, but the stated buyer is a staff engineer, who influences that budget rather than holding it. That is a two-person sale being modelled as a one-person sale, which shows up later as a CAC payback problem rather than a positioning problem. Evidence strength of 41 is the weakest component of their own score and they did not address it.",
    evidence: ["vf.pvs.evidenceStrength", "vf.chosenProblem.willingnessToPay"],
    whatWouldChangeMyMind:
      "Three paying design partners where the EM signed, not the staff engineer.",
  },
  skeptic: {
    stance: -0.7,
    confidence: 0.75,
    position:
      "This rhymes with the coverage dashboards we already have, and those got gamed into meaninglessness.",
    reasoning:
      "Every tool that scores code eventually becomes a number that teams optimise instead of a signal they act on. Coverage percentage went exactly this way. I passed on eBay because I could not see past stamps and coins, so I hold my pattern-matching loosely — but the failure mode here is not obscure, it is the same failure mode as the incumbent they are displacing.",
    evidence: ["firm.antiPortfolio[3]", "hub.sf.incumbents[1]"],
    whatWouldChangeMyMind:
      "A mechanism that makes the ranking expensive to game, built in from the start rather than promised.",
  },
  devil: {
    stance: 0.55,
    confidence: 0.55,
    position:
      "The room is converging on 'feature, not company' because that is the comfortable call, and it is the same call that lost us Airbnb.",
    reasoning:
      "Two seats have independently reached for an incumbent analogy, which is the tell that we are pattern-matching rather than reasoning. The observation that platforms absorb rankings is true in general and says nothing about whether this specific team gets there first. Every category-defining company looked like a feature to somebody in this room.",
    evidence: ["firm.antiPortfolio[5]"],
    whatWouldChangeMyMind:
      "A credible argument that the incumbent can ship this in a quarter.",
  },
  chair: { stance: 0, confidence: 0.5, position: "", reasoning: "", evidence: [], whatWouldChangeMyMind: "" },
};

const CHALLENGES: Record<string, { to: string; text: string }[]> = {
  gp: [
    {
      to: "skeptic",
      text: "You are arguing from the failure of coverage dashboards, but those failed because the metric was trivially gameable. Blast radius is not. Is your analogy doing real work or is it just available?",
    },
  ],
  principal: [
    {
      to: "gp",
      text: "You called it a real wedge. On what revenue? There is no pricing in this file and no design partner has paid anything. A wedge that nobody has bought is a hypothesis.",
    },
  ],
  skeptic: [
    {
      to: "gp",
      text: "You want it to become a system of record. Name the workflow it inserts itself into. If you cannot, 'system of record' is a wish rather than a plan.",
    },
  ],
  devil: [],
  chair: [],
};

const REBUTTALS: Record<string, Record<string, unknown>> = {
  gp: {
    response:
      "Both fair. I was describing an outcome rather than a mechanism, and I do not have the workflow. I am moving down but not off — the reframing is still the most interesting thing in this file.",
    conceded: true,
    revisedStance: 0.15,
    revisedConfidence: 0.65,
  },
  principal: {
    response:
      "Pricing absence is not a modelling quibble. I hold my position.",
    conceded: false,
    revisedStance: -0.15,
    revisedConfidence: 0.88,
  },
  skeptic: {
    response:
      "The distinction between gameable and non-gameable metrics is real and I will grant it. But blast radius is computed from inputs the team controls, so it is gameable one level up. Position unchanged, confidence slightly lower.",
    conceded: false,
    revisedStance: -0.62,
    revisedConfidence: 0.7,
  },
  devil: { response: "", conceded: false, revisedStance: 0.55, revisedConfidence: 0.55 },
  chair: { response: "", conceded: false, revisedStance: 0, revisedConfidence: 0.5 },
};

const TASKS = {
  tasks: [
    { question: "Is the risk-attribution market large enough to return a fund?", assignedTo: "gp", why: "Market sizing is the GP's lane." },
    { question: "Who holds the reliability budget, and has anyone paid yet?", assignedTo: "principal", why: "Unit economics and buyer identification." },
    { question: "What has this pattern failed as before?", assignedTo: "skeptic", why: "Historical analogues." },
    { question: "Can an incumbent ship this within two quarters?", assignedTo: "gp", why: "Competitive timing sits with the decision owner." },
    { question: "What is the go-to-market motion for a two-person sale?", assignedTo: "principal", why: "GTM is the Principal's lane." },
  ],
};


// --- live meeting ----------------------------------------------------------

const MODERATOR_ROTATION: Seat[] = ["principal", "skeptic", "gp"];
let turnCounter = 0;

const SPOKEN: Record<string, { line: string; objectionText: string }[]> = {
  gp: [
    {
      line: "Stop there. You keep describing what it does. Tell me why a team buys it this quarter rather than next year.",
      objectionText: "No why-now established",
    },
    {
      line: "If this works, what does it look like at a hundred million in revenue? I cannot see the shape of that from here.",
      objectionText: "Cannot see the path to a fund-returning outcome",
    },
  ],
  principal: [
    {
      line: "You said teams would pay. Who has? Name one company and what they paid.",
      objectionText: "No paying customer named",
    },
    {
      line: "The buyer you described does not control that budget. Who actually signs?",
      objectionText: "Named buyer does not hold the budget",
    },
  ],
  skeptic: [
    {
      line: "We have seen this shape before. Coverage dashboards promised the same thing and became a number teams gamed. What stops that here?",
      objectionText: "Metric is gameable, like the incumbent it replaces",
    },
    {
      line: "You answered a different question than the one you were asked. I will ask it again: what makes this hard to copy?",
      objectionText: "Dodged the defensibility question",
    },
  ],
  devil: [{ line: "", objectionText: "" }],
  chair: [{ line: "", objectionText: "" }],
};


// --- hub council -----------------------------------------------------------

const HUB_VERDICTS: Record<string, Record<string, unknown>> = {
  market: {
    stance: 0.35,
    confidence: 0.7,
    position:
      "The incidence is real but narrow — this is a serious problem for a specific seniority band, not a broad market.",
    reasoning:
      "The people who report this problem cluster at lead and above, which caps the seat count hard. That is not fatal, but it means the price has to carry the small numbers, and nothing in the crowd data suggests they would tolerate an enterprise price.",
    evidence: ["crowd.problemVotes[0]", "crowd.attention"],
    whatWouldChangeMyMind:
      "Evidence that the buyer rolls it out to their whole team rather than using it alone.",
  },
  founder: {
    stance: 0.6,
    confidence: 0.65,
    position:
      "Buildable here, and sellable here — the first ten customers are all within two degrees of anyone already in this ecosystem.",
    reasoning:
      "This city produces exactly this kind of company, which cuts both ways: the talent is available and so are three competitors nobody has named yet. The network advantage is real for the first year and gone after that.",
    evidence: ["hub.talent", "crowd.reactions"],
    whatWouldChangeMyMind: "A founder with no existing network in this ecosystem.",
  },
  customer: {
    stance: -0.25,
    confidence: 0.8,
    position:
      "I would use it. I would not be the one who pays for it, and the person who pays has not been asked.",
    reasoning:
      "The crowd shows enthusiasm concentrated in people without budget authority and hesitation in the people who have it. That gap is the entire sale, and nothing here addresses it.",
    evidence: ["crowd.reactions", "persona.budgetAuthority"],
    whatWouldChangeMyMind: "One named buyer who signed, rather than a user who liked it.",
  },
  regulatory: {
    stance: 0.1,
    confidence: 0.55,
    position:
      "No hard blocker, but procurement here is slow enough to be a market characteristic rather than an inconvenience.",
    reasoning:
      "Nothing about this touches regulated data in a way that stops it. What will bite is the six-month cycle to get it approved at the company sizes where the budget actually lives.",
    evidence: ["hub.regulatory"],
    whatWouldChangeMyMind: "A bottoms-up motion that reaches the budget holder without procurement.",
  },
  capital: {
    stance: 0.3,
    confidence: 0.6,
    position:
      "Fundable here at seed, and the talent exists — but the people who have solved this exact problem before are elsewhere.",
    reasoning:
      "Local capital covers the first round comfortably. The constraint is domain depth: there are plenty of engineers and very few who have built risk attribution at scale, and training them is expensive talent on a delay.",
    evidence: ["hub.capitalDensity", "hub.talentDepth"],
    whatWouldChangeMyMind: "Two senior hires already committed.",
  },
  contrarian: {
    stance: -0.55,
    confidence: 0.5,
    position:
      "This council has converged on 'good problem, hard sale', which is the comfortable answer and the one every room reaches about every tool.",
    reasoning:
      "Three members independently reached for the budget-authority gap, which is the tell that they are pattern-matching a known failure shape rather than reasoning about this market. The gap is real and it is also solvable by pricing, which nobody here has considered.",
    evidence: ["crowd.reactions"],
    whatWouldChangeMyMind: "Someone in this room arguing a position they did not walk in with.",
  },
};

const HUB_CHALLENGES: Record<string, { to: string; text: string }[]> = {
  market: [
    { to: "founder", text: "You say the first ten customers are within two degrees. Two degrees of whom? The founder has no network here in this file." },
  ],
  founder: [
    { to: "customer", text: "You are treating the budget gap as fatal. Every bottoms-up tool in the last decade started exactly like this and got bought by the budget holder later." },
  ],
  customer: [
    { to: "market", text: "You sized this on the people who reported the problem. I am telling you the people who pay are a different, smaller set. Your number is the optimistic one." },
  ],
  regulatory: [],
  capital: [
    { to: "market", text: "If the seat count is genuinely capped at leads and above, the price you are implying does not clear a fund-returning outcome. Say which one you are giving up." },
  ],
  contrarian: [],
};

const HUB_REBUTTALS: Record<string, Record<string, unknown>> = {
  market: {
    response:
      "Granted — I sized incidence, not buyers, and those are different populations. Revising down and holding confidence.",
    conceded: true,
    revisedStance: 0.05,
    revisedConfidence: 0.75,
  },
  founder: {
    response:
      "The network point stands for the first year and I said as much. I am not moving.",
    conceded: false,
    revisedStance: 0.6,
    revisedConfidence: 0.6,
  },
  customer: {
    response:
      "Bottoms-up worked for tools an individual could adopt alone. This one only produces value once a team acts on it, which is precisely why the budget holder has to be in the room on day one. Position unchanged.",
    conceded: false,
    revisedStance: -0.25,
    revisedConfidence: 0.85,
  },
  regulatory: { response: "", conceded: false, revisedStance: 0.1, revisedConfidence: 0.55 },
  capital: { response: "", conceded: false, revisedStance: 0.3, revisedConfidence: 0.6 },
  contrarian: { response: "", conceded: false, revisedStance: -0.55, revisedConfidence: 0.5 },
};

const HUB_TASKS = {
  tasks: [
    { question: "How many people in this city actually have this problem, and is that a market?", assignedTo: "market", why: "Market sizing." },
    { question: "Can a team be assembled and the first customers found here?", assignedTo: "founder", why: "Execution reality." },
    { question: "Would the person with the budget in this city pay for it?", assignedTo: "customer", why: "The buyer's lane." },
    { question: "What operational or regulatory friction applies here?", assignedTo: "regulatory", why: "Constraints." },
    { question: "Is there local capital and domain-deep talent?", assignedTo: "capital", why: "Inputs to building here." },
  ],
};

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

    switch (req.schema?.name) {
      case "diligence_tasks":
        // The chair prompt names the room, so we can tell which council this is.
        return (req.system.includes("investment committee") ? TASKS : HUB_TASKS) as T;
      case "agent_verdict":
        if (!HUB_SEATS.has(seat)) return VERDICTS[seat] as T;
        return shiftStance(HUB_VERDICTS[seat], "stance", hubLean(seat, req.user)) as T;
      case "challenges":
        return {
          challenges: HUB_SEATS.has(seat) ? (HUB_CHALLENGES[seat] ?? []) : CHALLENGES[seat],
        } as T;
      case "rebuttal":
        if (!HUB_SEATS.has(seat)) return REBUTTALS[seat] as T;
        return shiftStance(HUB_REBUTTALS[seat], "revisedStance", hubLean(seat, req.user)) as T;
      case "problem_split":
        return demoProblems(req.user) as T;

      case "crowd_reactions":
        return demoReactions(req.user) as T;

      case "refined_pitch":
        return demoRefine(req.user) as T;

      case "persona_reply":
        return demoPersonaReply(req.system, req.user) as T;

      case "seat_pre_read":
        return {
          initialLean: ({ gp: 0.3, principal: -0.1, skeptic: -0.5 } as Record<string, number>)[seat] ?? 0,
          topQuestions:
            seat === "gp"
              ? ["Why does this have to exist now?", "What stops an incumbent shipping it?"]
              : seat === "principal"
                ? ["Who signs the cheque?", "What is CAC payback today?"]
                : ["What has this failed as before?", "What makes the ranking hard to game?"],
          killCriterion:
            seat === "gp"
              ? "The market caps out below a fund-returning outcome."
              : seat === "principal"
                ? "No one has paid, and the named buyer holds no budget."
                : "The metric is gameable, so it becomes another number teams optimise.",
          rationale: "Pre-read drafted from the venture file.",
        } as T;
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
          trigger: silent
            ? "Nothing here needs pressing yet."
            : "The founder made a claim with nothing behind it.",
          resolutions: [],
        } as T;
      }

      case "seat_response": {
        const options = SPOKEN[seat];
        const pick = options[Math.floor(turnCounter / MODERATOR_ROTATION.length) % options.length];
        return { line: pick.line, isObjection: true, objectionText: pick.objectionText } as T;
      }

      default:
        return {} as T;
    }
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- hub council, per city -------------------------------------------------
//
// The council's written positions are the same everywhere; what moves each
// stance is the crowd data for the city under assessment, parsed back out of
// the context the way a model would read it. Without this every city scores
// identically, and anyone who clicks two cities sees through the demo at once.

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

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

// --- reading problems and pitches ------------------------------------------

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
  compliance: /audit|complian|regulat|executive|standard|director|report(?:ing)? upward/i,
  tedium: /tedious|avoid|by hand|manual|individual contributor|\bskip/i,
} as const;

type Segment = keyof typeof SEGMENTS;

type ParsedProblem = { id: string; segment: Segment | null; words: Set<string> };

function parseProblems(user: string): ParsedProblem[] {
  const full = [...user.matchAll(/^\s{2}(p\d+): "(.*)" \(felt by (.*)\)\s*$/gm)];
  if (full.length > 0) {
    return full.map((m) => {
      const text = `${m[2]} ${m[3]}`;
      const segment =
        (Object.keys(SEGMENTS) as Segment[]).find((s) => SEGMENTS[s].test(text)) ?? null;
      return { id: m[1], segment, words: contentWords(text) };
    });
  }
  return [...user.matchAll(/^\s{2}(p\d+):/gm)].map((m) => ({
    id: m[1],
    segment: null,
    words: new Set<string>(),
  }));
}

// --- Part 1: discovery -----------------------------------------------------
//
// These are NOT canned. The crowd reactions are computed from each persona's
// actual attributes, parsed out of the prompt, so the demo shows the real
// mechanism: price-sensitive people with no budget ignore things, low
// pain-tolerance people feel the problem, and the buyers land on a different
// problem from the users. That mismatch is the reveal, and it emerges here the
// same way it would from a model.

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
  const product = contentWords(
    user.match(/PRODUCT:\n"([\s\S]*?)"\n\nCANDIDATE PROBLEMS:/)?.[1] ?? ""
  );

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
      // sensitivity and loyalty to incumbents.
      //
      // Through a logistic rather than a clamp. The linear version saturated:
      // anyone past the top of the range pinned to 0.98, so a hub already
      // tilted toward high tech adoption and low price sensitivity came back as
      // thirty people who all felt identically. A sigmoid keeps the ordering
      // and never flattens the tail.
      const z =
        (p.tech - 5.5) * 0.34 +
        (p.risk - 5.5) * 0.26 -
        (p.price - 5.5) * 0.24 -
        (p.brand - 5.5) * 0.18 +
        // Someone who tolerates friction is harder to excite, whatever else is
        // true of them.
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
        reason: hasProblem ? demoReason(p, addressed) : demoShrug(p),
      };
    }),
  };
}

/**
 * The problem as the founder frames it: the absence of their own product.
 * That is the classic mistake, and it is exactly what the reveal exists to
 * catch, so it is worth stating grammatically rather than as a fragment.
 */
function founderFraming(solution: string): string {
  const s = solution
    .trim()
    .replace(/[.!\s]+$/, "")
    .replace(/^we(?:'ve| have)? (?:built|made|are building)\s+/i, "");
  const clipped = (t: string) => (t.length > 150 ? `${t.slice(0, 150).trimEnd()}…` : t);

  const relative = s.match(/^(?:an?\s+|the\s+)?(.+?)\s+(?:that|which)\s+(.+)$/i);
  if (relative) return clipped(`Teams have no ${lowerFirst(relative[1])} that ${relative[2]}`) + ".";

  const bare = s.match(/^(?:an?|the)\s+(.+)$/i);
  if (bare) return clipped(`There is no ${lowerFirst(bare[1])}`) + ".";

  return clipped(`Nobody has this yet: ${lowerFirst(s)}`) + ".";
}

/** "Software" → "software", but "AI tool" stays "AI tool". */
function lowerFirst(t: string): string {
  return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

function demoProblems(user: string) {
  const solution = (user.match(/"([^"]{10,400})"/)?.[1] ?? "the product").trim();

  return {
    problems: [
      {
        statement: founderFraming(solution),
        whoHasIt: "The team the founder had in mind when they started building.",
        severity: 44,
        frequency: "Continuous",
        currentWorkaround: "They do it by hand and complain about it.",
        willingnessToPay: "Low — treated as hygiene rather than a budget line.",
        confidence: 0.82,
      },
      {
        statement:
          "The people accountable when this goes wrong cannot tell which part of it actually carries risk, so effort goes to the easy areas instead of the dangerous ones.",
        whoHasIt: "Leads and managers who own the outcome but not the day-to-day work.",
        severity: 81,
        frequency: "Every planning cycle, acutely after every incident",
        currentWorkaround: "Tribal knowledge and a post-mortem action item that expires.",
        willingnessToPay: "High — charged to a budget that gets defended.",
        confidence: 0.74,
      },
      {
        statement:
          "Nobody can show an auditor or an executive that the work was done to a standard, so it gets re-litigated every quarter.",
        whoHasIt: "Directors reporting upward in regulated or enterprise settings.",
        severity: 66,
        frequency: "Quarterly",
        currentWorkaround: "A spreadsheet rebuilt from scratch each time.",
        willingnessToPay: "Medium — compliance budget, slow procurement.",
        confidence: 0.61,
      },
      {
        statement: "The task is tedious and people avoid doing it at all.",
        whoHasIt: "Individual contributors.",
        severity: 35,
        frequency: "Daily",
        currentWorkaround: "They skip it.",
        willingnessToPay: "Near zero at the individual level.",
        confidence: 0.88,
      },
    ],
  };
}

/** Varied by attribute rather than random, so the reaction list reads as many
 *  different people instead of one sentence pasted 120 times. */
function demoReason(p: ParsedPersona, addressed: number): string {
  // A buyer hearing their own problem named back to them sounds different
  // from a buyer hearing a pitch aimed at somebody else.
  const heard = [
    "This is pitched at the problem I actually have, and I own the budget for it.",
    "Finally framed around what I get blamed for. I would take that meeting.",
    "If it does this for the people accountable, I can sign for a pilot.",
  ];
  if (p.budget >= 7 && addressed >= 0.6) return heard[(p.id * 7) % heard.length];

  const buyer = [
    "I own this budget, and the version of this problem I care about is the one that shows up in my incident reviews.",
    "I can sign for this, but only if it answers to my board deck rather than my engineers.",
    "The spend is defensible for me. What is not defensible is another dashboard nobody opens.",
  ];
  const advocate = [
    "I feel this weekly, but I would have to convince someone else to pay for it.",
    "This is my problem, and I have zero authority to fix it with money.",
    "I would use this tomorrow. Procurement would take until spring.",
  ];
  const skeptic = [
    "We tried something adjacent two years ago and it became shelfware.",
    "The pain is real but I do not believe a tool fixes it. It is a process problem.",
    "Show me it works on a codebase the size of ours before I care.",
  ];
  const eager = [
    "This is the first thing I have seen that targets the part that actually breaks.",
    "I have been building a worse version of this internally for months.",
    "If the ranking is trustworthy, this changes how we plan the quarter.",
  ];

  const pool =
    p.budget >= 7 ? buyer : p.brand >= 7 || p.risk <= 3 ? skeptic : p.tech >= 8 ? eager : advocate;
  return pool[(p.id * 7) % pool.length];
}

function demoShrug(p: ParsedPersona): string {
  const pool = [
    "Not something I think about. We have lived with it fine.",
    "Reads like a solution looking for a problem, from where I sit.",
    "My team has bigger fires than this one.",
    "I would not pay for this, and I would not champion it either.",
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
        : `built for ${lowerFirst(who || "the people who have this problem")}, because ${lowerFirst(statement.replace(/\.$/, ""))}`;

  return { solution: `${solution.replace(/[.!\s]+$/, "")}, ${aim}.` };
}

// --- talking to one person -------------------------------------------------

/**
 * Replies driven by the persona's own attributes, parsed back out of the system
 * prompt. A sceptic stays a sceptic, someone with no budget says so, and nobody
 * is talked round by a single question — which is the behaviour that makes a
 * research call worth anything.
 */
function demoPersonaReply(system: string, user: string) {
  const num = (label: string) =>
    Number(new RegExp(label + "\\s+(\\d+)").exec(system)?.[1] ?? 5);

  const budget = num("budget authority");
  const price = num("price");
  const tech = num("new tools");
  const pain = num("pain tolerance");
  const brand = num("brand loyalty");

  const question = (user.match(/THE FOUNDER ASKS: "([^"]*)"/)?.[1] ?? "").toLowerCase();
  const aboutPrice = /price|cost|pay|budget|sign|buy|purchas|afford|\$/.test(question);
  const aboutUse = /use|workflow|day|how would|integrate|today|currently|right now/.test(question);
  const aboutRival = /competitor|alternative|instead|versus|who else|anyone else|already|rival|vs\b/.test(question);

  let line: string;

  if (aboutPrice) {
    line =
      budget >= 7
        ? "I can sign for it. What I cannot do is justify a line item that duplicates something we already licence, so tell me what it replaces."
        : price >= 7
          ? "Whatever the number is, it is going to be too high for a tool I cannot prove saved us anything."
          : "I have no budget. If you want this bought, you need my director in the room, not me.";
  } else if (aboutRival) {
    line =
      brand >= 7
        ? "Our incumbent already claims to do this. They do it badly, but nobody ever got fired for keeping them."
        : "Honestly, the alternative is that we keep doing nothing. That is what you are actually competing with.";
  } else if (aboutUse) {
    line =
      tech >= 8
        ? "I would wire it into our pipeline the same afternoon and find out whether the output is trustworthy within a week."
        : "It would have to show up where I already work. If it is another tab, I will open it twice and never again.";
  } else {
    line =
      pain <= 3
        ? "This is a real irritation for me, and I notice it every single week. I just have never had a way to describe it upward."
        : "It is a mild annoyance. We have worked around it for years and nobody has ever asked me to fix it.";
  }

  return {
    line,
    // One good question does not change a mind, and pretending otherwise turns
    // the call into a flattery machine.
    shifted: false,
    sentiment: Math.min(1, Math.max(0, (tech * 0.8 + (10 - price) * 0.6 + budget * 0.4) / 18)),
  };
}
