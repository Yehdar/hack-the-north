import { NextResponse } from "next/server";
import { preReadAll } from "@/lib/agents/vc/preread";
import { MOCK_VENTURE_FILE } from "@/mocks/ventureFile.mock";
import { SIMULATION_DISCLAIMER, getActiveFirm } from "@/data/firm";
import type { VentureFile } from "@/lib/types";

export const runtime = "nodejs";
// The seats fan out to the model; never cache the room's opinion.
export const dynamic = "force-dynamic";

/** GET — pre-read against the mock venture file. Development convenience. */
export async function GET() {
  return respond(MOCK_VENTURE_FILE);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const vf = (body?.ventureFile as VentureFile | undefined) ?? MOCK_VENTURE_FILE;

  if (!vf.solution?.trim()) {
    return NextResponse.json(
      { error: "ventureFile.solution is required" },
      { status: 400 }
    );
  }
  return respond(vf);
}

async function respond(vf: VentureFile) {
  const started = Date.now();
  try {
    const preReads = await preReadAll(vf);
    const firm = getActiveFirm();

    return NextResponse.json({
      firm: { id: firm.id, name: firm.name, decisionStyle: firm.decisionStyle },
      disclaimer: SIMULATION_DISCLAIMER,
      preReads,
      ms: Date.now() - started,
    });
  } catch (err) {
    console.error("[preread] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "pre-read failed" },
      { status: 500 }
    );
  }
}
