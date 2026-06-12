/**
 * Agent 提示词层 — 问题分类
 *
 * 纯规则, 零 LLM 调用, 用来:
 *  1) 切换 user prompt 模板
 *  2) 决定往 context 里追加哪些专题段 (防洪/兴利/装机)
 *  3) 决定 system prompt 里的 "回答侧重" 一句
 *
 * 不认识的归 free, 走通用模板.
 */

import type { QuestionKind } from "./types";

interface ClassifyResult {
  kind: QuestionKind;
  /** 命中关键词 (调试用) */
  matchedKeywords: string[];
  /** 回答侧重 (会注入 system prompt 附加段) */
  focus: string;
  /** 需要追加的 context 段 */
  extraSections: Array<"flood" | "energy" | "xingli">;
}

export type { ClassifyResult };

const KEYWORDS: Record<QuestionKind, string[]> = {
  checklist: [
    "23", "二十三", "是否完成", "完成度", "任务书", "几项",
    "做了哪些", "完成了哪些", "还有哪些", "全部", "还差",
  ],
  comparison: [
    "为什么", "为什么最优", "比选", "推荐", "哪个好", "为什么是",
    "方案ii", "方案ii为什么", "更优", "最优", "比较",
  ],
  "indicator-source": [
    "从哪里来", "哪个数据", "哪个公式", "怎么算", "来源",
    "依据", "怎么得到", "怎么算出", "如何计算", "公式", "定义",
  ],
  "flood-explain": [
    "防洪", "洪水", "调洪", "汛限", "防洪限制", "设计洪水",
    "校核", "坝顶", "泄流", "防洪高", "为什么防洪",
    "等于正常蓄水位", "防洪限制水位", "为什么等于",
  ],
  recommendation: [
    "质疑", "被老师", "被老师质疑", "老师会问", "可能问题",
    "不足", "欠缺", "可以补", "完善", "改进", "答辩",
  ],
  // 元问题: 用户在问 agent 本身, 而非具体水利数据
  // 关键词特意放在"你", "什么", "功能"上, 避免误命中 checklist/comparison
  meta: [
    "你能干什么", "你能做什么", "你会什么", "你是什么", "你是谁",
    "介绍一下", "自我介绍一下", "功能", "能力", "help", "帮助",
    "怎么用", "如何使用", "怎么提问", "有什么用", "作用",
    "有什么", "有哪些", "介绍下", "介绍自己",
  ],
  free: [],
};

const FOCUS: Record<QuestionKind, string> = {
  checklist:
    "你正在做 **任务书 23 项指标完成度自检**. 重点是逐项列出哪些已完成、哪些是 partial/missing, 并给出每项的代码证据. " +
    "若某项是 partial 或 missing, 一定要明确指出老师可能质疑的点.",
  comparison:
    "你正在做 **方案比选论证**. 重点是把推荐方案与次优方案的年费用、PV_建、PV_防、PV_运 拆开, " +
    "并指出哪些项是 优势 (年费用更低的来源) / 哪些项是 劣势 (可解释的代价).",
  "indicator-source":
    "你正在做 **指标溯源**. 重点是把用户问到的那个指标: 公式 → 任务书页码 → 代码文件 → 关键中间值, " +
    "形成完整可追溯链, 老师问 '怎么算的' 时能直接答.",
  "flood-explain":
    "你正在做 **防洪专题解释**. 重点是三标准 (P=5% / 0.1% / 0.01%) 的差异, " +
    "起调水位为什么等于正常蓄水位 (V_结合=0 的物理原因), 坝顶高程取 max 的控制工况.",
  recommendation:
    "你正在做 **答辩前自查**. 重点是从老师视角列出这份报告可能的薄弱点: " +
    "防破坏线偏差、h_利 全负、防洪效益 5000 万上限等. 每条给可执行的修补建议.",
  // meta: 不引数据, 列表 5 类能力
  meta:
    "**用户在问你'能干什么', 不是问具体数据. 你必须切换到'功能介绍'模式**, 不要展开 23 项指标、不要讲方案对比.\n" +
    "回答结构:\n" +
    "1. 一句话身份: '我是这个课程设计的自检 Agent, 专门核查你算的对不对'.\n" +
    "2. 列出 **5 类典型问题** (checklist / comparison / flood-explain / indicator-source / recommendation), 每类配一个示例问题.\n" +
    "3. 提醒: 也可以随便问, 只要和本工程相关都会基于上下文答.\n" +
    "4. 总字数 ≤ 200. 不要凑话.",
  free: "请基于给出的工程上下文, 直接、简洁地回答用户问题.",
};

export function classify(question: string): ClassifyResult {
  const q = question.toLowerCase();
  const hits: Record<QuestionKind, string[]> = {
    checklist: [], comparison: [], "indicator-source": [],
    "flood-explain": [], recommendation: [], meta: [], free: [],
  };

  for (const kind of Object.keys(KEYWORDS) as QuestionKind[]) {
    for (const kw of KEYWORDS[kind]) {
      if (q.includes(kw.toLowerCase())) {
        hits[kind].push(kw);
      }
    }
  }

  // 取命中数最多的 (并列时按优先级顺序取第一)
  // meta 排在 free 前: 纯 "你能干什么" 类问, meta 胜
  // 但 checklist > meta: "你能告诉我 23 项是否完成吗" 里 checklist 命中更多, 仍走 checklist
  const PRIORITY: QuestionKind[] = [
    "checklist", "comparison", "flood-explain", "indicator-source", "recommendation", "meta", "free",
  ];
  let best: QuestionKind = "free";
  let bestCount = 0;
  for (const k of PRIORITY) {
    if (hits[k].length > bestCount) {
      best = k;
      bestCount = hits[k].length;
    }
  }

  // 决定 extra sections
  const extra: ClassifyResult["extraSections"] = [];
  if (best === "flood-explain") extra.push("flood");
  if (best === "comparison" || best === "recommendation") {
    extra.push("flood", "energy");
  }
  if (best === "indicator-source") {
    // 默认三个都加 (用户可能问任意指标)
    extra.push("flood", "energy", "xingli");
  }
  // meta / free / checklist: 不加额外段 (checklist 已经够长, 加了浪费)

  return {
    kind: best,
    matchedKeywords: hits[best],
    focus: FOCUS[best],
    extraSections: extra,
  };
}
