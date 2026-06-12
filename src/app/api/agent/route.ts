/**
 * /api/agent — Next.js Route Handler
 *
 * 接 AgentAuditPage 的 POST { question, history }, 返回 { answer, sources }
 *
 * 行为:
 *  1) 装配 AgentContext (server 端跑引擎, 跟前端 useAllResults 一致)
 *  2) 调 LLM (有 key) 或本地兜底 (无 key)
 *  3) 返回标准化响应
 */

import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/agent/context";
import { callLLM } from "@/lib/agent/llm";
import { classify } from "@/lib/agent/classify";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/agent/prompts";
import type { AgentRequest, AgentResponse } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: AgentRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const { question, history = [], overrides } = body ?? ({} as AgentRequest);

  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json(
      { error: "question is required" },
      { status: 400 },
    );
  }

  // 1) 装配 context
  const ctx = buildContext({
    Q_SAFE: overrides?.Q_SAFE,
    R0: overrides?.R0,
    Z_zheng_offset: overrides?.Z_zheng_offset,
  });

  // 2) 调 LLM
  const t0 = Date.now();
  const result = await callLLM({ ctx, req: { question, history } });
  const elapsed = Date.now() - t0;

  // 3) 调试信息 (server console)
  const cls = classify(question);
  // eslint-disable-next-line no-console
  console.log(
    `[agent] kind=${cls.kind} model=${result.model} ` +
    `fallback=${result.fallback} elapsed=${elapsed}ms ` +
    `tokens=${result.tokensIn ?? "?"}/${result.tokensOut ?? "?"}`,
  );

  const response: AgentResponse = {
    answer: result.answer,
    sources: result.sources,
    debug: {
      questionKind: cls.kind,
      contextTokens: estimatePromptTokens(ctx, { question, history }, cls.kind),
      model: result.model,
    },
  };
  return NextResponse.json(response);
}

/** 估 LLM 实际看到的 prompt 长度 (中英混合粗估: 中文 1 字 ≈ 1.6 token) */
function estimatePromptTokens(
  ctx: import("@/lib/agent/types").AgentContext,
  req: { question: string; history: any[] },
  kind: string,
): number {
  // meta 类的 prompt 是 project-info 摘要, 走轻量路径
  if (kind === "meta") {
    const sys = SYSTEM_PROMPT.length;
    const proj = 80; // 项目背景段
    const focus = 200; // meta 回答侧重
    const q = req.question.length;
    return Math.ceil((sys + proj + focus + q) / 1.6);
  }
  // 其他类: 跑一次 buildUserPrompt, 用真实长度
  try {
    const { prompt } = buildUserPrompt(ctx, req as any);
    const sys = SYSTEM_PROMPT.length;
    return Math.ceil((sys + prompt.length) / 1.6);
  } catch {
    return 0;
  }
}
