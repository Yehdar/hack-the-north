import { extractProblems } from "@/lib/discovery/problems";
import { aggregate, runCrowd } from "@/lib/discovery/crowd";
import { inferIndustries, selectRelevant } from "@/data/personas";
import { getLLM } from "@/lib/llm";
import type { ProblemStatement, VentureFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The crowd takes real time. Do not let a platform default cut it off midway.
export const maxDuration = 300;

// ============================================================================
// PART 1 — the discovery run, streamed.
//
//   split the solution into candidate problems
//     -> retrieve the crowd that should see it
//       -> deploy them onto the globe
//         -> react in batches, streaming
//           -> aggregate, and check whether the market's problem is the
//              founder's problem
//
// Streamed rather than returned, because the counting up IS the beat. A single
// response that resolves after forty seconds is the same data and a far worse
// product.
// ============================================================================

type RunRequest = {
  ventureFile?: VentureFile;
  solution?: string;
  crowdSize?: number;
  /** Skip extraction and use these instead — for the refine loop. */
  problems?: ProblemStatement[];
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as RunRequest | null;
  const solution = (body?.solution ?? body?.ventureFile?.solution ?? "").trim();

  if (!solution) {
    return new Response(JSON.stringify({ error: "solution required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const crowdSize = Math.min(Math.max(body?.crowdSize ?? 120, 20), 300);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        send({
          type: "start",
          provider: getLLM().name,
          industries: inferIndustries(solution).slice(0, 3),
        });

        // ---- ② problem split -------------------------------------------
        send({ type: "phase", phase: "problems", label: "Splitting the solution" });
        const problems = body?.problems?.length
          ? body.problems
          : await extractProblems(solution);

        if (problems.length === 0) throw new Error("no problems extracted");
        send({ type: "problems", problems });

        // ---- ③ deploy ---------------------------------------------------
        send({ type: "phase", phase: "deploy", label: "Deploying the crowd" });
        const hits = selectRelevant(solution, { limit: crowdSize });
        send({
          type: "deploy",
          personas: hits.map((h) => ({
            id: h.persona.id,
            name: h.persona.name,
            title: h.persona.title,
            hubId: h.persona.hubId,
            lat: h.persona.location.lat,
            lon: h.persona.location.lon,
            city: h.persona.location.city,
            why: h.why,
          })),
        });

        // ---- ④ react ----------------------------------------------------
        send({ type: "phase", phase: "react", label: "Listening" });
        const reactions = await runCrowd(
          solution,
          problems,
          hits.map((h) => h.persona),
          (progress) => send({ type: "reactions", ...progress })
        );

        // ---- ⑤ the reveal -----------------------------------------------
        const verdict = aggregate(reactions, problems);
        send({ type: "verdict", verdict });
        send({ type: "done" });
      } catch (err) {
        console.error("[discovery] failed", err);
        send({
          type: "error",
          message: err instanceof Error ? err.message : "discovery failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
