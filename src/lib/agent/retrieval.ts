import fs from "node:fs";
import path from "node:path";
import type { EvidenceRef, QuestionKind } from "./types";

export interface MaterialFile {
  title: string;
  path: string;
  sourceType: EvidenceRef["sourceType"];
  sectionHint?: string;
}

export interface MaterialChunk {
  title: string;
  file: string;
  sourceType: EvidenceRef["sourceType"];
  section?: string;
  text: string;
}

const WORKBENCH_ROOT = process.cwd();
const CODE_ROOT = path.resolve(WORKBENCH_ROOT, "..");
const PROJECT_ROOT = path.resolve(CODE_ROOT, "..");

export const MATERIAL_FILES: ReadonlyArray<MaterialFile> = [
  {
    title: "课程任务书文本",
    path: path.resolve(PROJECT_ROOT, "pdf_text2.txt"),
    sourceType: "task_book",
    sectionHint: "任务书提取文本",
  },
  {
    title: "课程设计说明书草稿",
    path: path.resolve(CODE_ROOT, "说明书.md"),
    sourceType: "project_doc",
    sectionHint: "说明书",
  },
  {
    title: "课程设计审计报告",
    path: path.resolve(CODE_ROOT, "COURSE_DESIGN_AUDIT.md"),
    sourceType: "audit_doc",
    sectionHint: "审计报告",
  },
  {
    title: "最终审计报告",
    path: path.resolve(CODE_ROOT, "FINAL_AUDIT.md"),
    sourceType: "audit_doc",
    sectionHint: "最终审计",
  },
  {
    title: "计算链路说明",
    path: path.resolve(CODE_ROOT, "flow.md"),
    sourceType: "project_doc",
    sectionHint: "流程说明",
  },
  {
    title: "Agent API 路由",
    path: path.resolve(WORKBENCH_ROOT, "src", "app", "api", "agent", "route.ts"),
    sourceType: "code",
    sectionHint: "API 路由",
  },
  {
    title: "Agent 提示词",
    path: path.resolve(WORKBENCH_ROOT, "src", "lib", "agent", "prompts.ts"),
    sourceType: "code",
    sectionHint: "提示词",
  },
  {
    title: "Agent 上下文组装",
    path: path.resolve(WORKBENCH_ROOT, "src", "lib", "agent", "context.ts"),
    sourceType: "code",
    sectionHint: "上下文",
  },
  {
    title: "死水位计算代码",
    path: path.resolve(WORKBENCH_ROOT, "src", "lib", "engine", "deadLevel.ts"),
    sourceType: "code",
    sectionHint: "deadLevel",
  },
  {
    title: "保证出力计算代码",
    path: path.resolve(WORKBENCH_ROOT, "src", "lib", "engine", "firmPower.ts"),
    sourceType: "code",
    sectionHint: "firmPower",
  },
  {
    title: "调节流量计算代码",
    path: path.resolve(WORKBENCH_ROOT, "src", "lib", "engine", "dispatch.ts"),
    sourceType: "code",
    sectionHint: "dispatch",
  },
  {
    title: "防洪计算代码",
    path: path.resolve(WORKBENCH_ROOT, "src", "lib", "engine", "flood.ts"),
    sourceType: "code",
    sectionHint: "flood",
  },
  {
    title: "经济比较代码",
    path: path.resolve(WORKBENCH_ROOT, "src", "lib", "engine", "economic.ts"),
    sourceType: "code",
    sectionHint: "economic",
  },
];

let chunkCache: MaterialChunk[] | null = null;

export function getAllChunks(): MaterialChunk[] {
  return loadMaterialChunks();
}

export function retrieveMaterials(
  question: string,
  kind: QuestionKind,
  topK = 6,
): EvidenceRef[] {
  const chunks = loadMaterialChunks();
  const ranked = chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, question, kind),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return ranked.map(({ chunk, score }) => ({
    title: chunk.title,
    snippet: shortenSnippet(chunk.text, 240),
    sourceType: chunk.sourceType,
    file: chunk.file,
    section: chunk.section,
    relevance: Number(score.toFixed(2)),
  }));
}

