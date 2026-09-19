import type { CrowdVerdict } from "@/lib/discovery/types";
import type { CrowdSignals } from "@/lib/discovery/signals";
import type { AgentVerdict, ICVerdict, Objection, PVSBreakdown } from "@/lib/types";

// ============================================================================
// ADVICE — pure, and specific to this run.
//
// The failure mode this replaces: telling a founder "the people accountable
// cannot tell which part carries risk" and stopping there. That is a restatement
// of the problem, not advice. It is true of every company in the category and
// it tells them nothing to do on Monday.
//
// Everything here quotes THIS run's numbers, names the specific thing that is
// wrong, and says what would change it. If we cannot ground a piece of advice
// in a number we measured, we do not give it.
// ============================================================================

export type Verdict = "fail" | "weak" | "promising" | "strong";

export type Finding = {
  /** Ordered by how expensive the mistake is to discover late. */
  severity: "fatal" | "serious" | "worth fixing";
  headline: string;
  /** The measurement. Always a real number from this run. */
  evidence: string;
  /** What to do. Specific enough to start on Monday. */
  action: string;
};

export type Assessment = {
  verdict: Verdict;
  /** One sentence a founder would repeat to their co-founder. */
  callToAction: string;
  findings: Finding[];
  /** The single thing to fix first. */
  nextStep: string;
};

/**
 * Grades honestly, which mostly means harshly.
 *
 * A market research tool that tells everyone their idea is promising is a
 * horoscope. Most ideas fail, so most runs should come back weak or worse, and
 * the bar for "strong" is deliberately hard to clear.
 */
export function assess(
  crowd: CrowdVerdict,
  signals: CrowdSignals,
  pvs?: PVSBreakdown,
  council: AgentVerdict[] = []
): Assessment {
  const findings: Finding[] = [];
  const asked = crowd.reactions.length || 1;
  const winner = crowd.problemVotes.find((v) => v.problemId === crowd.marketProblemId);

  const payers = crowd.reactions.filter((r) => r.wouldPay).length;
  const payRate = payers / asked;
  const engagedRate = crowd.attention.full / asked;
  const ignoredRate = crowd.attention.ignore / asked;

  // ---- fatal: nobody pays ------------------------------------------------
  if (payRate < 0.15) {
    findings.push({
      severity: "fatal",
      headline: "Almost nobody would pay for this",
      evidence: `${payers} of ${asked} people would pay — ${(payRate * 100).toFixed(0)}%. A market needs buyers, not sympathisers.`,
      action:
        "Before writing more code, find five people who will pre-pay. If you cannot find five, the problem is not painful enough to charge for and no amount of product work fixes that.",
    });
  }

  // ---- fatal: no problem at all -------------------------------------------
  if (!crowd.marketProblemId || (winner?.votes ?? 0) < asked * 0.15) {
    findings.push({
      severity: "fatal",
      headline: "No single problem got real traction",
      evidence: `The best-supported problem was claimed by ${winner?.votes ?? 0} of ${asked} people. The rest split or had none of them.`,
      action:
        "You are solving several small problems badly rather than one big problem well. Pick the one with the most severe holders and rebuild the pitch around only that.",
    });
  }

  // ---- fatal: indifference -------------------------------------------------
  if (ignoredRate > 0.45) {
    findings.push({
      severity: "fatal",
      headline: "Most of the market ignored you outright",
      evidence: `${crowd.attention.ignore} of ${asked} paid no attention at all — ${(ignoredRate * 100).toFixed(0)}%. These were people selected as relevant.`,
      action:
        "Indifference is harder to beat than objection. Either the audience is wrong or the problem is invisible to them. Re-run against a different buyer before changing the product.",
    });
  }

  // ---- serious: enthusiasts cannot buy -------------------------------------
  if (signals.warning) {
    findings.push({
      severity: "serious",
      headline: "Your fans are not your buyers",
      evidence: signals.warning,
      action:
        "Get the budget holder into the next conversation. If your champion has to sell it internally for you, your sales cycle is their calendar, not yours.",
    });
  }

  // ---- serious: mismatch ---------------------------------------------------
  if (crowd.mismatch) {
    findings.push({
      severity: "serious",
      headline: "You are pitching the wrong problem",
      evidence: `Your framing drew ${crowd.problemVotes.find((v) => v.problemId === crowd.pitchedProblemId)?.votes ?? 0} people. Theirs drew ${winner?.votes ?? 0}, and ${((winner?.payRate ?? 0) * 100).toFixed(0)}% of those would pay.`,
      action:
        "Rewrite your first sentence around their problem and re-run. If the numbers move, your product was always fine and your positioning was not.",
    });
  }

  // ---- serious: thin evidence ---------------------------------------------
  if (pvs && pvs.evidenceStrength < 45) {
    findings.push({
      severity: "serious",
      headline: "The case rests on assertion",
      evidence: `Evidence strength scored ${pvs.evidenceStrength} of 100 — most claims in the analysis cite nothing.`,
      action:
        "Every number in your deck needs a source an investor can check. Assume they will check one at random.",
    });
  }

  // ---- worth fixing: a council member is certain it fails -------------------
  const hardNo = council.filter((v) => v.stance < -0.4 && v.confidence > 0.6);
  for (const v of hardNo.slice(0, 2)) {
    findings.push({
      severity: "worth fixing",
      headline: `${v.agentId} is confident this fails`,
      evidence: v.position,
      action: v.whatWouldChangeMyMind
        ? `They told you what would change their mind: ${v.whatWouldChangeMyMind}`
        : "Go and disprove it with evidence, not argument.",
    });
  }

  // ---- worth fixing: weak severity -----------------------------------------
  if (winner && winner.meanSeverity < 50) {
    findings.push({
      severity: "worth fixing",
      headline: "The problem is real but mild",
      evidence: `Severity averaged ${winner.meanSeverity.toFixed(0)} of 100 among people who have it. Mild problems get survived, not solved.`,
      action:
        "Find the segment where this is acute rather than annoying. A narrow desperate market beats a broad indifferent one.",
    });
  }

  const fatal = findings.filter((f) => f.severity === "fatal").length;
  const serious = findings.filter((f) => f.severity === "serious").length;

  const verdict: Verdict =
    fatal > 0
      ? "fail"
      : serious >= 2 || (pvs && pvs.total < 45)
        ? "weak"
        : serious === 1 || (pvs && pvs.total < 65)
          ? "promising"
          : "strong";

  const callToAction =
    verdict === "fail"
      ? `Do not build more of this yet. ${findings[0].headline.toLowerCase()} — that is disqualifying on its own.`
      : verdict === "weak"
        ? "There is something here, but not the thing you are currently pitching."
        : verdict === "promising"
          ? "The problem is real. The case for it is not yet strong enough to survive diligence."
          : `${(payRate * 100).toFixed(0)}% would pay and ${(engagedRate * 100).toFixed(0)}% paid full attention. Go and get a signed design partner.`;

  return {
    verdict,
    callToAction,
    findings,
    nextStep: findings[0]?.action ?? "Get a paying design partner and come back with the contract.",
  };
}

