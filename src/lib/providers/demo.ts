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

type Seat = "gp" | "principal" | "skeptic" | "devil" | "chair";

function whoAmI(system: string): Seat {
  if (system.includes("Devil's Advocate")) return "devil";
  if (system.includes("Anti-Portfolio")) return "skeptic";
  if (system.includes("Principal")) return "principal";
  if (system.includes("General Partner")) return "gp";
  return "chair";
}

const VERDICTS: Record<Seat, Record<string, unknown>> = {
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

const CHALLENGES: Record<Seat, { to: string; text: string }[]> = {
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

const REBUTTALS: Record<Seat, Record<string, unknown>> = {
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

const SPOKEN: Record<Seat, { line: string; objectionText: string }[]> = {
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
        return TASKS as T;
      case "agent_verdict":
        return VERDICTS[seat] as T;
      case "challenges":
        return { challenges: CHALLENGES[seat] } as T;
      case "rebuttal":
        return REBUTTALS[seat] as T;
      case "seat_pre_read":
        return {
          initialLean: { gp: 0.3, principal: -0.1, skeptic: -0.5, devil: 0, chair: 0 }[seat],
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