function loadMaterialChunks(): MaterialChunk[] {
  if (chunkCache) return chunkCache;

  chunkCache = MATERIAL_FILES.flatMap((file) => {
    if (!fs.existsSync(file.path)) return [];
    const raw = safeRead(file.path);
    if (!raw) return [];

    return chunkText({
      title: file.title,
      file: path.relative(PROJECT_ROOT, file.path).replaceAll("\\", "/"),
      sourceType: file.sourceType,
      sectionHint: file.sectionHint,
      text: normalizeText(raw),
    });
  });

  return chunkCache;
}

function safeRead(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function chunkText(input: {
  title: string;
  file: string;
  sourceType: EvidenceRef["sourceType"];
  sectionHint?: string;
  text: string;
}): MaterialChunk[] {
  const pieces = input.text
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: MaterialChunk[] = [];
  let bucket: string[] = [];
  let currentSection = input.sectionHint;
  let currentLength = 0;

  const flush = () => {
    if (bucket.length === 0) return;
    chunks.push({
      title: input.title,
      file: input.file,
      sourceType: input.sourceType,
      section: currentSection,
      text: bucket.join("\n\n"),
    });
    bucket = [];
    currentLength = 0;
  };

  for (const piece of pieces) {
    const heading = inferSection(piece) ?? currentSection;
    const nextLength = currentLength + piece.length;

    if (nextLength > 900 && bucket.length > 0) {
      flush();
    }

    currentSection = heading;
    bucket.push(piece);
    currentLength += piece.length;

    if (piece.length > 700) {
      flush();
    }
  }

  flush();
  return chunks;
}

function inferSection(piece: string): string | undefined {
  const firstLine = piece.split("\n")[0]?.trim();
  if (!firstLine) return undefined;

  if (/^(#{1,6}|\d+[.、]|第.+[章节]|==========\s*Page)/.test(firstLine)) {
    return firstLine.slice(0, 80);
  }

  if (/^(export |function |const |interface |type )/.test(firstLine)) {
    return firstLine.slice(0, 80);
  }

  return undefined;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function tokenize(question: string): string[] {
  const normalized = question.toLowerCase();
  const terms = normalized.match(/[a-z0-9_]+|[\u4e00-\u9fff]{2,}/g) ?? [];
  const expanded = new Set<string>();

  for (const term of terms) {
    expanded.add(term);
    if (/^[\u4e00-\u9fff]+$/.test(term) && term.length >= 4) {
      for (let i = 0; i < term.length - 1; i += 1) {
        expanded.add(term.slice(i, i + 2));
      }
    }
  }

  return [...expanded].filter((term) => term.length >= 2);
}

export function scoreChunk(chunk: MaterialChunk, question: string, kind: QuestionKind): number {
  const haystack = `${chunk.title}\n${chunk.section ?? ""}\n${chunk.text}`.toLowerCase();
  const terms = tokenize(question);
  let score = 0;

  const wholeQuestion = question.trim().toLowerCase();
  if (wholeQuestion && haystack.includes(wholeQuestion)) {
    score += 6;
  }

  for (const term of terms) {
    const count = countOccurrences(haystack, term);
    if (count === 0) continue;

    score += term.length >= 4 ? Math.min(4, count) * 1.5 : Math.min(3, count) * 0.7;
    if ((chunk.section ?? "").toLowerCase().includes(term)) score += 1.2;
    if (chunk.title.toLowerCase().includes(term)) score += 1.2;
  }

  score += kindBonus(kind, chunk.sourceType);
  return score;
}

function kindBonus(kind: QuestionKind, sourceType: EvidenceRef["sourceType"]): number {
  if (kind === "checklist" || kind === "recommendation") {
    if (sourceType === "audit_doc") return 2.6;
    if (sourceType === "task_book") return 1.8;
  }

  if (kind === "indicator-source" || kind === "flood-explain") {
    if (sourceType === "code") return 2.1;
    if (sourceType === "task_book") return 1.8;
  }

  if (kind === "comparison") {
    if (sourceType === "project_doc") return 2.1;
    if (sourceType === "audit_doc") return 1.2;
  }

  return 0.4;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;

  let count = 0;
  let start = 0;
  while (start < haystack.length) {
    const idx = haystack.indexOf(needle, start);
    if (idx === -1) break;
    count += 1;
    start = idx + needle.length;
  }

  return count;
}

function shortenSnippet(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}
