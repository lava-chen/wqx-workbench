import type { AgentContext, AgentRequest, EvidenceRef, SourceRef } from "./types";
import { buildLocalFallback, buildUserPrompt, SYSTEM_PROMPT } from "./prompts";
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
  evidence?: EvidenceRef[];
}

export interface LLMCallResult {
  answer: string;
  sources: SourceRef[];
  evidence?: EvidenceRef[];
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  fallback: boolean;
}

export async function callLLM({ ctx, req, evidence = [] }: LLMCallInput): Promise<LLMCallResult> {
  const cfg = readLLMConfig();
  const cls = classify(req.question);
  const base = buildUserPrompt(ctx, req, cls);
  const userPrompt = appendEvidenceSection(base.prompt, evidence);
  const mergedSources = mergeSources(base.sources, evidence);

  if (!cfg.apiKey) {
    const fallback = buildLocalFallback(ctx, req);
    return {
      answer: appendFallbackEvidenceNote(fallback.answer, evidence),
      sources: mergeSources(fallback.sources, evidence),
      evidence,
      model: "local-fallback",
      fallback: true,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
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
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    const answer: string = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!answer) {
      throw new Error("OpenRouter returned empty content");
    }

    return {
      answer,
      sources: mergedSources,
      evidence,
      model: cfg.model,
      tokensIn: data?.usage?.prompt_tokens,
      tokensOut: data?.usage?.completion_tokens,
      fallback: false,
    };
  } catch (error) {
    const fallback = buildLocalFallback(ctx, req);
    const message = error instanceof Error ? error.message : String(error);
    return {
      answer:
        `${appendFallbackEvidenceNote(fallback.answer, evidence)}\n\n---\n` +
        `> LLM 服务暂时不可用，已切换为本地回退答案。错误信息：\`${message}\``,
      sources: mergeSources(fallback.sources, evidence),
      evidence,
      model: `${cfg.model} (fallback)`,
      fallback: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

function appendEvidenceSection(prompt: string, evidence: EvidenceRef[]): string {
  if (evidence.length === 0) return prompt;

  const lines = evidence.map((item, index) =>
    [
      `### 证据 ${index + 1}`,
      `- 标题: ${item.title}`,
      `- 来源: ${item.file}${item.section ? ` / ${item.section}` : ""}`,
      `- 类型: ${item.sourceType}`,
      `- 相关度: ${item.relevance}`,
      `- 摘录: ${item.snippet}`,
    ].join("\n"),
  );

  return `${prompt}\n# 资料调查证据\n${lines.join("\n\n")}\n`;
}

function mergeSources(sources: SourceRef[], evidence: EvidenceRef[]): SourceRef[] {
  const merged = new Map<string, SourceRef>();

  for (const source of sources) {
    merged.set(`${source.file}::${source.section}`, source);
  }

  for (const item of evidence) {
    const source = {
      file: item.file,
      section: item.section ?? item.title,
    };
    merged.set(`${source.file}::${source.section}`, source);
  }

  return [...merged.values()];
}

function appendFallbackEvidenceNote(answer: string, evidence: EvidenceRef[]): string {
  if (evidence.length === 0) return answer;
  return `${answer}\n\n已补充本地资料调查结果，可结合下方证据继续核对。`;
}
