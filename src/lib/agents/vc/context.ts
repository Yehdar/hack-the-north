import type { VentureFile } from "@/lib/types";

// ============================================================================
// VentureFile -> prompt context. Track B owns this file.
//
// Reads ONLY Track A's fields plus Track B's own. Every section is optional,
// because during development Track A's half is empty and the seats still have
// to function. Missing discovery data is stated plainly rather than omitted —
// a seat that knows the founder skipped validation should say so.
// ============================================================================

export function ventureFileToContext(vf: VentureFile): string {
  const lines: string[] = [];

  lines.push(`THE FOUNDER'S SOLUTION, IN THEIR OWN WORDS:\n${vf.solution}`);

  if (vf.chosenProblem) {
    const p = vf.chosenProblem;
    lines.push(
      `\nTHE PROBLEM THEIR RESEARCH SAYS THEY ARE ACTUALLY SOLVING:
"${p.statement}"
  Who has it: ${p.whoHasIt}
  Severity: ${p.severity}/100 · Frequency: ${p.frequency}
  Current workaround: ${p.currentWorkaround}
  Willingness to pay: ${p.willingnessToPay}
  Research confidence: ${(p.confidence * 100).toFixed(0)}%`
    );

    const pitched = vf.extractedProblems[0];
    if (pitched && pitched.id !== p.id) {
      lines.push(
        `\nNOTE: they arrived believing they solved "${pitched.statement}". The research moved them. Probe whether they actually believe the new framing or are reciting it.`
      );
    }
  } else {
    lines.push(
      `\nNO VALIDATED PROBLEM STATEMENT. The founder has not established what problem this solves. This is itself a finding.`
    );
  }

  if (vf.pvs) {
    const s = vf.pvs;
    lines.push(
      `\nPROBLEM VALIDATION SCORE: ${s.total}/100 (threshold ${s.threshold}, ${s.passed ? "cleared" : "NOT cleared"})
  Problem severity ${s.problemSeverity} · Market gap ${s.marketGap} · Hub fit ${s.hubFit} · Evidence strength ${s.evidenceStrength}`
    );
    if (!s.passed) {
      lines.push(
        `  They chose to pitch anyway. Evidence strength of ${s.evidenceStrength} is the weakest component. Treat unsupported claims as expensive.`
      );
    }
  }

  const hubs = Object.values(vf.hubFindings);
  if (hubs.length > 0) {
    lines.push(`\nMARKET RESEARCH BY HUB:`);
    for (const h of hubs) {
      lines.push(
        `  ${h.hubId.toUpperCase()}, fit ${h.fitScore}/100. ${h.gapSummary}
    Incumbents: ${h.incumbents.map((i) => `${i.company} (weak: ${i.weakness})`).join("; ") || "none identified"}
    Unserved: ${h.unserved}`
      );
    }
  }

  if (vf.pitchTranscript.length > 0) {
    lines.push(
      `\nMEETING SO FAR:\n${vf.pitchTranscript
        .map((t) => `  [${t.turn}] ${t.speaker === "founder" ? "FOUNDER" : t.speaker.toUpperCase()}: ${t.text}`)
        .join("\n")}`
    );
  }

  const open = vf.objections.filter((o) => o.status !== "answered");
  if (open.length > 0) {
    lines.push(
      `\nCHALLENGES RAISED AND NOT YET ANSWERED:\n${open
        .map((o) => `  - (${o.seatId}, ${o.status}) ${o.text}`)
        .join("\n")}`
    );
  }

  return lines.join("\n");
}
