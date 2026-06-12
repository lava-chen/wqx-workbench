"use client";

import { useState, useMemo, useEffect } from "react";
import { useAllResults } from "@/hooks/useAllResults";
import { useParams } from "@/hooks/useParams";
import { cn } from "@/lib/utils";
import {
  FileText,
  Droplets,
  Gauge,
  Zap,
  BarChart3,
  Activity,
  Waves,
  Calculator,
  Star,
  ChevronDown,
  Sigma,
  Database,
  Table2,
  AlertCircle,
  X,
  ZoomIn,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { renderToString } from "katex";
import {
  get_Q_AVG_MS,
  get_ANNUAL_RUNOFF_YI,
  computeDeadLevel,
  findNpForScheme,
  calcInstalled,
  find_repeat_capacity,
  SCHEMES,
  z_to_v,
  RESERVE,
  SHIP_BASE,
  FENGTAN_LOSS,
  Q_SAFE as ENGINE_Q_SAFE,
  R0 as ENGINE_R0,
} from "@/lib/engine";

// ============================================================
// 步骤节点定义
// ============================================================

interface ChainNode {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  textColor: string;
  badgeColor: string;
  formula?: string;
  codeFile: string;
  pythonRef: string;
  paramSensitive?: boolean; // affected by global params
}

const CHAIN_NODES: ChainNode[] = [
  {
    id: 1,
    title: "原始资料 → 新径流系列",
    subtitle: "扣除船闸 10 m³/s + 灌溉 35 m³/s",
    icon: FileText,
    color: "border-l-emerald-500",
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    badgeColor: "bg-emerald-100 text-emerald-700",
    formula: "Q_{\\text{new}} = Q_{\\text{raw}} - 10 - 35 \\cdot I(\\text{month} \\in \\{5,6,7,8,9\\})",
    codeFile: "runoff.ts",
    pythonRef: "runoff.py",
  },
  {
    id: 2,
    title: "死水位 Z死 计算",
    subtitle: "Z1(泥沙) / Z2(82m综合) / Z3(消落) 取最大",
    icon: Droplets,
    color: "border-l-blue-500",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    badgeColor: "bg-blue-100 text-blue-700",
    formula: "Z死 = max(Z1, Z2, Z3), Z3 = Z正 − 0.35(Z正 − Z下)",
    codeFile: "deadLevel.ts",
    pythonRef: "dead_level.py",
  },
  {
    id: 3,
    title: "保证出力 Np 试算",
    subtitle: "长系列等出力试算 · P = 87.5%",
    icon: Gauge,
    color: "border-l-cyan-500",
    bgColor: "bg-cyan-50",
    textColor: "text-cyan-700",
    badgeColor: "bg-cyan-100 text-cyan-700",
    formula: "N = K·q·H / 10⁴, 逐年试算 → N₁…N₃₁ 排序取第 4 小",
    codeFile: "firmPower.ts",
    pythonRef: "firm_power.py",
  },
  {
    id: 4,
    title: "装机容量 N装 计算",
    subtitle: "N工 + N备 · 重复容量扫选",
    icon: Zap,
    color: "border-l-amber-500",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    badgeColor: "bg-amber-100 text-amber-700",
    formula:
      "N峰 = Np − 10, N工峰 = 3.08·N峰 + 7, N工 = N工峰 + 10, N必 = N工 + N备",
    codeFile: "installed.ts / energy.ts",
    pythonRef: "installed.py",
  },
  {
    id: 5,
    title: "调度图绘制",
    subtitle: "防破坏线 + 防洪调度线 + 加大出力辅助线",
    icon: BarChart3,
    color: "border-l-orange-500",
    bgColor: "bg-orange-50",
    textColor: "text-orange-700",
    badgeColor: "bg-orange-100 text-orange-700",
    formula:
      "\\text{逆时序等出力试算} \\to \\text{蓄水过程线外包} \\to Z_{it} = Z_t + (Z_{\\text{汛}} - Z_t) \\cdot i / 4",
    codeFile: "dispatch.ts",
    pythonRef: "dispatch.py",
  },
  {
    id: 6,
    title: "多年平均电能 E",
    subtitle: "长系列模拟 · 扣除凤滩补偿",
    icon: Activity,
    color: "border-l-violet-500",
    bgColor: "bg-violet-50",
    textColor: "text-violet-700",
    badgeColor: "bg-violet-100 text-violet-700",
    formula: "E_avg = ΣE_year / 31 − E_fengtan, E_month = N_real × 月小时数",
    codeFile: "energy.ts",
    pythonRef: "energy.py",
  },
  {
    id: 7,
    title: "调洪演算",
    subtitle: "三标准: P=5% 防洪 · P=0.1% 设计 · P=0.01% 校核",
    icon: Waves,
    color: "border-l-red-500",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    badgeColor: "bg-red-100 text-red-700",
    formula:
      "V_{t+1} = V_t + (Q̄_in − q̄_out)·Δt, q = min(Q安, q_cap(Z))",
    codeFile: "flood.ts",
    pythonRef: "flood.py",
    paramSensitive: true,
  },
  {
    id: 8,
    title: "经济比较",
    subtitle: "年费用最小法 · 4 方案对比",
    icon: Calculator,
    color: "border-l-slate-500",
    bgColor: "bg-slate-50",
    textColor: "text-slate-700",
    badgeColor: "bg-slate-100 text-slate-700",
    formula: "NF = \\left[\\sum (K_t + U_t)(1+r_0)^{-t}\\right] \\cdot \\frac{r_0\\,(1+r_0)^{n}}{(1+r_0)^{n}-1}",
    codeFile: "economic.ts / summary.ts",
    pythonRef: "economic.py",
    paramSensitive: true,
  },
  {
    id: 9,
    title: "推荐方案 → 最终指标",
    subtitle: "方案 II · 综合最优",
    icon: Star,
    color: "border-l-rose-500",
    bgColor: "bg-rose-50",
    textColor: "text-rose-700",
    badgeColor: "bg-rose-100 text-rose-700",
    codeFile: "summary.ts",
    pythonRef: "summary.py",
    paramSensitive: true,
  },
];

// ============================================================
// 子组件: 数据行
// ============================================================

function DataRow({
  label,
  value,
  unit = "",
  highlight = false,
  paramOverride = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
  paramOverride?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-1.5 px-3 rounded text-sm",
        highlight ? "bg-amber-50 font-semibold" : "hover:bg-slate-50",
      )}
    >
      <span className="flex items-center gap-1.5 text-slate-500">
        {label}
        {paramOverride && (
          <Badge className="h-4 px-1 text-[9px] bg-amber-100 text-amber-600 border-amber-200">
            参数
          </Badge>
        )}
      </span>
      <span className={cn("tabular-nums", highlight && "text-amber-700")}>
        {typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : value}
        {unit && <span className="text-slate-400 ml-1 text-xs">{unit}</span>}
      </span>
    </div>
  );
}

