/**
 * Agent 数据层 — 类型定义
 *
 * AgentContext 是 LLM 看世界的"完整画面":
 *  - 当前用户参数
 *  - 4 方案完整水利指标
 *  - 任务书 23 项指标检查表
 *  - 关键公式/参数/数据来源
 *  - 经济比较结果
 *
 * 所有字段都设计为可直接渲染到 LLM prompt 的"自描述"结构,
 * 即每个字段都自带 name/unit/sources, 拼装时不需要再去查表.
 */

export type SchemeKey = "I" | "II" | "III" | "IV";

/** 当前用户调整后的参数 (与 useParams 保持一致) */
export interface AgentParams {
  Q_SAFE: number;        // m³/s  下游安全泄量
  R0: number;            //       折算率
  Z_zheng_offset: Record<SchemeKey, number>; // 4 方案正常蓄水位调整值
  modified: boolean;     // 是否相对默认值有调整
}

/** 单个方案的完整水利指标 (来自 build_table + 经济层) */
export interface SchemeFullResult {
  scheme: SchemeKey;
  // 水位 (m)
  Z_zheng: number;
  Z_dead: number;
  Z_xun: number;          // 汛限
  Z_fangshou: number;     // 防洪高
  Z_design: number;       // 设计洪水位
  Z_check: number;        // 校核洪水位
  Z_dam: number;          // 坝顶高程
  Z_dam1: number;
  Z_dam2: number;
  delta_h_design: number;
  delta_h_check: number;
  // 库容 (亿 m³)
  V_total: number;
  V_xing: number;
  V_fangshou: number;
  V_jiehe: number;
  // 流量 (m³/s)
  Q_design_max: number;
  Q_check_max: number;
  Q_dump_avg: number;
  // 出力/电能
  Np: number;             // 万 kW
  N_ji_feng: number;
  N_ji_ji: number;
  N_ji: number;
  N_bei: number;
  N_bi: number;           // 万 kW  必需容量
  N_chong: number;        // 万 kW  重复容量
  N_y: number;            // 万 kW  装机容量
  E_avg: number;          // 亿度  多年平均电能
  // 系数
  coef_xing: number;
  coef_tiao: number;
  eta: number;            // 径流利用系数
  // 经济 (万元)
  annual_total?: number;
  PV_build?: number;
  PV_fang?: number;
  PV_run?: number;
  annual_run?: number;
  B_fang?: number;
  fire_inv?: number;
}

/** 23 项指标检查清单中的一项 (来自任务书 p7 表 1) */
export interface IndicatorCheck {
  index: number;          // 1..23
  name: string;           // 中文名
  unit: string;
  source: string;         // 任务书 pX / 公式 / 代码文件
  formula?: string;       // 关键公式 (可选)
  /** 从 schemes 矩阵中提取该指标值的函数 (避免重复存数) */
  extractor: (s: SchemeFullResult) => number;
}

/** 任务书完成度检查 */
export interface TaskChecklistItem {
  id: string;             // e.g. "T-3.1"
  title: string;          // e.g. "死水位选择"
  requirement: string;    // 任务书原话/转述
  status: "done" | "partial" | "missing";
  evidence: string;       // 落到哪个文件/函数/章节
  warning?: string;       // 若 partial/missing, 老师可能质疑的点
}

/** 公式速查 (用于 LLM 引用) */
export interface FormulaEntry {
  id: string;             // e.g. "F-N"
  name: string;           // "出力公式"
  expression: string;     // "N = K·q·H"
  source: string;         // 任务书 p9
  notes?: string;         // 参数取值说明
}

/** 来源引用 (供前端 MessageBubble 渲染参考来源) */
export interface SourceRef {
  file: string;           // "任务书 p13"
  section: string;        // "三、调洪演算"
}

/** 问题分类 (用于切换 prompt 策略) */
export type QuestionKind =
  | "greeting"            // 寒暄: "你好" / "在吗" / "谢谢" — 不灌上下文
  | "checklist"           // 23 项是否完成
  | "comparison"          // 方案 II 为什么最优
  | "indicator-source"    // 某个指标从哪里来
  | "flood-explain"       // 防洪相关解释
  | "recommendation"      // 报告被质疑的点
  | "meta"                // 元问题: "你能干什么" / "你是谁" / "怎么用"
  | "free";               // 自由问答

/** LLM 看到的完整上下文 (送进 prompt) */
export interface AgentContext {
  params: AgentParams;
  schemes: SchemeFullResult[];
  recommended: SchemeKey;        // 默认 "II"
  indicators: IndicatorCheck[];  // 23 项 (含 extractor)
  indicatorTable: Array<{
    name: string;
    unit: string;
    values: Record<SchemeKey, number | undefined>;
  }>;
  taskChecklist: TaskChecklistItem[];
  formulas: FormulaEntry[];
  keyParams: Array<{ name: string; value: string; source: string }>;
}

/** 发送给 LLM 的请求 */
export interface AgentRequest {
  question: string;
  history: Array<{ role: "user" | "agent"; content: string }>;
  /** 客户端可选附带当前 UI 状态 (覆盖 server 默认计算) */
  overrides?: Partial<AgentParams>;
}

/** LLM 返回的标准化响应 */
export interface AgentResponse {
  answer: string;
  sources: SourceRef[];
  /** 调试用: 本次用到的关键上下文摘要 (无 key 时返回) */
  debug?: {
    questionKind: QuestionKind;
    contextTokens: number;
    model?: string;
  };
}
