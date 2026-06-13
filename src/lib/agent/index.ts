/**
 * Agent 模块 — 统一导出
 *
 * 外部引用:
 *   import { buildContext, callLLM, classify } from "@/lib/agent";
 *   import type { AgentContext, AgentRequest, AgentResponse } from "@/lib/agent";
 */

export * from "./types";
export { buildContext, renderContextForLLM, renderFloodExtra, renderEnergyExtra, renderXingliExtra } from "./context";
export { runCompute } from "./compute";
export { callLLM, readLLMConfig } from "./llm";
export { classify } from "./classify";
export { SYSTEM_PROMPT, buildUserPrompt, buildLocalFallback } from "./prompts";
export { INDICATORS, FORMULAS, KEY_PARAMS, TASK_CHECKLIST, buildIndicatorTable } from "./indicators";
export { TOOL_DEFS, executeTool, toTraceEntry } from "./tools";
export { MATERIAL_FILES, getAllChunks, scoreChunk, tokenize } from "./retrieval";