function FormulaBlock({ formula }: { formula: string }) {
  const html = useMemo(() => {
    try {
      return renderToString(formula, {
        throwOnError: false,
        displayMode: false,
        strict: "ignore",
      });
    } catch {
      return formula;
    }
  }, [formula]);

  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-slate-100 text-sm text-slate-700 border border-slate-200 overflow-x-auto">
      <Sigma className="h-4 w-4 mt-1 shrink-0 text-slate-400" />
      <span
        className="leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function InlineSwitcher<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              active
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SimpleDataTable({
  columns,
  rows,
  emptyText = "暂无数据",
  defaultSortKey,
  defaultSortDir = "asc",
}: {
  columns: Array<{
    key: string;
    label: string;
    align?: "left" | "right" | "center";
    unit?: string;
    sortable?: boolean;
  }>;
  rows: Array<Record<string, string | number>>;
  emptyText?: string;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
}) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(
    defaultSortKey ? defaultSortDir : null,
  );

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDir) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const numeric = rows.every(
      (r) => typeof r[sortKey] === "number" || (typeof r[sortKey] === "string" && r[sortKey] !== "" && !isNaN(Number(r[sortKey]))),
    );
    const sign = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (numeric) {
        return (Number(av) - Number(bv)) * sign;
      }
      return String(av).localeCompare(String(bv), "zh-Hans-CN") * sign;
    });
  }, [rows, columns, sortKey, sortDir]);

  const cycleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    // asc -> desc -> null -> asc
    if (sortDir === "asc") setSortDir("desc");
    else if (sortDir === "desc") {
      setSortKey(null);
      setSortDir(null);
    } else setSortDir("asc");
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="border-b border-slate-200">
              {columns.map((column) => {
                const isSortable = column.sortable !== false; // 默认都可点排序
                const active = sortKey === column.key;
                return (
                  <th
                    key={column.key}
                    onClick={isSortable ? () => cycleSort(column.key) : undefined}
                    className={cn(
                      "px-3 py-2 text-xs font-semibold text-slate-600 select-none",
                      column.align === "right"
                        ? "text-right"
                        : column.align === "center"
                          ? "text-center"
                          : "text-left",
                      isSortable && "cursor-pointer hover:text-slate-900",
                      active && "text-slate-900",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        column.align === "right" && "flex-row-reverse",
                      )}
                    >
                      <span>
                        {column.label}
                        {column.unit && (
                          <span className="ml-1 text-[10px] font-normal text-slate-400">
                            ({column.unit})
                          </span>
                        )}
                      </span>
                      {isSortable && (
                        <span
                          className={cn(
                            "text-[10px] leading-none transition-opacity",
                            active ? "opacity-100" : "opacity-30",
                          )}
                        >
                          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, idx) => (
                <tr
                  key={idx}
                  className={cn(
                    "border-b border-slate-100 last:border-b-0",
                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/55",
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-3 py-2 tabular-nums text-slate-700 whitespace-nowrap",
                        column.align === "right"
                          ? "text-right"
                          : column.align === "center"
                            ? "text-center"
                            : "text-left",
                      )}
                    >
                      {row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// 子组件: 右侧步骤图表面板
//   所有 9 步均使用 figs_scientific 中的静态 PNG (侧栏窄宽下
//   Recharts 网格 Y 轴会溢出成乱码, 静态图最稳定)
// ============================================================

const STEP_FIG: Record<number, { src: string; alt: string } | null> = {
  1: { src: "/figs/fig_zq_curve.png", alt: "水位-流量 (Z-Q) 关系曲线" },
  2: { src: "/figs/fig_compare_dead_level.png", alt: "4 方案死水位对比" },
  3: { src: "/figs/fig_compare_firm_power.png", alt: "4 方案保证出力对比" },
  4: { src: "/figs/fig_compare_installed.png", alt: "4 方案装机容量对比" },
  5: null, // 调度图随 FOCUS 方案变化, 单独处理
  6: { src: "/figs/fig_compare_energy.png", alt: "4 方案多年平均电能对比" },
  7: { src: "/figs/fig_flood_routing_compare_2x2.png", alt: "4 方案 3 标准调洪演算对比" },
  8: { src: "/figs/fig_compare_economic.png", alt: "4 方案经济比较" },
  9: { src: "/figs/fig_compare_overview.png", alt: "四方案关键指标综合概览" },
};

function StepChart({
  stepId,
  focusScheme,
  onPreview,
}: {
  stepId: number;
  focusScheme: string;
  onPreview: (src: string, alt: string) => void;
}) {
  if (stepId === 5) {
    const src = `/figs/fig_dispatch_${focusScheme}.png`;
    return (
      <button
        onClick={() => onPreview(src, `方案 ${focusScheme} 调度图`)}
        className="group relative block w-full cursor-zoom-in"
        title="点击查看大图"
      >
        <img
          src={src}
          alt={`方案 ${focusScheme} 调度图`}
          className="w-full h-auto rounded-md"
        />
        <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-slate-900/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
          <ZoomIn className="h-3.5 w-3.5" />
        </span>
      </button>
    );
  }
  const fig = STEP_FIG[stepId];
  if (!fig) return null;
  return (
    <button
      onClick={() => onPreview(fig.src, fig.alt)}
      className="group relative block w-full cursor-zoom-in"
      title="点击查看大图"
    >
      <img
        src={fig.src}
        alt={fig.alt}
        className="w-full h-auto rounded-md"
      />
      <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-slate-900/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
        <ZoomIn className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function StepVisualPanel({
  stepId,
  node,
  focusScheme,
  onPreview,
}: {
  stepId: number | null;
  node: ChainNode | undefined;
  focusScheme: string;
  onPreview: (src: string, alt: string) => void;
}) {
  // 全部收起: 占位卡
  if (stepId == null || !node) {
    return (
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
          <div className="text-center px-6">
            <BarChart3 className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500 leading-relaxed">
              点击左侧任意步骤
              <br />
              此处会显示对应的图表
            </p>
          </div>
        </div>
        <div className="p-4 text-center border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">计算链路 · 图表</h3>
          <p className="text-[11px] text-slate-400 mt-1">
            数据来源: 浏览器端计算内核实时渲染
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      key={stepId}
      className="rounded-2xl border bg-white shadow-sm overflow-hidden"
    >
      {/* 图表区 — key 切换触发淡入 */}
      <div key={stepId} className="anim-cc-fade-up p-3 bg-white">
        <StepChart stepId={stepId} focusScheme={focusScheme} onPreview={onPreview} />
      </div>

      {/* 步骤信息 */}
      <div className="p-3 border-t border-slate-100 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-slate-400 tabular-nums">
            STEP {node.id}
          </span>
          <Badge
            variant="secondary"
            className={cn("text-[10px] font-medium", node.badgeColor)}
          >
            实时图表
          </Badge>
        </div>
        <h3 className="text-sm font-bold text-slate-800 leading-snug">
          {node.title}
        </h3>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          {node.subtitle}
        </p>
      </div>
    </div>
  );
}

// 右栏下半部: 步骤对应的"真表"区. 仅 step 3 (保证出力) 和
// step 7 (调洪) 有真实表格数据, 其他步骤显示占位提示.
type QUnit = "m3s" | "volume";

function formatQ(q: number, unit: QUnit, kind: "year" | "step"): string {
  if (unit === "m3s") return q.toFixed(2);
  // 体量
  if (kind === "year") {
    // 亿 m³/年 = q * 31,536,000 / 1e8
    return (q * 31536000 / 1e8).toFixed(4);
  }
  // 万 m³/时段 (3h = 10800s) = q * 10800 / 1e4
  return (q * 10800 / 1e4).toFixed(3);
}

function QUnitToggle({
  unit,
  onChange,
}: {
  unit: QUnit;
  onChange: (u: QUnit) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-[10px] font-medium">
      {([
        { v: "m3s" as const, l: "m³/s" },
        { v: "volume" as const, l: "水量" },
      ]).map((opt) => {
        const active = unit === opt.v;
        return (
          <button
            key={opt.v}
            type="button"
            onClick={() => onChange(opt.v)}
            className={cn(
              "rounded-full px-2 py-0.5 transition-colors",
              active
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:text-slate-800",
            )}
            title={opt.v === "m3s" ? "瞬时流量" : "年/时段累计水量"}
          >
            {opt.l}
          </button>
        );
      })}
    </div>
  );
}

function StepTablePanel({
  stepId,
  node,
  focusScheme,
  activeFloodStd,
  setActiveFloodStd,
  firmPowerRows,
  floodTableRows,
  onPreview,
}: {
  stepId: number | null;
  node: ChainNode | undefined;
  focusScheme: string;
  activeFloodStd: "P5" | "P0_1" | "P0_01";
  setActiveFloodStd: (v: "P5" | "P0_1" | "P0_01") => void;
  firmPowerRows: Array<Record<string, string | number>>;
  floodTableRows: Array<Record<string, string | number>>;
  onPreview: () => void;
}) {
  const [qUnit, setQUnit] = useState<QUnit>("m3s");

  // 派生带单位的 display rows (只影响 qYear / qIn / qOut 三列字符串)
  const firmPowerDisplay = useMemo(() => {
    if (qUnit === "m3s") return firmPowerRows;
    return firmPowerRows.map((r) => ({
      ...r,
      qYear: formatQ(Number(r.qYearRaw), "volume", "year"),
    }));
  }, [firmPowerRows, qUnit]);

  const floodDisplay = useMemo(() => {
    if (qUnit === "m3s") return floodTableRows;
    return floodTableRows.map((r) => ({
      ...r,
      qIn: formatQ(Number(r.qInRaw), "volume", "step"),
      qOut: formatQ(Number(r.qOutRaw), "volume", "step"),
    }));
  }, [floodTableRows, qUnit]);

  // 列定义: 单位随 qUnit 切换
  const firmColumns = useMemo(
    () => [
      { key: "rank", label: "排序", align: "right" as const, sortable: false },
      { key: "year", label: "年份", align: "right" as const },
      { key: "power", label: "N", unit: "万kW", align: "right" as const },
      {
        key: "qYear",
        label: "q",
        unit: qUnit === "m3s" ? "m³/s" : "亿 m³/年",
        align: "right" as const,
      },
      { key: "control", label: "供水期", align: "center" as const, sortable: false },
      { key: "months", label: "月数", align: "right" as const },
      { key: "status", label: "收敛", align: "center" as const, sortable: false },
    ],
    [qUnit],
  );

  const floodColumns = useMemo(
    () => [
      { key: "step", label: "时段", align: "right" as const },
      {
        key: "qIn",
        label: "Q入",
        unit: qUnit === "m3s" ? "m³/s" : "万 m³/时段",
        align: "right" as const,
      },
      {
        key: "qOut",
        label: "Q出",
        unit: qUnit === "m3s" ? "m³/s" : "万 m³/时段",
        align: "right" as const,
      },
      { key: "storage", label: "V", unit: "亿m³", align: "right" as const },
      { key: "level", label: "Z", unit: "m", align: "right" as const },
    ],
    [qUnit],
  );

  if (stepId == null || !node) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-center">
        <Table2 className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          点击左侧任意步骤
          <br />
          此处会显示对应的计算真表
        </p>
      </div>
    );
  }

  if (stepId === 3) {
    return (
      <button
        type="button"
        onClick={onPreview}
        className="group block w-full text-left rounded-2xl border bg-white shadow-sm overflow-hidden cursor-zoom-in hover:border-cyan-300 transition-colors"
      >
        <div className="p-3 border-b border-slate-100 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono font-bold text-slate-400 tabular-nums">
              STEP 3
            </span>
            <Badge variant="secondary" className="bg-cyan-50 text-cyan-700 text-[10px]">
              计算真表
            </Badge>
            <span className="ml-auto text-[10px] text-slate-400 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <ZoomIn className="h-3 w-3" />点击放大
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-800 leading-snug">
            保证出力逐年计算表
          </h3>
          <div className="flex items-center gap-2 flex-wrap pt-0.5" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] text-slate-400">q 列单位:</span>
            <QUnitToggle unit={qUnit} onChange={setQUnit} />
          </div>
        </div>
        <div className="p-2">
          <SimpleDataTable
            columns={firmColumns}
            rows={firmPowerDisplay}
            defaultSortKey="power"
            defaultSortDir="asc"
            emptyText="暂无逐年出力数据"
          />
        </div>
      </button>
    );
  }

  if (stepId === 7) {
    return (
      <button
        type="button"
        onClick={onPreview}
        className="group block w-full text-left rounded-2xl border bg-white shadow-sm overflow-hidden cursor-zoom-in hover:border-red-300 transition-colors"
      >
        <div className="p-3 border-b border-slate-100 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono font-bold text-slate-400 tabular-nums">
              STEP 7
            </span>
            <Badge variant="secondary" className="bg-red-50 text-red-700 text-[10px]">
              计算真表
            </Badge>
            <span className="ml-auto text-[10px] text-slate-400 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <ZoomIn className="h-3 w-3" />点击放大
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-800 leading-snug">
            调洪逐时段计算表
          </h3>
          <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
            <InlineSwitcher
              value={activeFloodStd}
              options={[
                { value: "P5", label: "P=5%" },
                { value: "P0_1", label: "P=0.1%" },
                { value: "P0_01", label: "P=0.01%" },
              ]}
              onChange={setActiveFloodStd}
            />
            <span className="text-[10px] text-slate-400 ml-1">Q列:</span>
            <QUnitToggle unit={qUnit} onChange={setQUnit} />
          </div>
        </div>
        <div className="p-2">
          <SimpleDataTable
            columns={floodColumns}
            rows={floodDisplay}
            emptyText="暂无调洪演算数据"
          />
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-center">
      <Table2 className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
      <p className="text-xs text-slate-500 leading-relaxed">
        {node.title} · 该步骤暂无独立真表
      </p>
      <p className="text-[10px] text-slate-400 mt-1">
        输入/输出明细已嵌入左侧节点卡
      </p>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export function CalculationChainPage() {
  const results = useAllResults();
  const { params, isModified, defaults, setScheme } = useParams();
  const { waterResults, floodResults, table, econ } = results;

  // --- Node 1 data: runoff ---
  const node1Data = useMemo(() => {
    const qAvg = get_Q_AVG_MS();
    const annualYi = get_ANNUAL_RUNOFF_YI();
    return { qAvg, annualYi };
  }, []);

  // --- Node 2 data: dead level ---
  const node2Data = useMemo(() => {
    const data: Record<string, ReturnType<typeof computeDeadLevel>> = {};
    for (const sk of ["I", "II", "III", "IV"] as const) {
      data[sk] = computeDeadLevel(sk);
    }
    return data;
  }, []);

  // --- Node 3 data: firm power ---
  const node3Data = useMemo(() => {
    const data: Record<string, ReturnType<typeof findNpForScheme>> = {};
    for (const sk of ["I", "II", "III", "IV"] as const) {
      data[sk] = findNpForScheme(sk);
    }
    return data;
  }, []);

  // --- Node 4 data: installed capacity ---
  const node4Data = useMemo(() => {
    const data = {} as Record<
      string,
      {
        inst: ReturnType<typeof calcInstalled>;
        repeat: ReturnType<typeof find_repeat_capacity>;
      }
    >;
    for (const sk of ["I", "II", "III", "IV"] as const) {
      const Np_wan = waterResults[sk].Np_wan;
      const inst = calcInstalled(Np_wan, sk);
      const dead = node2Data[sk];
      const repeat = find_repeat_capacity(sk, dead.Z_dead, Np_wan, inst.N_bi);
      data[sk] = { inst, repeat };
    }
    return data;
  }, [waterResults, node2Data]);

  // --- Selected scheme for focused display ---
  const FOCUS = params.scheme || "II";

  // --- Expand state ---
  const [expanded, setExpanded] = useState<Set<number>>(new Set([7]));

  // --- Active step (drives the right-side visual panel) ---
  const [activeStepId, setActiveStepId] = useState<number | null>(7);
  const [activeFloodStd, setActiveFloodStd] = useState<"P5" | "P0_1" | "P0_01">("P5");

  // --- Image preview modal ---
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  // --- Table preview modal (true 表格点击放大) ---
  const [tablePreviewStep, setTablePreviewStep] = useState<number | null>(null);

  const focusStep = (id: number) => {
    setExpanded((prev) => new Set(prev).add(id));
    setActiveStepId(id);
  };

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const wasOpen = next.has(id);
      if (wasOpen) {
        next.delete(id);
        // If we just closed the active step, fall back to another open one (or null)
        if (activeStepId === id) {
          const remaining = Array.from(next);
          setActiveStepId(remaining.length ? remaining[remaining.length - 1] : null);
        }
      } else {
        next.add(id);
        setActiveStepId(id);
      }
      return next;
    });
  };

  const activeNode = activeStepId == null
    ? undefined
    : CHAIN_NODES.find((node) => node.id === activeStepId);

  const firmPowerRows = useMemo(() => {
    const current = node3Data[FOCUS];
    if (!current?.year_results) return [];
    return [...current.year_results]
      .sort((a, b) => a.N_year - b.N_year)
      .map((row, index) => ({
        rank: index + 1,
        year: row.year,
        power: (row.N_year / 1e4).toFixed(2),
        qYear: row.q_year_diff.toFixed(2),
        qYearRaw: row.q_year_diff,
        control: `${row.control_start_month} → ${row.control_end_month}`,
        months: row.n_supply,
        status: row.converged ? "收敛" : "未收敛",
      }));
  }, [FOCUS, node3Data]);

  const floodTableRows = useMemo(() => {
    const series = floodResults[FOCUS]?.series?.[activeFloodStd];
    if (!series) return [];
    return series.Q_in.map((qIn: number, index: number) => {
      const z = series.Z[index] ?? series.Z[series.Z.length - 1];
      const qOut = series.Q_out[index] ?? series.Q_out[series.Q_out.length - 1];
      return {
        step: index + 1,
        qIn: qIn.toFixed(2),
        qOut: qOut.toFixed(2),
        qInRaw: qIn,
        qOutRaw: qOut,
        storage: z_to_v(z).toFixed(2),
        level: z.toFixed(2),
      };
    });
  }, [FOCUS, activeFloodStd, floodResults]);

  // --- Render a single node ---
  const renderNode = (node: ChainNode) => {
    const isOpen = expanded.has(node.id);
    const Icon = node.icon;
    const isParamSensitive = node.paramSensitive && isModified;

    return (
      <div key={node.id} className="relative">
        {/* Connecting line */}
        {node.id < 9 && (
          <div className="absolute left-6 top-full w-0.5 h-8 bg-slate-200 z-0" />
        )}

        <Card
          className={cn(
            "relative z-10 border-l-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer",
            node.color,
            isParamSensitive && "ring-1 ring-amber-300",
          )}
          onClick={() => toggle(node.id)}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-full shrink-0",
                node.bgColor,
              )}
            >
              <Icon className={cn("h-4.5 w-4.5", node.textColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-400 tabular-nums">
                  STEP {node.id}
                </span>
                <span className="text-sm font-semibold text-slate-800">
                  {node.title}
                </span>
                {isParamSensitive && (
                  <Badge className="h-4 px-1.5 text-[9px] bg-amber-100 text-amber-600 border-amber-300 whitespace-nowrap">
                    <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                    受参数影响
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{node.subtitle}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="secondary" className={cn("text-xs", node.badgeColor)}>
                {node.codeFile}
              </Badge>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-slate-400 transition-transform duration-200",
                  isOpen && "rotate-180",
                )}
              />
            </div>
          </div>

          {/* Expandable content */}
          {isOpen && (
            <div className="border-t border-slate-100">
              <div className="p-4 space-y-4">
                {/* Formula */}
                {node.formula && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Sigma className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                        计算公式
                      </span>
                    </div>
                    <FormulaBlock formula={node.formula} />
                  </div>
                )}

                {/* Input Data */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      输入数据
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-lg border border-slate-100 divide-y divide-slate-100">
                    {renderNodeInputs(node.id)}
                  </div>
                </div>

                {/* Output Results */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Table2 className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      输出结果
                    </span>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {renderNodeOutputs(node.id)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  };

  // --- Render inputs per node ---
  const renderNodeInputs = (nodeId: number) => {
    const n1 = node1Data;
    const nd2 = node2Data[FOCUS];
    const nd3 = node3Data[FOCUS];

    const qSafeAdjusted = params.Q_SAFE !== ENGINE_Q_SAFE;
    const r0Adjusted = params.R0 !== ENGINE_R0;

    switch (nodeId) {
      case 1:
        return (
          <>
            <DataRow label="水文系列" value={`${1951}-${1981}`} unit="31 年" />
            <DataRow label="原始多年平均流量" value={n1.qAvg.toFixed(2)} unit="m³/s" />
            <DataRow label="多年平均年水量" value={n1.annualYi.toFixed(2)} unit="亿 m³" />
            <DataRow label="船闸扣除" value={10} unit="m³/s (全年)" />
            <DataRow label="灌溉扣除" value={35} unit="m³/s (5-9月)" />
          </>
        );
      case 2:
        return (
          <>
            <DataRow label="方案" value={FOCUS} />
            <DataRow label="正常蓄水位 Z正" value={SCHEMES[FOCUS].Z_zheng} unit="m" />
            <DataRow label="50年泥沙淤积量" value="3.345" unit="亿 m³" />
            <DataRow label="初始假定流量 q₀" value={800} unit="m³/s" />
            <DataRow label="保证率 P" value="87.5" unit="%" />
            <DataRow label="收敛精度 ε" value="1.0" unit="m³/s" />
          </>
        );
      case 3:
        return (
          <>
            <DataRow label="方案" value={FOCUS} />
            <DataRow label="Z死" value={nd2?.Z_dead.toFixed(2) ?? "—"} unit="m" />
            <DataRow label="兴利库容 V兴" value={nd2?.V_xing.toFixed(4) ?? "—"} unit="亿 m³" />
            <DataRow label="设计保证率 P" value="87.5" unit="%" />
            <DataRow label="允许破坏年数" value={4} unit="年" />
            <DataRow label="出力系数 K" value="8.5" />
          </>
        );
      case 4:
        return (
          <>
            <DataRow label="方案" value={FOCUS} />
            <DataRow label="保证出力 Np" value={(waterResults[FOCUS].Np_wan).toFixed(2)} unit="万 kW" />
            <DataRow label="航运基荷" value={SHIP_BASE} unit="万 kW" />
            <DataRow label="备用容量 N备" value={RESERVE[FOCUS]} unit="万 kW" />
            <DataRow label="经济小时数 H_econ" value={2500} unit="h" />
          </>
        );
      case 5:
        return (
          <>
            <DataRow label="方案" value={FOCUS} />
            <DataRow label="Z死" value={nd2?.Z_dead.toFixed(2) ?? "—"} unit="m" />
            <DataRow label="Np" value={(waterResults[FOCUS].Np_wan).toFixed(2)} unit="万 kW" />
            <DataRow label="防破坏线周期" value="5月~次年3月" />
            <DataRow
              label="防洪限制水位"
              value="= Z正 (简化)"
            />
            <DataRow
              label="结合库容 V结合"
              value={0}
              unit="亿 m³ (简化=0)"
            />
          </>
        );
      case 6:
        return (
          <>
            <DataRow label="方案" value={FOCUS} />
            <DataRow label="Np" value={(waterResults[FOCUS].Np_wan).toFixed(2)} unit="万 kW" />
            <DataRow label="N装" value={(node4Data[FOCUS]?.repeat.N_Y ?? 0).toFixed(2)} unit="万 kW" />
            <DataRow label="凤滩补偿 N" value={FENGTAN_LOSS[FOCUS].N} unit="万 kW" />
            <DataRow label="凤滩补偿 E" value={FENGTAN_LOSS[FOCUS].E} unit="亿 kWh" />
            <DataRow label="模拟年数" value={31} unit="年" />
          </>
        );
      case 7:
        return (
          <>
            <DataRow label="方案" value={FOCUS} />
            <DataRow label="起调水位" value={SCHEMES[FOCUS].Z_zheng} unit="m" />
            <DataRow
              label="下游安全泄量 Q安"
              value={params.Q_SAFE}
              unit="m³/s"
              paramOverride={qSafeAdjusted}
              highlight={qSafeAdjusted}
            />
            <DataRow label="防洪标准 P" value="5%" />
            <DataRow label="设计标准 P" value="0.1%" />
            <DataRow label="校核标准 P" value="0.01%" />
            <DataRow label="计算步长 Δt" value={3} unit="h" />
          </>
        );
      case 8:
        return (
          <>
            <DataRow label="方案数" value={4} unit="I / II / III / IV" />
            <DataRow
              label="折算率 r₀"
              value={`${(params.R0 * 100).toFixed(0)}`}
              unit="%"
              paramOverride={r0Adjusted}
              highlight={r0Adjusted}
            />
            <DataRow label="施工期" value={11} unit="年" />
            <DataRow label="正常运行期" value={50} unit="年" />
            <DataRow label="火电寿命" value={25} unit="年" />
            <DataRow label="替代方案基准" value="方案 I" />
          </>
        );
      case 9:
        return (
          <>
            <DataRow label="推荐方案" value={FOCUS} highlight />
            <DataRow label="Z正" value={SCHEMES[FOCUS].Z_zheng} unit="m" />
            <DataRow label="坝高 H_max" value={SCHEMES[FOCUS].H_dam_max} unit="m" />
            <DataRow label="死水位基准方案" value={FOCUS} />
            {qSafeAdjusted && (
              <DataRow label="Q安 (当前)" value={params.Q_SAFE} unit="m³/s" paramOverride />
            )}
            {r0Adjusted && (
              <DataRow label="r₀ (当前)" value={params.R0.toFixed(2)} paramOverride />
            )}
          </>
        );
      default:
        return null;
    }
  };

  // --- Render outputs per node ---
  const renderNodeOutputs = (nodeId: number) => {
    const n1 = node1Data;
    const nd2 = node2Data[FOCUS];
    const nd3 = node3Data[FOCUS];
    const nd4 = node4Data[FOCUS];
    const wr = waterResults;
    const fr = floodResults;
    const tbl = table;

    const qSafeAdjusted = params.Q_SAFE !== ENGINE_Q_SAFE;
    const r0Adjusted = params.R0 !== ENGINE_R0;

    switch (nodeId) {
      case 1:
        return (
          <>
            <DataRow
              label="扣除后多年平均流量"
              value={n1.qAvg.toFixed(2)}
              unit="m³/s"
              highlight
            />
            <DataRow
              label="扣除后多年平均年水量"
              value={n1.annualYi.toFixed(2)}
              unit="亿 m³"
            />
          </>
        );
      case 2: {
        if (!nd2) return <DataRow label="状态" value="计算中..." />;
        return (
          <>
            <DataRow
              label="Z1 (泥沙淤积)"
              value={nd2.Z1_sediment.toFixed(2)}
              unit="m"
            />
            <DataRow label="Z2 (综合利用)" value={nd2.Z2_util.toFixed(2)} unit="m" />
            <DataRow
              label="Z3 (消落深度)"
              value={nd2.Z3_drawdown.toFixed(2)}
              unit="m"
            />
            <DataRow
              label="最终 Z死"
              value={nd2.Z_dead.toFixed(2)}
              unit="m"
              highlight
            />
            <DataRow
              label="兴利库容 V兴"
              value={nd2.V_xing.toFixed(4)}
              unit="亿 m³"
            />
            <DataRow
              label="迭代次数"
              value={nd2.iterations}
              unit="次"
            />
            <DataRow
              label="收敛状态"
              value={nd2.converged ? "✓ 已收敛" : "✗ 未收敛"}
            />
          </>
        );
      }
      case 3: {
        if (!nd3) return <DataRow label="状态" value="计算中..." />;
        return (
          <>
            <DataRow
              label="设计调节流量 qp"
              value={nd3.qp_design.toFixed(2)}
              unit="m³/s"
            />
            {nd3.N_sorted.slice(0, 8).map((n, i) => (
              <DataRow
                key={i}
                label={`第 ${i + 1} 小 N_year`}
                value={(n / 1e4).toFixed(2)}
                unit="万 kW"
              />
            ))}
            <DataRow
              label="保证出力 Np (第4小)"
              value={(nd3.N_p / 1e4).toFixed(2)}
              unit="万 kW"
              highlight
            />
            <DataRow
              label="破坏年数 / 总年数"
              value={`${nd3.fail_years} / 31`}
            />
          </>
        );
      }
      case 4: {
        if (!nd4) return <DataRow label="状态" value="计算中..." />;
        const { inst, repeat } = nd4;
        return (
          <>
            <DataRow label="Np" value={inst.N_p.toFixed(2)} unit="万 kW" />
            <DataRow label="N峰 (Np − 10)" value={inst.N_feng.toFixed(2)} unit="万 kW" />
            <DataRow label="N工峰" value={inst.N_ji_feng.toFixed(2)} unit="万 kW" />
            <DataRow label="N工基 (航运)" value={inst.N_ji_ji} unit="万 kW" />
            <DataRow
              label="N工"
              value={inst.N_ji.toFixed(2)}
              unit="万 kW"
            />
            <DataRow label="N备" value={inst.N_bei} unit="万 kW" />
            <DataRow
              label="N必"
              value={inst.N_bi.toFixed(2)}
              unit="万 kW"
              highlight
            />
            <DataRow label="N重 (重复容量)" value={repeat.N_chong.toFixed(2)} unit="万 kW" />
            <DataRow
              label="N装 (N必 + N重)"
              value={repeat.N_Y.toFixed(2)}
              unit="万 kW"
              highlight
            />
          </>
        );
      }
      case 5: {
        return (
          <>
            <DataRow
              label="防洪限制水位"
              value={SCHEMES[FOCUS].Z_zheng}
              unit="m (简化: 取 Z正, V结合=0)"
            />
            <DataRow
              label="任务书方法"
              value="取 7 月底/8 月初防破坏线坐标"
            />
            <DataRow label="结合库容 V结合" value="0.00" unit="亿 m³" />
            <DataRow
              label="防破坏线范围"
              value="5月~次年3月 (供水期)"
            />
            <DataRow
              label="算法"
              value="逆时序等出力试算, 外包线"
            />
            <DataRow
              label="加大出力辅助线"
              value="i=1,2,3 等分 V防破→V汛"
            />
          </>
        );
      }
      case 6: {
        const wr2 = wr[FOCUS];
        return (
          <>
            <DataRow
              label="多年平均电能 E_avg"
              value={wr2.E_avg.toFixed(4)}
              unit="亿 kWh"
              highlight
            />
            <DataRow
              label="凤滩补偿扣除"
              value={FENGTAN_LOSS[FOCUS].E.toFixed(4)}
              unit="亿 kWh"
            />
            <DataRow
              label="多年平均弃水流量"
              value={wr2.Q_dump_avg.toFixed(2)}
              unit="m³/s"
            />
            <DataRow
              label="N装"
              value={wr2.N_Y.toFixed(2)}
              unit="万 kW"
            />
          </>
        );
      }
      case 7: {
        const fr2 = fr[FOCUS];
        if (!fr2)
          return <DataRow label="状态" value="计算中..." />;
        return (
          <>
            <DataRow
              label="防洪高水位 Z防洪高"
              value={fr2.Z_fangshou_high.toFixed(2)}
              unit="m"
              highlight
            />
            <DataRow
              label="设计洪水位 Z设计"
              value={fr2.Z_design.toFixed(2)}
              unit="m"
            />
            <DataRow
              label="设计最大泄量"
              value={fr2.Q_design_max.toFixed(0)}
              unit="m³/s"
            />
            <DataRow
              label="校核洪水位 Z校核"
              value={fr2.Z_check.toFixed(2)}
              unit="m"
              highlight
              paramOverride={qSafeAdjusted}
            />
            <DataRow
              label="校核最大泄量"
              value={fr2.Q_check_max.toFixed(0)}
              unit="m³/s"
            />
          </>
        );
      }
      case 8: {
        if (!econ || econ.length === 0)
          return <DataRow label="状态" value="计算中..." />;
        const econSorted = [...econ].sort(
          (a, b) => a.annual_total - b.annual_total,
        );
        return (
          <>
            {econSorted.map((item, i) => (
              <DataRow
                key={item.scheme}
                label={`方案 ${item.scheme} 年费用`}
                value={item.annual_total.toFixed(2)}
                unit="万元"
                highlight={item.scheme === "II" || (i === 0 && item.annual_total === econSorted[0].annual_total)}
                paramOverride={r0Adjusted}
              />
            ))}
            <DataRow
              label="推荐方案"
              value="方案 II"
              highlight
            />
            <DataRow label="方法" value="年费用最小法 (NF)" />
            <DataRow
              label="折算率 r₀"
              value={`${(params.R0 * 100).toFixed(0)}%`}
              paramOverride={r0Adjusted}
              highlight={r0Adjusted}
            />
            <DataRow label="计算期" value={61} unit="年 (11+50)" />
          </>
        );
      }
      case 9: {
        const tblII = tbl?.find((r) => r.scheme === FOCUS);
        if (!tblII)
          return <DataRow label="状态" value="计算中..." />;
        // 重复容量利用小时 h_重 = ΔE / N重  (E 单位 亿 kWh, N 单位 万 kW → h 单位 h)
        const rep = nd4?.repeat;
        const E0 = rep?.E_list?.[0] ?? 0;
        const E_chong = rep?.E_avg_raw ?? 0;
        const N_chong_val = rep?.N_chong ?? 0;
        const h_repeat =
          N_chong_val > 0
            ? ((E_chong - E0) / N_chong_val) * 1e4
            : null;
        return (
          <>
            <DataRow label="Z正" value={tblII.Z_zheng} unit="m" />
            <DataRow label="Z死" value={tblII.Z_dead.toFixed(2)} unit="m" highlight />
            <DataRow
              label="防洪限制水位"
              value={tblII.Z_xun.toFixed(2)}
              unit="m"
            />
            <DataRow
              label="防洪高水位 Z防洪高"
              value={tblII.Z_fangshou.toFixed(2)}
              unit="m"
            />
            <DataRow label="设计洪水位 Z设计" value={tblII.Z_design.toFixed(2)} unit="m" />
            <DataRow label="校核洪水位 Z校核" value={tblII.Z_check.toFixed(2)} unit="m" />
            <DataRow label="坝顶高程 Z坝" value={tblII.Z_dam.toFixed(2)} unit="m" highlight />
            <DataRow label="总库容 V总" value={tblII.V_total.toFixed(2)} unit="亿 m³" />
            <DataRow label="兴利库容 V兴" value={tblII.V_xing.toFixed(4)} unit="亿 m³" />
            <DataRow label="防洪库容 V防洪" value={tblII.V_fangshou.toFixed(4)} unit="亿 m³" />
            <DataRow label="结合库容 V结合" value={tblII.V_jiehe.toFixed(4)} unit="亿 m³" />
            <DataRow label="保证出力 Np" value={(tblII.Np / 1e4).toFixed(2)} unit="万 kW" highlight />
            <DataRow
              label="工作容量 N工"
              value={tblII.N_ji.toFixed(2)}
              unit="万 kW"
            />
            <DataRow label="备用容量 N备" value={tblII.N_bei.toFixed(2)} unit="万 kW" />
            <DataRow label="必需容量 N必" value={tblII.N_bi.toFixed(2)} unit="万 kW" />
            <DataRow label="重复容量 N重" value={tblII.N_chong.toFixed(2)} unit="万 kW" />
            <DataRow
              label="重复容量利用小时 h重"
              value={h_repeat !== null ? h_repeat.toFixed(0) : "—"}
              unit="h"
            />
            <DataRow label="装机容量 N装" value={tblII.N_y.toFixed(2)} unit="万 kW" highlight />
            <DataRow label="多年平均电能 E" value={tblII.E_avg.toFixed(4)} unit="亿 kWh" highlight />
            <DataRow label="设计最大泄量" value={tblII.Q_design_max.toFixed(0)} unit="m³/s" />
            <DataRow label="校核最大泄量" value={tblII.Q_check_max.toFixed(0)} unit="m³/s" />
            <DataRow label="库容系数 β" value={tblII.coef_xing.toFixed(4)} />
            <DataRow label="调节系数 α" value={tblII.coef_tiao.toFixed(4)} />
            <DataRow label="径流利用系数 η" value={(tblII.eta * 100).toFixed(2)} unit="%" />
          </>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800">计算链路</h2>
          <p className="text-sm text-slate-500 mt-1">
            五强溪水电站工程设计完整计算流程，点击各节点可展开查看公式、输入数据与输出结果
          </p>
        </div>
        {/* Scheme switcher */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200">
          {(["I", "II", "III", "IV"] as const).map((sk) => {
            const active = FOCUS === sk;
            return (
              <button
                key={sk}
                onClick={() => setScheme(sk)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors tabular-nums",
                  active
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
                title={`方案 ${sk} (正常蓄水位 ${SCHEMES[sk].Z_zheng} m)`}
              >
                方案 {sk}
              </button>
            );
          })}
        </div>
      </div>
      {isModified && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            全局参数已修改 — 节点 7 (调洪)、节点 8 (经济) 及节点 9 (汇总) 反映当前参数
          </Badge>
        </div>
      )}

      {/* 布局: 左链路 + 右图表 / 真表 */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-8 max-w-6xl mx-auto">
        {/* Left: Vertical Flow */}
        <div className="relative min-w-0">
          {/* Vertical timeline line behind all nodes */}
          <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-slate-200" />

          <div className="space-y-0">
            {CHAIN_NODES.map((node, idx) => (
              <div key={node.id} className={cn(idx > 0 && "mt-4")}>
                {renderNode(node)}
              </div>
            ))}
          </div>
        </div>

        {/* Right: 图表 + 真表 (与链路并列, 整片 sticky) */}
        <aside className="hidden lg:block sticky top-12 self-start space-y-4 max-h-[calc(100vh-3.5rem)] overflow-hidden">
          <StepVisualPanel
            stepId={activeStepId}
            node={CHAIN_NODES.find((n) => n.id === activeStepId)}
            focusScheme={FOCUS}
            onPreview={(src, alt) => setPreview({ src, alt })}
          />
          <StepTablePanel
            stepId={activeStepId}
            node={CHAIN_NODES.find((n) => n.id === activeStepId)}
            focusScheme={FOCUS}
            activeFloodStd={activeFloodStd}
            setActiveFloodStd={setActiveFloodStd}
            firmPowerRows={firmPowerRows}
            floodTableRows={floodTableRows}
            onPreview={() => {
              if (activeStepId === 3 || activeStepId === 7) {
                setTablePreviewStep(activeStepId);
              }
            }}
          />
        </aside>
      </div>

      {/* Mobile fallback: collapsed visual hint */}
      <div className="lg:hidden rounded-xl border bg-slate-50 p-3 text-center">
        <p className="text-[11px] text-slate-500">
          建议在 ≥1024px 屏幕查看右侧步骤可视化面板
        </p>
      </div>

      {/* Footer note */}
      <div className="text-center text-xs text-slate-400 pt-4 border-t">
        本页计算基于 TypeScript 计算内核实时运行 · 所有结果均为浏览器端可控复现
        {isModified && " · 使用自定义参数"}
      </div>

      {/* Image preview modal (lightbox) */}
      {preview && (
        <ImagePreviewModal
          src={preview.src}
          alt={preview.alt}
          onClose={() => setPreview(null)}
        />
      )}

      {/* Table preview modal (lightbox) */}
      {tablePreviewStep != null && (
        <TablePreviewModal
          stepId={tablePreviewStep}
          focusScheme={FOCUS}
          activeFloodStd={activeFloodStd}
          setActiveFloodStd={setActiveFloodStd}
          firmPowerRows={firmPowerRows}
          floodTableRows={floodTableRows}
          onClose={() => setTablePreviewStep(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// 图片预览弹窗 (lightbox) — 居中放大, 背景模糊
// ============================================================
function ImagePreviewModal({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-slate-900/60 backdrop-blur-md anim-cc-fade-up"
      onClick={onClose}
    >
      {/* Close button (top-right) */}
      <button
        onClick={onClose}
        aria-label="关闭预览"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/90 hover:bg-white p-2 text-slate-700 shadow-lg transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Caption (top-center) */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        {alt}
      </div>

      {/* Image (clicking it does NOT close) */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-[92vw] max-h-[88vh] rounded-lg shadow-2xl bg-white"
      />
    </div>
  );
}

// ============================================================
// 表格预览弹窗: 居中放大一张 SimpleDataTable, 复用 ESC/背景模糊
// ============================================================
function TablePreviewModal({
  stepId,
  focusScheme,
  activeFloodStd,
  setActiveFloodStd,
  firmPowerRows,
  floodTableRows,
  onClose,
}: {
  stepId: number;
  focusScheme: string;
  activeFloodStd: "P5" | "P0_1" | "P0_01";
  setActiveFloodStd: (v: "P5" | "P0_1" | "P0_01") => void;
  firmPowerRows: Array<Record<string, string | number>>;
  floodTableRows: Array<Record<string, string | number>>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const [qUnit, setQUnit] = useState<QUnit>("m3s");

  const firmPowerDisplay = useMemo(() => {
    if (qUnit === "m3s") return firmPowerRows;
    return firmPowerRows.map((r) => ({
      ...r,
      qYear: formatQ(Number(r.qYearRaw), "volume", "year"),
    }));
  }, [firmPowerRows, qUnit]);

  const floodDisplay = useMemo(() => {
    if (qUnit === "m3s") return floodTableRows;
    return floodTableRows.map((r) => ({
      ...r,
      qIn: formatQ(Number(r.qInRaw), "volume", "step"),
      qOut: formatQ(Number(r.qOutRaw), "volume", "step"),
    }));
  }, [floodTableRows, qUnit]);

  const firmColumns = useMemo(
    () => [
      { key: "rank", label: "排序", align: "right" as const, sortable: false },
      { key: "year", label: "年份", align: "right" as const },
      { key: "power", label: "N_year", unit: "万kW", align: "right" as const },
      {
        key: "qYear",
        label: "q_year",
        unit: qUnit === "m3s" ? "m³/s" : "亿 m³/年",
        align: "right" as const,
      },
      { key: "control", label: "控制供水期", align: "center" as const, sortable: false },
      { key: "months", label: "供水月数", align: "right" as const },
      { key: "status", label: "收敛", align: "center" as const, sortable: false },
    ],
    [qUnit],
  );

  const floodColumns = useMemo(
    () => [
      { key: "step", label: "时段", align: "right" as const },
      {
        key: "qIn",
        label: "入库流量",
        unit: qUnit === "m3s" ? "m³/s" : "万 m³/时段",
        align: "right" as const,
      },
      {
        key: "qOut",
        label: "下泄流量",
        unit: qUnit === "m3s" ? "m³/s" : "万 m³/时段",
        align: "right" as const,
      },
      { key: "storage", label: "库蓄水量", unit: "亿m³", align: "right" as const },
      { key: "level", label: "库蓄水位", unit: "m", align: "right" as const },
    ],
    [qUnit],
  );

  const title =
    stepId === 3
      ? `保证出力逐年计算表 · 方案 ${focusScheme}`
      : `调洪逐时段计算表 · 方案 ${focusScheme}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-slate-900/60 backdrop-blur-md anim-cc-fade-up"
      onClick={onClose}
    >
      {/* Close button (top-right) */}
      <button
        onClick={onClose}
        aria-label="关闭预览"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/90 hover:bg-white p-2 text-slate-700 shadow-lg transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Caption (top-center) */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        {title}
      </div>

      {/* Table (clicking it does NOT close) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[min(96vw,1100px)] max-h-[88vh] rounded-2xl shadow-2xl bg-white overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-800 leading-snug">
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              点击列名排序 · 点击空白处或按 ESC 关闭
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Q 列单位:</span>
            <QUnitToggle unit={qUnit} onChange={setQUnit} />
          </div>
          {stepId === 7 && (
            <InlineSwitcher
              value={activeFloodStd}
              options={[
                { value: "P5", label: "P=5% 防洪" },
                { value: "P0_1", label: "P=0.1% 设计" },
                { value: "P0_01", label: "P=0.01% 校核" },
              ]}
              onChange={setActiveFloodStd}
            />
          )}
        </div>
        <div className="p-3 flex-1 min-h-0 overflow-auto">
          {stepId === 3 && (
            <SimpleDataTable
              columns={firmColumns}
              rows={firmPowerDisplay}
              defaultSortKey="power"
              defaultSortDir="asc"
              emptyText="暂无逐年出力数据"
            />
          )}
          {stepId === 7 && (
            <SimpleDataTable
              columns={floodColumns}
              rows={floodDisplay}
              emptyText="暂无调洪演算数据"
            />
          )}
        </div>
      </div>
    </div>
  );
}