/**
 * Turns an investment decision into something a founder can act on.
 *
 * A committee that says "conditional" and stops has told the founder nothing.
 * This names the seat that blocked it, what they need, and whether the pitch
 * or the company was the problem.
 */
export function explainVerdict(
  verdict: ICVerdict,
  objections: Objection[],
  roster: { id: string; role: string }[]
): { headline: string; because: string; toReopen: string } {
  const roleOf = (id: string) => roster.find((r) => r.id === id)?.role ?? id;

  const blocker = [...verdict.seatVotes].sort((a, b) => a.stance - b.stance)[0];
  const unanswered = objections.filter((o) => o.status !== "answered");
  const dodged = objections.filter((o) => o.status === "dodged");

  if (verdict.decision === "pass") {
    return {
      headline: "Pass",
      because: blocker
        ? `${roleOf(blocker.agentId)} would not move: ${blocker.position}`
        : "The committee did not find enough to underwrite.",
      toReopen:
        blocker?.whatWouldChangeMyMind ??
        "Come back with revenue. Nothing else reopens a pass.",
    };
  }

  if (verdict.decision === "conditional") {
    return {
      headline: "Conditional — not a yes",
      because: dodged.length
        ? `You dodged ${dodged.length} question${dodged.length === 1 ? "" : "s"}. In a real room that is the whole meeting: ${dodged[0].text}`
        : unanswered.length
          ? `${unanswered.length} challenge${unanswered.length === 1 ? " went" : "s went"} unanswered, starting with: ${unanswered[0].text}`
          : `${blocker ? roleOf(blocker.agentId) : "One partner"} is not convinced the market is big enough.`,
      toReopen: verdict.conditions[0] ?? verdict.comeBackWhen,
    };
  }

  return {
    headline: "Invest",
    because: `The room cleared it at ${verdict.score.toFixed(2)}${
      verdict.dissents.length
        ? `, over the objection of ${verdict.dissents.map(roleOf).join(" and ")}`
        : " without a dissent"
    }.`,
    toReopen: verdict.conditions[0] ?? "Move fast — conviction decays.",
  };
}
