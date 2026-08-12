import { NextRequest, NextResponse } from "next/server";
import { MultiLLM } from "@/lib/multi-llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const multiLLM = new MultiLLM();

export async function POST(req: NextRequest) {
  let prompt = "";
  try {
    const body = await req.json();
    prompt = typeof body?.prompt === "string" ? body.prompt : "";
  } catch {
    // fall through to the empty-prompt error below
  }

  if (!prompt.trim()) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  try {
    const result = await multiLLM.query(prompt);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Ensemble query failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ models: multiLLM.getStats().models });
}
