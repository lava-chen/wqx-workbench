import { NextRequest, NextResponse } from "next/server";
import { classify } from "@/lib/agent/classify";
import { buildContext } from "@/lib/agent/context";
import { callLLM } from "@/lib/agent/llm";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/agent/prompts";
import { retrieveMaterials } from "@/lib/agent/retrieval";
import type { AgentContext, AgentRequest, AgentResponse, QuestionKind } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: AgentRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { question, history = [], overrides } = body ?? ({} as AgentRequest);
  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const ctx = buildContext({
    Q_SAFE: overrides?.Q_SAFE,
    R0: overrides?.R0,
    Z_zheng_offset: overrides?.Z_zheng_offset,
  });

  const cls = classify(question);
  const evidence = shouldRetrieve(cls.kind)
    ? retrieveMaterials(question, cls.kind, 6)
    : [];

  const t0 = Date.now();
  const result = await callLLM({ ctx, req: { question, history }, evidence });
  const elapsed = Date.now() - t0;

  console.log(
    `[agent] kind=${cls.kind} model=${result.model} ` +
    `fallback=${result.fallback} elapsed=${elapsed}ms ` +
    `evidence=${evidence.length} toolRounds=${result.toolRounds} ` +
    `tokens=${result.tokensIn ?? "?"}/${result.tokensOut ?? "?"}`,
  );

  const response: AgentResponse = {
    answer: result.answer,
    sources: result.sources,
    evidence: result.evidence,
    debug: {
      questionKind: cls.kind,
      contextTokens: estimatePromptTokens(ctx, { question, history }, cls.kind),
      model: result.model,
    },
  };

  return NextResponse.json(response);
}

function shouldRetrieve(kind: QuestionKind): boolean {
  return kind !== "greeting" && kind !== "meta";
}

function estimatePromptTokens(
  ctx: AgentContext,
  req: { question: string; history: Array<{ role: "user" | "agent"; content: string }> },
  kind: string,
): number {
  if (kind === "greeting") {
    const sys = SYSTEM_PROMPT.length;
    const q = req.question.length;
    return Math.ceil((sys + q + 50) / 1.6);
  }

  if (kind === "meta") {
    const sys = SYSTEM_PROMPT.length;
    return Math.ceil((sys + 280 + req.question.length) / 1.6);
  }

  try {
    const { prompt } = buildUserPrompt(ctx, req as AgentRequest);
    const sys = SYSTEM_PROMPT.length;
    return Math.ceil((sys + prompt.length) / 1.6);
  } catch {
    return 0;
  }
}
