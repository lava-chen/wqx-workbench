/**
 * Agent LLM 适配器 — OpenRouter (Qwen)
 *
 * 环境变量:
 *   OPENROUTER_API_KEY   必填, OpenRouter 的 Bearer token
 *   OPENROUTER_MODEL     可选, 默认 "qwen/qwen-2.5-7b-instruct" (便宜)
 *   OPENROUTER_BASE_URL  可选, 默认 https://openrouter.ai/api/v1
 *   AGENT_LLM_TIMEOUT_MS 可选, 默认 45000
 *
 * 没配 key → 不抛错, 返回 null, 由调用方走本地兜底.
 */

import type { AgentContext, AgentRequest, SourceRef } from "./types";
import { buildUserPrompt, SYSTEM_PROMPT, buildLocalFallback } from "./prompts";
import { classify } from "./classify";

const DEFAULT_MODEL = "qwen/qwen-2.5-7b-instruct";
const DEFAULT_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT = 45_000;

export interface LLMConfig {
  apiKey: string | null;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}

export function readLLMConfig(): LLMConfig {
  return {
    apiKey: process.env.OPENROUTER_API_KEY?.trim() || null,
    model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
    baseUrl: process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE,
    timeoutMs: parseInt(process.env.AGENT_LLM_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT,
  };
}

export interface LLMCallInput {
  ctx: AgentContext;
  req: AgentRequest;
}

export interface LLMCallResult {
  answer: string;
  sources: SourceRef[];
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  fallback: boolean; // true = 走本地兜底 (无 key / 出错)
}

/** 主入口: 给定 context + question, 拿答案 */
export async function callLLM({ ctx, req }: LLMCallInput): Promise<LLMCallResult> {
  const cfg = readLLMConfig();
  const cls = classify(req.question);
  const { prompt: userPrompt, sources } = buildUserPrompt(ctx, req, cls);

  if (!cfg.apiKey) {
    const fb = buildLocalFallback(ctx, req);
    return {
      answer: fb.answer,
      sources: fb.sources,
      model: "local-fallback",
      fallback: true,
    };
  }

  // 调 OpenRouter (OpenAI 兼容)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter 推荐的几个, 不影响功能, 但会出现在 dashboard
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:3000",
        "X-Title": "wqx-workbench agent",
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1800,
        temperature: 0.2,
        // Qwen 支持的 stop / response_format 按需开启, 这里先不锁
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    const answer: string = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!answer) throw new Error("OpenRouter returned empty content");

    return {
      answer,
      sources,
      model: cfg.model,
      tokensIn: data?.usage?.prompt_tokens,
      tokensOut: data?.usage?.completion_tokens,
      fallback: false,
    };
  } catch (err) {
    // 出错 → 走本地兜底, 不让前端崩
    const fb = buildLocalFallback(ctx, req);
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      answer: `${fb.answer}\n\n---\n> ⚠ LLM 调用失败, 已降级到本地兜底. 错误: \`${errMsg}\``,
      sources: fb.sources,
      model: `${cfg.model} (fallback)`,
      fallback: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
