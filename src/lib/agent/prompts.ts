/**
 * Agent 提示词层 — 模板
 *
 * 设计目标:
 *  - Qwen 7B/14B 友好: 结构化, 短句, 关键信息在 <8k tokens 内
 *  - system: 角色 + 边界 + 格式 + 引用规则
 *  - user: context (按需追加段) + 问题 + 短历史
 *  - 不依赖任何外部库, 纯字符串拼接
 */

import type { AgentContext, AgentRequest, SourceRef } from "./types";
import {
  renderContextForLLM,
  renderFloodExtra,
  renderEnergyExtra,
  renderXingliExtra,
} from "./context";
import { classify, type ClassifyResult } from "./classify";

/** system prompt — 注入到每次对话 */
export const SYSTEM_PROMPT = `你是"五强溪水利计算课程设计"的智能助手.

## 角色
你是河海大学水文水资源学院的课程设计助手, 主要帮作者 (本科) 核查计算报告中的 23 项水利指标是否完成、每个指标从何而来、方案比选是否站得住脚. 你的读者是任课老师.

但你不是冷冰冰的自检机器, 也是一个**支持正常寒暄**的对话方. 用户说"你好"你也回"你好", 不要每次都列 23 项.

## 知识边界
- 涉及水利工程的具体数字 / 公式 / 文件路径, 你的信息源是下方 [工程上下文] + [任务书 2024 年 5 月] 的一般知识.
- 不知道的事 → 直接说"上下文未提供", **不要编造数字**.
- 任务书页码 / 公式 / 代码文件名 是引用依据, 务必给出.
- 涉及具体数字, 必须从上下文里取; 不得四舍五入到 2 位以上, 不要"约""大致"等模糊词.
- 寒暄/闲聊/打招呼, 不需要任何工程上下文, 正常回应即可.

## 输出格式
- 用 **Markdown**, 但避免用 H1 (#), 用 H2 (##) / H3 (###) 即可.
- 短句为主, 关键数字用 \`代码块\` 或加粗.
- 列出指标 / 方案对比时, 用 markdown 表格, **不要用 emoji** (除非引述任务书原话).
- 涉及推荐方案 / 警示点, 显式标 **"建议:"** / **"⚠"**.
- 寒暄时, 简短, ≤ 50 字, 不要带 markdown 表格/标题.

## 引用规则 (仅对数据类问题生效)
- 指标溯源时, 给完整链: 公式 → 任务书 pX → 代码文件:函数
- 不要捏造文件路径, 上下文里有的才能用.
- "证据" 字段已经在上下文里, 直接复用.

## 风格
- 数据问题: 直接, 不寒暄, 老师视角, 偏严谨可解释可追溯.
- 寒暄/闲聊: 正常, 自然, 像人一样. 不要"请问您需要什么"那种客服腔.
- 不确定就明说, 不要为了"显得专业"凑话.
`;

