import { NextResponse } from "next/server";
import { refinePitch } from "@/lib/discovery/refine";
import type { ProblemStatement } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RefineRequest = { solution?: string; problem?: ProblemStatement };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as RefineRequest | null;
  const solution = body?.solution?.trim();

  if (!solution || !body?.problem?.statement) {
    return NextResponse.json({ error: "solution and problem are required" }, { status: 400 });
  }

  return NextResponse.json({ solution: await refinePitch(solution, body.problem) });
}
