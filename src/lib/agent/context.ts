/**
 * Agent 数据层 — Context 装配
 *
 * 职责: 把 runCompute 的输出 + 静态知识库 (indicators / formulas / tasks) 合并成
 * 一个 AgentContext, 供提示词层直接消费.
 *
 * 拼装原则:
 *  - LLM 看到的 context 应 "开箱即用" — 不需要再去查表
 *  - 数值带单位, 来源带文件名, 任务带状态
 *  - context 总长控制在 ~3000 tokens 以内, 走 7B 模型也够用
 */

import {
  INDICATORS,
  FORMULAS,
  KEY_PARAMS,
  TASK_CHECKLIST,
  buildIndicatorTable,
} from "./indicators";
import { runCompute, type ComputeInput } from "./compute";
import type {
  AgentContext,
  AgentParams,
  SchemeFullResult,
  SchemeKey,
} from "./types";

const SCHEMES_ORDER: SchemeKey[] = ["I", "II", "III", "IV"];

/** 装配入口 */
export function buildContext(input: ComputeInput = {}): AgentContext {
  const { schemes, recommended, params } = runCompute(input);

  // 把 4 方案按 I/II/III/IV 排序
  const ordered = SCHEMES_ORDER.map(
    sk => schemes.find(s => s.scheme === sk)!,
  );

  return {
    params,
    schemes: ordered,
    recommended,
    indicators: INDICATORS,
    indicatorTable: buildIndicatorTable(ordered, INDICATORS),
    taskChecklist: TASK_CHECKLIST,
    formulas: FORMULAS,
    keyParams: KEY_PARAMS,
  };
}

/**
 * 把 AgentContext 渲染成 LLM 可读的纯文本块 (用于塞进 user prompt).
 *
 * 设计: 三个清晰段 — (1) 参数 (2) 23 指标矩阵 (3) 任务完成度
 * 公式 / 防洪 / 经济 等细节按需选择性追加 (由 prompts.ts 决定)
 */
export function renderContextForLLM(ctx: AgentContext): string {
  const lines: string[] = [];

  // ── 1. 当前参数 ──
  lines.push("## 1. 当前计算参数");
  lines.push(
    `- 安全泄量 Q_安 = ${ctx.params.Q_SAFE} m³/s` +
    (ctx.params.Q_SAFE === 20000 ? " (任务书原值)" : " (用户已改)"),
  );
  lines.push(
    `- 折算率 r₀ = ${ctx.params.R0}` +
    (ctx.params.R0 === 0.10 ? " (任务书原值)" : " (用户已改)"),
  );
  for (const sk of SCHEMES_ORDER) {
    const off = ctx.params.Z_zheng_offset[sk];
    if (off !== 0) {
      lines.push(`- 方案 ${sk} 正常蓄水位 ${off > 0 ? "+" : ""}${off} m (用户已改)`);
    }
  }
  if (ctx.params.modified) {
    lines.push("⚠ 用户当前使用非默认参数, 部分指标可能与说明书不一致.");
  }
  lines.push("");

  // ── 2. 23 指标矩阵 ──
  lines.push("## 2. 23 项水利指标 (按任务书 p7 表 1)");
  lines.push("| 序号 | 指标 | 单位 | I | II | III | IV |");
  lines.push("|---|---|---|---|---|---|---|");
  for (let i = 0; i < ctx.indicators.length; i++) {
    const def = ctx.indicators[i];
    const row = ctx.indicatorTable[i];
    const cells = SCHEMES_ORDER.map(sk => {
      const v = row.values[sk];
      return formatCell(def.unit, v);
    });
    lines.push(
      `| ${def.index} | ${def.name} | ${def.unit} | ${cells.join(" | ")} |`,
    );
  }
  lines.push("");
  lines.push(`推荐方案: **${ctx.recommended}** (年费用最低)`);
  lines.push("");

  // ── 3. 经济比较 (回答"为什么最优"必看) ──
  lines.push("## 3. 经济比较");
  lines.push("| 方案 | 年费用 (万元) | PV_建 | PV_防 (负) | PV_运 | B_防 |");
  lines.push("|---|---|---|---|---|---|");
  for (const s of ctx.schemes) {
    lines.push(
      `| ${s.scheme} | ${fmtW(s.annual_total)} | ${fmtW(s.PV_build)} | ${fmtW(s.PV_fang)} | ${fmtW(s.PV_run)} | ${fmtW(s.B_fang)} |`,
    );
  }
  lines.push("");

  // ── 4. 任务完成度 (回答"是否全部完成"必看) ──
  lines.push("## 4. 任务书完成度 (23 项任务, 任务书 1.2 节)");
  for (const t of ctx.taskChecklist) {
    const mark = t.status === "done" ? "✓" : t.status === "partial" ? "△" : "✗";
    lines.push(`- ${mark} [${t.id}] ${t.title} — ${t.requirement}`);
    if (t.warning) lines.push(`    ⚠ ${t.warning}`);
    lines.push(`    证据: ${t.evidence}`);
  }
  lines.push("");

  return lines.join("\n");
}