/** 构造 user prompt */
export function buildUserPrompt(
  ctx: AgentContext,
  req: AgentRequest,
  cls: ClassifyResult = classify(req.question),
): { prompt: string; sources: SourceRef[] } {
  // greeting 类: 极简 prompt, 完全不灌上下文
  if (cls.kind === "greeting") {
    return {
      prompt: `# 用户寒暄\n${req.question}\n\n# 任务\n简短自然回应, ≤ 50 字. 顺手提一下能帮的 5 类问题.`,
      sources: [],
    };
  }

  const blocks: string[] = [];

  // (1) 工程上下文
  //    - meta 类例外: 用户在问"你能干什么", 灌 3000 字指标表会让 Qwen 7B 误以为要背数据
  //    - 只给一段极简的项目标识, 让回答有归属感
  if (cls.kind === "meta") {
    blocks.push("# 项目背景");
    blocks.push(`- 项目: 五强溪水利计算课程设计 (河海大学, 2024 年 5 月)`);
    blocks.push(`- 推荐方案: ${ctx.recommended} 方案`);
    blocks.push(`- 当前参数: ${ctx.params.modified ? "用户自定义" : "任务书默认值"}`);
    blocks.push("");
  } else {
    blocks.push("# 工程上下文");
    blocks.push(renderContextForLLM(ctx));
    for (const sec of cls.extraSections) {
      if (sec === "flood")  blocks.push(renderFloodExtra(ctx));
      if (sec === "energy") blocks.push(renderEnergyExtra(ctx));
      if (sec === "xingli") blocks.push(renderXingliExtra(ctx));
    }
  }

  // (2) 短历史 (meta 类不带历史, 避免污染功能介绍)
  //    注意: greeting 类已在函数顶部 early return, 此处 cls.kind 已不含 "greeting"
  if (cls.kind !== "meta" && req.history.length > 0) {
    const recent = req.history.slice(-6); // 3 轮 user+agent
    blocks.push("# 对话历史 (最近)");
    for (const m of recent) {
      const tag = m.role === "user" ? "👤 用户" : "🤖 Agent";
      // 截断, 避免超长
      const text = m.content.length > 600
        ? m.content.slice(0, 600) + "…(已截断)"
        : m.content;
      blocks.push(`> ${tag}: ${text.replace(/\n/g, "\n> ")}`);
    }
    blocks.push("");
  }

  // (3) 当前问题 + 引导
  blocks.push("# 当前问题");
  blocks.push(req.question);
  blocks.push("");

  // (4) 回答侧重 (注入自分类)
  blocks.push("# 回答侧重");
  blocks.push(cls.focus);
  blocks.push("");

  // (5) 引用要求 (meta 类不需要引用; greeting 已在顶部 return)
  if (cls.kind !== "meta") {
    blocks.push("# 引用要求");
    blocks.push("- 引用任务书 / 代码时, 在文末用 `参考来源:` 列出来源条目 (例: '任务书 p13 调洪演算', 'curves.ts:discharge_capacity')");
    blocks.push("- 如果用户问'23 项是否完成', 一定要逐条回答, 不能合并.");
    blocks.push("- 如果推荐方案与用户认知冲突, 解释原因, 不要回避.");
  }

  return {
    prompt: blocks.join("\n"),
    sources: deriveSources(cls, ctx),
  };
}

/** 根据分类派生"应该引用的来源" — 给前端 MessageBubble 渲染 */
function deriveSources(
  cls: ClassifyResult,
  ctx: AgentContext,
): SourceRef[] {
  // greeting / meta 类: 不引任何来源, footer 不渲染
  if (cls.kind === "greeting" || cls.kind === "meta") return [];

  const base: SourceRef[] = [
    { file: "任务书 p7 表 1", section: "23 项水利指标汇总" },
    { file: "代码/src/lib/engine", section: "水利计算引擎 (TypeScript 复刻 Python)" },
  ];

  if (cls.extraSections.includes("flood")) {
    base.push({ file: "任务书 p13-15", section: "三、调洪演算" });
    base.push({ file: "代码/wqx-workbench/src/lib/engine/flood.ts", section: "flood_routing" });
  }
  if (cls.extraSections.includes("energy")) {
    base.push({ file: "任务书 p10-13", section: "装机容量 / 多年平均电能" });
    base.push({ file: "代码/wqx-workbench/src/lib/engine/installed.ts", section: "calcInstalled" });
    base.push({ file: "代码/wqx-workbench/src/lib/engine/energy.ts", section: "find_repeat_capacity" });
  }
  if (cls.extraSections.includes("xingli")) {
    base.push({ file: "任务书 p8", section: "死水位" });
    base.push({ file: "任务书 p9", section: "保证出力" });
    base.push({ file: "代码/wqx-workbench/src/lib/engine/deadLevel.ts", section: "computeDeadLevel" });
  }
  if (cls.kind === "comparison") {
    base.push({ file: "任务书 p16-20", section: "经济比较" });
    base.push({ file: "代码/wqx-workbench/src/lib/engine/economic.ts", section: "economic_compare" });
  }
  if (cls.kind === "recommendation") {
    base.push({ file: "代码/COURSE_DESIGN_AUDIT.md", section: "12 项自检" });
  }
  if (ctx.params.modified) {
    base.push({ file: "用户输入", section: "当前参数已偏离任务书默认值" });
  }
  return base;
}

