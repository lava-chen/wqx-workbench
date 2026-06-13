/**
 * Agent 工具层 — OpenAI 兼容 function-calling schema + 执行端
 *
 * 三个工具, 全部基于 MATERIAL_FILES 白名单:
 *   1. list_materials    — 列出全部可查文件
 *   2. read_file         — 读单个文件全文 (受控于白名单)
 *   3. search_keywords   — 在全部 chunk 中按关键词检索
 *
 * 设计目标:
 *   - LLM 可主动拉资料, 不再被服务端预计算的 Top-6 截断
 *   - 严格白名单, 拒绝任意路径 (LLM 拿不到 list_materials 之外的 file)
 *   - 工具结果以 JSON 字符串回填, 长度受限, 避免爆 context
 */

import fs from "node:fs";
import path from "node:path";
import {
  MATERIAL_FILES,
  getAllChunks,
  scoreChunk,
  type MaterialFile,
} from "./retrieval";
import type { ToolTraceEntry } from "./types";

const WORKBENCH_ROOT = process.cwd();
const CODE_ROOT = path.resolve(WORKBENCH_ROOT, "..");
const PROJECT_ROOT = path.resolve(CODE_ROOT, "..");

/** OpenAI 兼容 tool 定义 (会原样发到 OpenRouter) */
export const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "list_materials",
      description:
        "列出钟大哥能查阅的全部资料文件 (任务书 / 说明书 / 审计 / 引擎代码 / agent 代码). " +
        "返回的 file 字段是相对项目根的路径, 可直接传给 read_file.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "读取某个资料文件全文. file 必须先用 list_materials 查到 (白名单). " +
        "max_chars 默认 5000, 上限 12000, 超长会自动截断并提示总长度.",
      parameters: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description: "list_materials 返回的 file 字段, 例 '../说明书.md'",
          },
          max_chars: {
            type: "number",
            description: "返回的最大字符数, 默认 5000, 上限 12000",
          },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_keywords",
      description:
        "在全部资料中按关键词搜索, 返回 Top-K 命中段落 (默认 top_k=5, 上限 12). " +
        "命中段落长 800 字符, 包含 file / section / 命中关键词. " +
        "适合'X 怎么算 / X 在哪个文件 / 引用了哪段任务书'类问题.",
      parameters: {
        type: "object",
        properties: {
          keywords: {
            type: "array",
            items: { type: "string" },
            description: "搜索关键词数组, 支持中英文, 至少 1 个",
          },
          top_k: {
            type: "number",
            description: "返回几条证据, 默认 5, 范围 1-12",
          },
        },
        required: ["keywords"],
      },
    },
  },
] as const;

export interface ToolExecResult {
  ok: boolean;
  /** JSON 字符串, 直接塞进 role:tool 消息 */
  content: string;
  error?: string;
}

const MAX_READ_CHARS = 12000;
const MAX_HITS = 12;
const SNIPPET_LEN = 800;

/** 入口 — 由 llm.ts 在 tool_call 循环里调用 */
export function executeTool(name: string, rawArgs: string): ToolExecResult {
  let args: Record<string, unknown> = {};
  if (rawArgs && rawArgs.trim()) {
    try {
      const parsed = JSON.parse(rawArgs);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      return fail(`invalid JSON arguments: ${rawArgs.slice(0, 120)}`);
    }
  }

  try {
    if (name === "list_materials") {
      return ok({ count: MATERIAL_FILES.length, items: listItems() });
    }
    if (name === "read_file") {
      return readFileTool(args);
    }
    if (name === "search_keywords") {
      return searchKeywordsTool(args);
    }
    return fail(`unknown tool: ${name}`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/** 辅助 — 给 llm.ts 用, 把执行结果压平成 ToolTraceEntry */
export function toTraceEntry(
  round: number,
  name: string,
  rawArgs: string,
  result: ToolExecResult,
): ToolTraceEntry {
  return {
    round,
    name,
    args: rawArgs.length > 200 ? `${rawArgs.slice(0, 200)}…` : rawArgs,
    ok: result.ok,
    resultPreview: result.content.length > 200
      ? `${result.content.slice(0, 200)}…`
      : result.content,
    error: result.error,
  };
}

// ── 工具实现 ─────────────────────────────────────────────

function listItems() {
  return MATERIAL_FILES.map((f) => ({
    title: f.title,
    file: toProjectRelative(f.path),
    kind: f.sourceType,
    section_hint: f.sectionHint ?? null,
  }));
}

function readFileTool(args: Record<string, unknown>): ToolExecResult {
  const fileRel = String(args.file ?? "").trim();
  if (!fileRel) return fail("file is required");

  const entry = findMaterial(fileRel);
  if (!entry) {
    return fail(
      `file 不在白名单: ${fileRel}. 请先调 list_materials 拿合法 file 列表`,
    );
  }

  const requested = Number(args.max_chars);
  const maxChars = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.max(Math.floor(requested), 200), MAX_READ_CHARS)
    : 5000;

  const raw = safeRead(entry.path);
  if (raw === null) return fail(`read failed: ${entry.path}`);

  const truncated = raw.length > maxChars;
  const content = truncated
    ? `${raw.slice(0, maxChars)}\n\n…(已截断, 原文件 ${raw.length} 字符)`
    : raw;

  return ok({
    file: fileRel,
    title: entry.title,
    length: raw.length,
    truncated,
    content,
  });
}

function searchKeywordsTool(args: Record<string, unknown>): ToolExecResult {
  const rawKeywords = args.keywords;
  if (!Array.isArray(rawKeywords) || rawKeywords.length === 0) {
    return fail("keywords 必填, 至少 1 个字符串");
  }
  const keywords = rawKeywords
    .map((k) => String(k).trim())
    .filter(Boolean);
  if (keywords.length === 0) return fail("keywords 不能全为空字符串");

  const requested = Number(args.top_k);
  const topK = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.max(Math.floor(requested), 1), MAX_HITS)
    : 5;

  const chunks = getAllChunks();
  const query = keywords.join(" ");
  const ranked = chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, query, "free"),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk, score }) => ({
      title: chunk.title,
      file: chunk.file,
      section: chunk.section ?? null,
      score: Number(score.toFixed(2)),
      snippet: shorten(chunk.text, SNIPPET_LEN),
    }));

  return ok({ keywords, top_k: topK, hits: ranked });
}

// ── 内部辅助 ─────────────────────────────────────────────

function findMaterial(fileRel: string): MaterialFile | undefined {
  const normalized = fileRel.replaceAll("\\", "/");
  return MATERIAL_FILES.find(
    (f) => toProjectRelative(f.path) === normalized,
  );
}

function toProjectRelative(absPath: string): string {
  return path.relative(PROJECT_ROOT, absPath).replaceAll("\\", "/");
}

function safeRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function shorten(text: string, max: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}

function ok(payload: unknown): ToolExecResult {
  return { ok: true, content: JSON.stringify(payload, null, 2) };
}

function fail(error: string): ToolExecResult {
  return { ok: false, content: JSON.stringify({ error }, null, 2), error };
}
