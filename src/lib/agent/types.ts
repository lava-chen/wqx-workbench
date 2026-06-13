export type SchemeKey = "I" | "II" | "III" | "IV";

export interface AgentParams {
  Q_SAFE: number;
  R0: number;
  Z_zheng_offset: Record<SchemeKey, number>;
  modified: boolean;
}

export interface SchemeFullResult {
  scheme: SchemeKey;
  Z_zheng: number;
  Z_dead: number;
  Z_xun: number;
  Z_fangshou: number;
  Z_design: number;
  Z_check: number;
  Z_dam: number;
  Z_dam1: number;
  Z_dam2: number;
  delta_h_design: number;
  delta_h_check: number;
  V_total: number;
  V_xing: number;
  V_fangshou: number;
  V_jiehe: number;
  Q_design_max: number;
  Q_check_max: number;
  Q_dump_avg: number;
  Np: number;
  N_ji_feng: number;
  N_ji_ji: number;
  N_ji: number;
  N_bei: number;
  N_bi: number;
  N_chong: number;
  N_y: number;
  E_avg: number;
  coef_xing: number;
  coef_tiao: number;
  eta: number;
  annual_total?: number;
  PV_build?: number;
  PV_fang?: number;
  PV_run?: number;
  annual_run?: number;
  B_fang?: number;
  fire_inv?: number;
}

export interface IndicatorCheck {
  index: number;
  name: string;
  unit: string;
  source: string;
  formula?: string;
  extractor: (s: SchemeFullResult) => number;
}

export interface TaskChecklistItem {
  id: string;
  title: string;
  requirement: string;
  status: "done" | "partial" | "missing";
  evidence: string;
  warning?: string;
}

export interface FormulaEntry {
  id: string;
  name: string;
  expression: string;
  source: string;
  notes?: string;
}

export interface SourceRef {
  file: string;
  section: string;
}

export interface EvidenceRef {
  title: string;
  snippet: string;
  sourceType: "task_book" | "project_doc" | "audit_doc" | "code" | "dataset_note";
  file: string;
  section?: string;
  relevance: number;
}

/** OpenAI 兼容 tool_call 描述 (LLM 返回的) */
export interface ToolCallRequest {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** 工具调用执行轨迹 (回传给前端展示) */
export interface ToolTraceEntry {
  round: number;
  name: string;
  args: string;
  ok: boolean;
  resultPreview: string;
  error?: string;
}

/** OpenAI 兼容 chat message (用于 llm.ts 内部循环) */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCallRequest[];
  tool_call_id?: string;
  name?: string;
}

export type QuestionKind =
  | "greeting"
  | "checklist"
  | "comparison"
  | "indicator-source"
  | "flood-explain"
  | "recommendation"
  | "meta"
  | "free";

export interface AgentContext {
  params: AgentParams;
  schemes: SchemeFullResult[];
  recommended: SchemeKey;
  indicators: IndicatorCheck[];
  indicatorTable: Array<{
    name: string;
    unit: string;
    values: Record<SchemeKey, number | undefined>;
  }>;
  taskChecklist: TaskChecklistItem[];
  formulas: FormulaEntry[];
  keyParams: Array<{ name: string; value: string; source: string }>;
}

export interface AgentRequest {
  question: string;
  history: Array<{ role: "user" | "agent"; content: string }>;
  overrides?: Partial<AgentParams>;
}

export interface AgentResponse {
  answer: string;
  sources: SourceRef[];
  evidence?: EvidenceRef[];
  toolTrace?: ToolTraceEntry[];
  debug?: {
    questionKind: QuestionKind;
    contextTokens: number;
    model?: string;
    toolRounds?: number;
  };
}