/** 仅在无 LLM key 时的本地兜底回答 — 让 UI 立刻可用 */
export function buildLocalFallback(
  ctx: AgentContext,
  req: AgentRequest,
): { answer: string; sources: SourceRef[] } {
  const cls = classify(req.question);
  const summary = summarizeContextForLocal(ctx);

  let body = "";
  if (cls.kind === "checklist") {
    const done = ctx.taskChecklist.filter(t => t.status === "done").length;
    const partial = ctx.taskChecklist.filter(t => t.status === "partial").length;
    const missing = ctx.taskChecklist.filter(t => t.status === "missing").length;
    body = `任务书完成度自检 (共 ${ctx.taskChecklist.length} 项):\n\n` +
      `- ✓ 已完成: **${done}** 项\n` +
      `- △ 部分完成: **${partial}** 项 (有偏差/可改进)\n` +
      `- ✗ 缺失: **${missing}** 项\n\n` +
      `⚠ **未配置 LLM Key**, 仅返回框架式答案. 配置 OPENROUTER_API_KEY 后会逐条展开证据.\n\n` +
      `**关键薄弱项:**\n` +
      ctx.taskChecklist
        .filter(t => t.status === "partial" || t.status === "missing")
        .map(t => `- [${t.id}] ${t.title} — ${t.warning ?? t.requirement}`)
        .join("\n");
  } else if (cls.kind === "comparison") {
    const rows = ctx.schemes
      .map(s => `方案 ${s.scheme}: 年费用 ${s.annual_total?.toFixed(0)} 万元`)
      .join("  |  ");
    body = `当前推荐方案: **${ctx.recommended}** (年费用最低)\n\n` +
      `4 方案年费用对比: ${rows}\n\n` +
      `⚠ **未配置 LLM Key**, 仅返回核心数字. 配置后会自动展开"为什么 II 比 I 省"的具体差异.\n\n` +
      summary;
  } else if (cls.kind === "meta") {
    // meta 类本地兜底: 5 类能力清单 (无数据, 无引用)
    body = `我是这个 **五强溪水利计算课程设计** 的自检 Agent, 专门核查你算的对不对.\n\n` +
      `我能帮你做 5 类事:\n\n` +
      `1. **任务书自检** — "23 项水利指标是否全部完成?"\n` +
      `2. **方案比选** — "方案 II 为什么最优?"\n` +
      `3. **防洪专题** — "防洪限制水位为什么等于正常蓄水位?"\n` +
      `4. **指标溯源** — "某指标从哪个数据/公式来的?"\n` +
      `5. **答辩自查** — "当前报告有哪些可能被老师质疑的地方?"\n\n` +
      `也可以随便问, 只要和本工程相关我都会基于上下文作答.\n\n` +
      `⚠ **未配置 LLM Key**, 上面是固定模板. 配置 OPENROUTER_API_KEY 后会基于你的工程上下文动态回答.`;
  } else if (cls.kind === "greeting") {
    // greeting 类本地兜底: 简短自然回应
    body = `你好! 我是这个水利计算课程设计的助手, 能帮你看 5 类问题: 任务书自检 / 方案比选 / 防洪 / 溯源 / 答辩自查.\n\n` +
      `⚠ **未配置 LLM Key**, 走本地兜底. 配置 OPENROUTER_API_KEY 后会基于你的工程上下文动态回答.`;
  } else {
    body = `已收到问题: "${req.question}"\n\n` +
      `⚠ **未配置 LLM Key**, 走本地兜底. 请在 .env.local 中设置 OPENROUTER_API_KEY 后重启.\n\n` +
      `已为你装配好的工程上下文 (摘要):\n\n` + summary;
  }

  return { answer: body, sources: deriveSources(cls, ctx) };
}

function summarizeContextForLocal(ctx: AgentContext): string {
  const lines: string[] = [];
  lines.push("## 23 项水利指标");
  lines.push("| 指标 | 单位 | I | II | III | IV |");
  lines.push("|---|---|---|---|---|---|");
  for (let i = 0; i < ctx.indicators.length; i++) {
    const def = ctx.indicators[i];
    const row = ctx.indicatorTable[i];
    const cells = (["I", "II", "III", "IV"] as const).map(sk => {
      const v = row.values[sk];
      return v == null || !Number.isFinite(v) ? "—" : v.toFixed(2);
    });
    lines.push(`| ${def.name} | ${def.unit} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}
