import type {
  AgentContext,
  AgentRequest,
  ChatMessage,
  EvidenceRef,
  SourceRef,
  ToolCallRequest,
  ToolTraceEntry,
} from "./types";
import { buildLocalFallback, buildUserPrompt, SYSTEM_PROMPT } from "./prompts";
import { classify } from "./classify";
import { executeTool, TOOL_DEFS, toTraceEntry } from "./tools";

const DEFAULT_MODEL = "qwen/qwen-2.5-7b-instruct";
const DEFAULT_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT = 45_000;
const MAX_TOOL_ROUNDS = 3;

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
  toolTrace?: ToolTraceEntry[];
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  toolRounds: number;
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
      toolRounds: 0,
      fallback: true,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    const trace: ToolTraceEntry[] = [];
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let answer = "";
    let lastModel = cfg.model;
    let rounds = 0;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
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
          messages,
          tools: TOOL_DEFS,
          tool_choice: "auto",
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
      const msg = data?.choices?.[0]?.message;
      if (data?.usage) {
        totalTokensIn += data.usage.prompt_tokens ?? 0;
        totalTokensOut += data.usage.completion_tokens ?? 0;
      }
      if (data?.model) lastModel = data.model;

      const toolCalls = (msg?.tool_calls ?? []) as ToolCallRequest[];

      // 终止条件: 没有 tool_calls, 把 content 当最终答案
      if (toolCalls.length === 0) {
        answer = (msg?.content ?? "").trim();
        if (!answer) {
          throw new Error("OpenRouter returned empty content (no tool_calls, no content)");
        }
        rounds = round;
        break;
      }

      // 把 assistant 这条消息 (含 tool_calls) 推回历史
      messages.push({
        role: "assistant",
        content: msg?.content ?? null,
        tool_calls: toolCalls,
      });

      // 执行每个 tool, 把结果推回历史
      for (const tc of toolCalls) {
        const result = executeTool(tc.function.name, tc.function.arguments);
        trace.push(toTraceEntry(round, tc.function.name, tc.function.arguments, result));
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: result.ok ? result.content : `[ERROR] ${result.error ?? "unknown"}`,
        });
      }

      // 已用满 max 轮 → 下一轮强制不要 tool_calls, 让 LLM 总结
      if (round === MAX_TOOL_ROUNDS - 1) {
        // 继续循环, 让最后一轮拿到 final answer
      }
    }

    if (!answer) {
      throw new Error("OpenRouter did not return a final answer after tool rounds");
    }

    return {
      answer,
      sources: mergedSources,
      evidence,
      toolTrace: trace,
      model: lastModel,
      tokensIn: totalTokensIn || undefined,
      tokensOut: totalTokensOut || undefined,
      toolRounds: rounds,
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
      toolRounds: 0,
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