/** 按需追加: 防洪专题 (回答"防洪相关"时) */
export function renderFloodExtra(ctx: AgentContext): string {
  const lines: string[] = [];
  lines.push("## 5. 防洪专题 (任务书 p13-15)");
  lines.push("| 方案 | 防洪高 (m) | 设计洪水位 (m) | 设计最大泄流 | 校核洪水位 (m) | 校核最大泄流 | 坝顶高程 (m) | 控制工况 |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const s of ctx.schemes) {
    const ctrl = s.Z_dam2 >= s.Z_dam1 ? "校核" : "设计";
    lines.push(
      `| ${s.scheme} | ${s.Z_fangshou.toFixed(2)} | ${s.Z_design.toFixed(2)} | ${s.Q_design_max.toFixed(0)} m³/s | ${s.Z_check.toFixed(2)} | ${s.Q_check_max.toFixed(0)} m³/s | ${s.Z_dam.toFixed(2)} | ${ctrl} |`,
    );
  }
  lines.push("");
  lines.push("泄流公式:");
  lines.push("- 自由溢流: Q = 1.77·n·B·H^1.5");
  lines.push("- 中孔: Q = n·ω·μ·√(2gH), μ=0.99-0.53·a/H");
  lines.push("- 坝顶高程: Z_坝 = max(Z_设+Δh₁+0.7, Z_校+Δh₂+0.5)");
  lines.push("- 风浪高: Δh = 0.0208·V^1.25·D^(1/3) (V=12m/s, D=15km → 1.146m)");
  lines.push("");
  return lines.join("\n");
}

/** 按需追加: 装机与电能 (回答"重复容量/电能"时) */
export function renderEnergyExtra(ctx: AgentContext): string {
  const lines: string[] = [];
  lines.push("## 6. 装机与电能 (任务书 p10-13)");
  lines.push("| 方案 | Np 万kW | N_工 万kW | N_备 万kW | N_必 万kW | N_重 万kW | E 亿度 | η |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const s of ctx.schemes) {
    lines.push(
      `| ${s.scheme} | ${s.Np.toFixed(2)} | ${s.N_ji.toFixed(2)} | ${s.N_bei.toFixed(0)} | ${s.N_bi.toFixed(2)} | ${s.N_chong.toFixed(2)} | ${s.E_avg.toFixed(2)} | ${s.eta.toFixed(4)} |`,
    );
  }
  lines.push("");
  lines.push("公式:");
  lines.push("- N_峰 = N_p - 10; N_工峰 = 3.08·N_峰 + 7; N_工 = N_工峰 + 10");
  lines.push("- N_必 = N_工 + N_备 (N_备: I:30, II:25, III:20, IV:15)");
  lines.push("- N = K·q·H / 1e4 (K=8.5, Δh=1.0m)");
  lines.push("- η = (Q_0 - Q_弃) / Q_0");
  lines.push("");
  return lines.join("\n");
}

/** 按需追加: 死水位与兴利 (回答"死水位/兴利"时) */
export function renderXingliExtra(ctx: AgentContext): string {
  const lines: string[] = [];
  lines.push("## 7. 兴利专题 (任务书 p8-9)");
  lines.push("| 方案 | Z_正 m | Z_死 m | V_兴 亿m³ | Np 万kW | β_兴 |");
  lines.push("|---|---|---|---|---|---|");
  for (const s of ctx.schemes) {
    lines.push(
      `| ${s.scheme} | ${s.Z_zheng.toFixed(2)} | ${s.Z_dead.toFixed(2)} | ${s.V_xing.toFixed(2)} | ${s.Np.toFixed(2)} | ${s.coef_xing.toFixed(4)} |`,
    );
  }
  lines.push("");
  lines.push("Z_死 = max(Z_1 淤积, Z_2 综合利用=82, Z_3 极限消落)");
  lines.push("Z_3 迭代: 给定 Np → 试 q_min → 查 Z_下 → Z_3 = Z_正 - 0.35·(Z_正 - Z_下), 收敛 ε<1m³/s");
  lines.push("");
  return lines.join("\n");
}

// ── helpers ──

function formatCell(unit: string, v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (unit) {
    case "m":    return v.toFixed(2);
    case "万kW": return v.toFixed(2);
    case "亿m³": return v.toFixed(2);
    case "m³/s": return v.toFixed(0);
    case "亿度": return v.toFixed(2);
    case "h":    return v.toFixed(0);
    case "—":    return v.toFixed(3);
    default:     return v.toFixed(2);
  }
}

function fmtW(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("zh-CN");
}
