import type { VentureFile } from "@/lib/types";

// ============================================================================
// MOCK VENTURE FILE — Track B owns this file.
//
// Written against the FROZEN types.ts. Track B builds the entire IC meeting
// against this until the hour-11 integration sync, so nothing here waits on
// Track A. At integration, Track A's real output must satisfy this exact
// shape; if it does not, types.ts is the arbiter.
//
// Deliberately seeded with pvs.total = 58, just under the 60 threshold, so the
// soft gate and the "pitch anyway" path are exercised every time we run.
// ============================================================================

export const MOCK_VENTURE_FILE: VentureFile = {
  id: "vf_mock_001",
  version: 1,

  solution:
    "An AI tool that plugs into your repo and automatically generates unit tests for untested code.",

  extractedProblems: [
    {
      id: "p1",
      statement: "Engineering teams ship code that has no test coverage.",
      whoHasIt: "Any team moving faster than its QA process.",
      severity: 45,
      frequency: "Continuous",
      currentWorkaround: "Coverage gates in CI that people mark as exempt.",
      willingnessToPay: "Low — treated as hygiene, not a budget line.",
      evidence: ["hub.sf.incumbents[0]"],
      confidence: 0.8,
    },
    {
      id: "p2",
      statement:
        "Teams cannot tell which of their untested code actually carries risk, so coverage work goes to the easy files instead of the dangerous ones.",
      whoHasIt:
        "Staff engineers and EMs accountable for incidents but not for coverage percentage.",
      severity: 82,
      frequency: "Every planning cycle, and acutely after every incident",
      currentWorkaround:
        "Tribal knowledge and a postmortem action item that expires in three weeks.",
      willingnessToPay:
        "High — this is charged to reliability budget, which is defended.",
      evidence: ["hub.sf.incumbents[1]", "hub.nyc.unserved"],
      confidence: 0.74,
    },
    {
      id: "p3",
      statement: "Writing tests is slow and engineers dislike doing it.",
      whoHasIt: "Individual developers.",
      severity: 38,
      frequency: "Daily",
      currentWorkaround: "They skip it.",
      willingnessToPay: "Near zero at the individual level.",
      evidence: [],
      confidence: 0.9,
    },
  ],

  // The reveal: the founder pitched p1, the agents surfaced p2.
  chosenProblem: {
    id: "p2",
    statement:
      "Teams cannot tell which of their untested code actually carries risk, so coverage work goes to the easy files instead of the dangerous ones.",
    whoHasIt:
      "Staff engineers and EMs accountable for incidents but not for coverage percentage.",
    severity: 82,
    frequency: "Every planning cycle, and acutely after every incident",
    currentWorkaround:
      "Tribal knowledge and a postmortem action item that expires in three weeks.",
    willingnessToPay:
      "High — this is charged to reliability budget, which is defended.",
    evidence: ["hub.sf.incumbents[1]", "hub.nyc.unserved"],
    confidence: 0.74,
  },

  hubFindings: {
    sf: {
      hubId: "sf",
      fitScore: 71,
      verdicts: [],
      gapSummary:
        "Dense with test-generation tools, empty on risk attribution. The buyers exist and already hold reliability budget.",
      incumbents: [
        {
          company: "Copilot-class test generation",
          solves: "Writes the test once you know which file to point at.",
          weakness: "Has no opinion about which file matters.",
        },
        {
          company: "Coverage dashboards",
          solves: "Reports the percentage.",
          weakness:
            "Treats every uncovered line as equally dangerous, which is why the number gets gamed.",
        },
      ],
      unserved:
        "Nobody ranks untested code by blast radius. That ranking is what the EM actually wants.",
    },
    nyc: {
      hubId: "nyc",
      fitScore: 58,
      verdicts: [],
      gapSummary:
        "Fintech and regulated buyers care intensely about risk attribution, but procurement is slow and they demand on-prem.",
      incumbents: [
        {
          company: "Enterprise SAST vendors",
          solves: "Compliance-grade static analysis.",
          weakness: "Priced and paced for audit cycles, not for engineers.",
        },
      ],
      unserved:
        "A developer-speed tool that still satisfies an auditor. Nobody sits in that middle.",
    },
  },

  pvs: {
    total: 58,
    problemSeverity: 82,
    marketGap: 64,
    hubFit: 65,
    evidenceStrength: 41,
    threshold: 60,
    passed: false,
  },

  // Track B fills these.
  pitchTranscript: [],
  objections: [],
};
