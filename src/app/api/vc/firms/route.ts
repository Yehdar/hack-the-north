import { NextResponse } from "next/server";
import { listFirms } from "@/data/firm";

export const runtime = "nodejs";

/** The room you can choose to walk into. */
export async function GET() {
  return NextResponse.json({ firms: listFirms() });
}
