"use client";

import { useMemo, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Database,
  Droplets,
  Ruler,
  Building2,
  Waves,
  Gauge,
  TrendingUp,
  Calendar,
  Hash,
  Sigma,
  Layers,
  ArrowUpRight,
  Download,
  Upload,
  RotateCcw,
  PencilLine,
  X,
  Check,
  AlertTriangle,
  FileJson,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  YEARS,
  RAW_MONTHLY,
  Z_V_TABLE,
  Z_Q_TABLE,
  SCHEMES,
  SPILLWAY,
  ECON,
  HYDRAULIC_BUILD,
  HOUSE_TRAFFIC,
  MECH,
  COMPENSATION,
  RUN_FACTOR,
  RESERVE,
  FENGTAN_LOSS,
  INVEST_RATIO,
  COMP_RATIO_I,
  COMP_RATIO_II,
  FIRE_INV_RATIO,
  MINE_INV_RATIO,
  R0,
  T_BUILD,
  T_RUN,
  T_FIRE,
  FIRE_KWH_COST,
  MINE_KWH_COST,
  FIRE_FUEL_COST,
  FIRE_OP_FACTOR,
  FIRE_SCALE_CAP,
  FIRE_SCALE_E,
  H_ECON,
  P_FLOOD_DOWN,
  P_DESIGN,
  P_CHECK,
  Q_SAFE,
  P_GEN,
  T_LIFE,
  SED_YEAR,
  IRRIG_Q,
  LOCK_Q,
  SHIP_BASE,
  WIND_V,
  WIND_D,
  SAFETY_1,
  SAFETY_2,
  FLOOD_DATA,
  get_Q_AVG_MS,
  get_ANNUAL_RUNOFF_YI,
} from "@/lib/engine";
import {
  useDataset,
  SCALAR_FIELDS,
  SCALAR_FIELDS_BY_KEY,
  DatasetImportError,
  downloadJson,
  type ScalarKey,
} from "@/hooks/useDataset";

// ============================================================
// 常量
// ============================================================

const SCHEME_KEYS = ["I", "II", "III", "IV"] as const;
const SCHEME_LABELS: Record<string, string> = {
  I: "方案 I",
  II: "方案 II",
  III: "方案 III",
  IV: "方案 IV",
};
const MONTH_NAMES = ["4", "5", "6", "7", "8", "9", "10", "11", "12", "1", "2", "3"];

const FLOOD_KEYS = [
  "P=5% (20年)",
  "P=0.1% (1000年)",
  "P=0.01% (10000年)",
] as const;
const FLOOD_COLORS: Record<string, string> = {
  "P=5% (20年)": "#22c55e",
  "P=0.1% (1000年)": "#f59e0b",
  "P=0.01% (10000年)": "#ef4444",
};

// ============================================================
// 工具函数
// ============================================================

function fmt(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d);
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}
function fmtPct(p: number): string {
  return `${(p * 100).toFixed(2)}%`;
}
function fmtYI(yi: number): string {
  return `${fmt(yi, 3)} 亿m³/年`;
}
function fmtCms(q: number): string {
  return `${fmtInt(q)} m³/s`;
}
function fmtZ(z: number): string {
  return `${fmt(z, 1)} m`;
}

// 归一化到 0..1
function normalize(arr: number[]): number[] {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (max === min) return arr.map(() => 0.5);
  return arr.map((v) => (v - min) / (max - min));
}

// 颜色插值 (紫蓝色阶, 来自项目主色)
function heatColor(t: number): string {
  // t ∈ [0, 1] -> 从浅灰到深紫
  t = Math.max(0, Math.min(1, t));
  const r = Math.round(245 - t * 200);
  const g = Math.round(240 - t * 180);
  const b = Math.round(248 - t * 25);
  return `rgb(${r}, ${g}, ${b})`;
}

function textColor(t: number): string {
  return t > 0.55 ? "#fff" : "#1a1a1a";
}

// ============================================================
// 1. 关键参数卡片
// ============================================================

interface StatDef {
  /** 可编辑标量键; undefined 表示只读 (derived 值) */
  key?: ScalarKey;
  label: string;
  value: string;
  raw: number | string;
  unit?: string;
  hint?: string;
  /** 当 key 存在且 useDataset 给出当前值时, 用 input 编辑; 否则只读 */
  editable?: boolean;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
}

function OverviewTab() {
  const { data, isHydrated, setScalar } = useDataset();

  const stats: StatDef[] = useMemo(() => {
    const qavg = get_Q_AVG_MS();
    const ayi = get_ANNUAL_RUNOFF_YI();
    const s = data.scalars;
    return [
      { key: "Q_SAFE",       label: "下游安全泄量 Q安", value: fmtInt(s.Q_SAFE),     raw: s.Q_SAFE,     unit: "m³/s", hint: "影响调洪演算", editable: true },
      { key: "R0",           label: "经济折算率 r₀",    value: fmt(s.R0, 2),         raw: s.R0,         unit: "—",    hint: "影响年费用比较", editable: true, format: (v) => fmt(v, 2) },
      { key: "P_DESIGN",     label: "设计频率 P设",      value: fmtPct(s.P_DESIGN),   raw: s.P_DESIGN,   hint: "1000 年一遇", editable: true, format: (v) => fmtPct(v) },
      { key: "P_CHECK",      label: "校核频率 P校",      value: fmtPct(s.P_CHECK),    raw: s.P_CHECK,    hint: "10000 年一遇", editable: true, format: (v) => fmtPct(v) },
      { key: "P_GEN",        label: "消落频率 P生",      value: fmtPct(s.P_GEN),      raw: s.P_GEN,      hint: "兴利保证率", editable: true, format: (v) => fmtPct(v) },
      { key: "P_FLOOD_DOWN", label: "发电保证率 P",      value: fmtPct(s.P_FLOOD_DOWN), raw: s.P_FLOOD_DOWN, hint: "下游防洪 20 年", editable: true, format: (v) => fmtPct(v) },
      { key: "H_ECON",       label: "经济利用小时",      value: fmtInt(s.H_ECON),     raw: s.H_ECON,     unit: "h",    hint: "替代电源", editable: true },
      { key: "T_LIFE",       label: "工程寿命 T",        value: fmtInt(s.T_LIFE),     raw: s.T_LIFE,     unit: "年",   hint: "经济计算期", editable: true },
      { key: "T_BUILD",      label: "施工年限 T建",      value: fmtInt(s.T_BUILD),    raw: s.T_BUILD,    unit: "年",   hint: "投资分年", editable: true },
      { key: "T_RUN",        label: "运行年限 T运",      value: fmtInt(s.T_RUN),      raw: s.T_RUN,      unit: "年",   hint: "效益计算", editable: true },
      { key: "T_FIRE",       label: "火电重复年限 T替",  value: fmtInt(s.T_FIRE),     raw: s.T_FIRE,     unit: "年",   hint: "替代投资更新", editable: true },
      { label: "多年平均流量 Q̄", value: fmtInt(qavg),    raw: qavg,                  unit: "m³/s", hint: "由径流矩阵实时计算" },
      { label: "多年平均年水量",  value: fmt(ayi, 1),     raw: ayi,                   unit: "亿m³/年", hint: "由径流矩阵实时计算" },
      { key: "SED_YEAR",     label: "输沙量",            value: fmt(s.SED_YEAR / 1e4, 1), raw: s.SED_YEAR, unit: "万m³/年", editable: true },
      { key: "IRRIG_Q",      label: "灌溉用水",          value: fmtInt(s.IRRIG_Q),    raw: s.IRRIG_Q,    unit: "m³/s", hint: "5~9 月扣除", editable: true },
      { key: "LOCK_Q",       label: "船闸用水",          value: fmtInt(s.LOCK_Q),     raw: s.LOCK_Q,     unit: "m³/s", hint: "全年扣除", editable: true },
      { key: "WIND_V",       label: "风速 W",            value: fmtInt(s.WIND_V),     raw: s.WIND_V,     unit: "m/s",  hint: "坝顶高程", editable: true },
      { key: "WIND_D",       label: "吹程 D",            value: fmtInt(s.WIND_D),     raw: s.WIND_D,     unit: "km",   hint: "波浪计算", editable: true },
      { key: "SAFETY_1",     label: "安全加高 (设计)",   value: fmt(s.SAFETY_1, 1),   raw: s.SAFETY_1,   unit: "m",    editable: true, format: (v) => fmt(v, 1) },
      { key: "SAFETY_2",     label: "安全加高 (校核)",   value: fmt(s.SAFETY_2, 1),   raw: s.SAFETY_2,   unit: "m",    editable: true, format: (v) => fmt(v, 1) },
    ];
  }, [data]);

  if (!isHydrated) {
    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="01 / Key Parameters"
          title="关键设计参数"
          description="任务书与规程中给定的全局常量与水文统计量, 全部参与方案计算。"
          icon={Gauge}
        />
        <div
          className="text-xs font-mono py-8 text-center"
          style={{ color: "var(--muted)" }}
        >
          加载本地数据集…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="01 / Key Parameters"
        title="关键设计参数"
        description="任务书与规程中给定的全局常量与水文统计量, 全部参与方案计算。"
        icon={Gauge}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {stats.map((s) => {
          const meta = s.key ? SCALAR_FIELDS_BY_KEY[s.key] : undefined;
          return (
            <div
              key={s.label}
              className="feature-card relative rounded-xl p-3.5 group"
              style={{
                backgroundColor: "var(--bg-canvas)",
                border: s.editable
                  ? "1px solid var(--accent-color)"
                  : "1px solid var(--border)",
              }}
            >
              <div
                className="text-[10px] uppercase tracking-widest font-mono mb-2 flex items-center justify-between"
                style={{ color: "var(--muted)" }}
              >
                <span>{s.label}</span>
                {s.editable && (
                  <PencilLine
                    className="h-3 w-3"
                    style={{ color: "var(--accent-color)" }}
                  />
                )}
              </div>
              {s.editable && s.key ? (
                <ScalarInput
                  k={s.key}
                  value={s.raw as number}
                  display={s.value}
                  unit={s.unit}
                  hint={s.hint}
                  step={s.step ?? meta?.step ?? 1}
                  min={s.min ?? meta?.min}
                  max={s.max ?? meta?.max}
                  onCommit={(v) => setScalar(s.key as ScalarKey, v)}
                />
              ) : (
                <>
                  <div
                    className="font-mono tabular-nums text-2xl font-semibold tracking-tight"
                    style={{ color: "var(--text)" }}
                  >
                    {s.value}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    {s.unit && (
                      <span
                        className="text-[11px] font-mono"
                        style={{ color: "var(--muted)" }}
                      >
                        {s.unit}
                      </span>
                    )}
                    {s.hint && (
                      <span
                        className="text-[10px] truncate ml-auto"
                        style={{ color: "var(--muted)" }}
                        title={s.hint}
                      >
                        {s.hint}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* 数据规模摘要 */}
      <div
        className="rounded-xl px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono"
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--accent-color)" }}>
          <Database className="h-3.5 w-3.5" /> 数据规模
        </span>
        <span>径流 <b style={{ color: "var(--text)" }}>{YEARS.length}</b> 年 × <b style={{ color: "var(--text)" }}>12</b> 月 = <b style={{ color: "var(--text)" }}>{YEARS.length * 12}</b> 个流量值</span>
        <span>Z-V 曲线 <b style={{ color: "var(--text)" }}>{Z_V_TABLE.length}</b> 个控制点</span>
        <span>Z-Q 曲线 <b style={{ color: "var(--text)" }}>{Z_Q_TABLE.length}</b> 个控制点</span>
        <span>设计洪水 <b style={{ color: "var(--text)" }}>3</b> 场</span>
        <span>比较方案 <b style={{ color: "var(--text)" }}>4</b> 个</span>
      </div>
    </div>
  );
}

// ============================================================
// 2. 径流月序列
// ============================================================

function RunoffTab() {
  // 展开为行: { year, m1..m12, annual_avg, annual_total_yi }
  const rows = useMemo(() => {
    return YEARS.map((y, i) => {
      const row = RAW_MONTHLY[i];
      const sum = row.reduce((a, b) => a + b, 0);
      const avg = sum / 12;
      const annual_yi = (avg * 30.4 * 86400 * 12) / 1e8;
      return {
        year: y,
        months: row,
        annual_avg: avg,
        annual_yi,
      };
    });
  }, []);

  const monthMatrix = useMemo(() => {
    // shape: [year_idx][month_idx] -> value
    return rows.map((r) => r.months);
  }, [rows]);

  // 颜色归一化的 max/min
  const allValues = RAW_MONTHLY.flat();
  const vMin = Math.min(...allValues);
  const vMax = Math.max(...allValues);

  // 各月多年平均
  const monthAvg = useMemo(() => {
    return Array.from({ length: 12 }, (_, k) => {
      let sum = 0;
      for (let i = 0; i < RAW_MONTHLY.length; i++) sum += RAW_MONTHLY[i][k];
      return sum / RAW_MONTHLY.length;
    });
  }, []);

  const annualAvgData = useMemo(
    () =>
      rows.map((r) => ({
        year: String(r.year),
        年均流量: Math.round(r.annual_avg),
        年水量: Math.round(r.annual_yi * 10) / 10,
      })),
    [rows]
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="02 / Runoff"
        title="31 年径流月序列"
        description="1950/4 ~ 1981/3 共 31 个水文年的月平均流量, 顺序为 4 月起、次年 3 月止。"
        icon={Droplets}
      />
      <DataTableHint name="径流" rows={RAW_MONTHLY.length} cols={12} schemaPath="raw_monthly" />

      {/* 摘要指标 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat label="水文年数" value={`${YEARS.length}`} unit="年" />
        <SummaryStat
          label="多年平均流量"
          value={fmtInt(get_Q_AVG_MS())}
          unit="m³/s"
        />
        <SummaryStat
          label="多年平均年水量"
          value={fmt(get_ANNUAL_RUNOFF_YI(), 1)}
          unit="亿m³/年"
        />
        <SummaryStat
          label="最大月流量"
          value={fmtInt(vMax)}
          unit="m³/s"
        />
      </div>

      {/* 热图 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" style={{ color: "var(--accent-color)" }} />
            月流量热图 (m³/s)
          </CardTitle>
          <CardDescription>
            颜色越深 → 流量越大；悬浮查看精确值。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-2">
            <div className="inline-block min-w-full">
              {/* 表头: 月份 */}
              <div
                className="grid items-center gap-1 mb-1.5 text-[10px] font-mono"
                style={{
                  gridTemplateColumns: `56px repeat(12, minmax(48px, 1fr)) 80px`,
                  color: "var(--muted)",
                }}
              >
                <div></div>
                {MONTH_NAMES.map((m) => (
                  <div key={m} className="text-center">{m}月</div>
                ))}
                <div className="text-center">年均</div>
              </div>

              {/* 主体 */}
              {rows.map((r, i) => (
                <div
                  key={r.year}
                  className="grid items-center gap-1 mb-1"
                  style={{
                    gridTemplateColumns: `56px repeat(12, minmax(48px, 1fr)) 80px`,
                  }}
                >
                  <div
                    className="text-[10px] font-mono tabular-nums text-right pr-2"
                    style={{ color: "var(--muted)" }}
                  >
                    {r.year}
                  </div>
                  {r.months.map((v, k) => {
                    const t = (v - vMin) / (vMax - vMin || 1);
                    return (
                      <div
                        key={k}
                        title={`${r.year} 年 ${MONTH_NAMES[k]} 月: ${fmtInt(v)} m³/s`}
                        className="h-7 rounded-sm flex items-center justify-center text-[10px] font-mono tabular-nums cursor-default transition-transform hover:scale-110 hover:z-10"
                        style={{
                          backgroundColor: heatColor(t),
                          color: textColor(t),
                        }}
                      >
                        {v > vMax * 0.6 ? fmtInt(v) : ""}
                      </div>
                    );
                  })}
                  <div
                    className="h-7 rounded-sm flex items-center justify-center text-[10px] font-mono tabular-nums font-semibold"
                    style={{
                      backgroundColor: "var(--accent-soft)",
                      color: "var(--accent-color)",
                    }}
                    title={`${r.year} 年均: ${fmtInt(r.annual_avg)} m³/s`}
                  >
                    {fmtInt(r.annual_avg)}
                  </div>
                </div>
              ))}

              {/* 月平均行 */}
              <div
                className="grid items-center gap-1 mt-2 pt-2 border-t"
                style={{
                  gridTemplateColumns: `56px repeat(12, minmax(48px, 1fr)) 80px`,
                  borderColor: "var(--border)",
                }}
              >
                <div
                  className="text-[10px] font-mono font-semibold text-right pr-2"
                  style={{ color: "var(--accent-color)" }}
                >
                  月均
                </div>
                {monthAvg.map((v, k) => {
                  const t = (v - vMin) / (vMax - vMin || 1);
                  return (
                    <div
                      key={k}
                      title={`${MONTH_NAMES[k]} 月 31 年平均: ${fmtInt(v)} m³/s`}
                      className="h-7 rounded-sm flex items-center justify-center text-[10px] font-mono tabular-nums font-semibold"
                      style={{
                        backgroundColor: "var(--surface)",
                        color: "var(--text)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {fmtInt(v)}
                    </div>
                  );
                })}
                <div
                  className="h-7 rounded-sm flex items-center justify-center text-[10px] font-mono tabular-nums font-bold"
                  style={{
                    backgroundColor: "var(--accent-color)",
                    color: "white",
                  }}
                >
                  {fmtInt(get_Q_AVG_MS())}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 年均流量柱状图 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: "var(--accent-color)" }} />
            各年年均流量
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={annualAvgData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                label={{
                  value: "m³/s",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "var(--muted)", fontSize: 11 },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: any) => [`${v} m³/s`, "年均流量"]}
              />
              <ReferenceLine
                y={get_Q_AVG_MS()}
                stroke="var(--accent-color)"
                strokeDasharray="4 4"
                label={{
                  value: `Q̄=${fmtInt(get_Q_AVG_MS())}`,
                  position: "right",
                  fill: "var(--accent-color)",
                  fontSize: 10,
                }}
              />
              <Bar dataKey="年均流量" radius={[2, 2, 0, 0]}>
                {annualAvgData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.年均流量 >= get_Q_AVG_MS() ? "var(--accent-color)" : "var(--muted)"}
                    fillOpacity={d.年均流量 >= get_Q_AVG_MS() ? 0.85 : 0.35}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 详细数据表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="h-4 w-4" style={{ color: "var(--accent-color)" }} />
            完整数据表
          </CardTitle>
          <CardDescription>31 年 × 12 月流量 (m³/s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="overflow-auto rounded-lg"
            style={{ border: "1px solid var(--border)", maxHeight: 400 }}
          >
            <table className="w-full text-xs font-mono tabular-nums">
                <thead
                  className="sticky top-0 z-10"
                  style={{ backgroundColor: "var(--bg-canvas)" }}
                >
                  <tr>
                    <th
                      className="px-2 py-1.5 text-left font-medium sticky left-0 z-10"
                      style={{ backgroundColor: "var(--bg-canvas)", color: "var(--muted)" }}
                    >
                      年份
                    </th>
                    {MONTH_NAMES.map((m) => (
                      <th
                        key={m}
                        className="px-2 py-1.5 text-right font-medium"
                        style={{
                          backgroundColor: "var(--bg-canvas)",
                          color: "var(--muted)",
                        }}
                      >
                        {m}月
                      </th>
                    ))}
                  <th
                    className="px-2 py-1.5 text-right font-semibold"
                    style={{
                      color: "var(--accent-color)",
                      backgroundColor: "var(--accent-soft)",
                    }}
                  >
                    年均
                  </th>
                  <th
                    className="px-2 py-1.5 text-right font-semibold"
                    style={{
                      color: "var(--accent-color)",
                      backgroundColor: "var(--accent-soft)",
                    }}
                  >
                    年水量(亿m³)
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.year}
                    className="border-t hover:bg-[var(--surface-hover)] transition-colors"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td
                      className="px-2 py-1 text-left sticky left-0 font-semibold"
                      style={{
                        backgroundColor: "var(--bg-canvas)",
                        color: "var(--text)",
                      }}
                    >
                      {r.year}
                    </td>
                    {r.months.map((v, k) => (
                      <td
                        key={k}
                        className="px-2 py-1 text-right"
                        style={{ color: "var(--text)" }}
                      >
                        {fmtInt(v)}
                      </td>
                    ))}
                    <td
                      className="px-2 py-1 text-right font-semibold"
                      style={{
                        color: "var(--accent-color)",
                        backgroundColor: "var(--accent-soft)",
                      }}
                    >
                      {fmtInt(r.annual_avg)}
                    </td>
                    <td
                      className="px-2 py-1 text-right font-semibold"
                      style={{
                        color: "var(--accent-color)",
                        backgroundColor: "var(--accent-soft)",
                      }}
                    >
                      {fmt(r.annual_yi, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// 3. 库容/泄流曲线
// ============================================================

function CurvesTab() {
  const zvData = useMemo(
    () => Z_V_TABLE.map(([z, v, msm]) => ({ Z: z, V: v, MSM: msm })),
    []
  );
  const zqData = useMemo(
    () => Z_Q_TABLE.map(([z, q]) => ({ Z: z, Q: q })),
    []
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="03 / Reservoir & Tailwater Curves"
        title="水位-库容 / 水位-泄量曲线"
        description="Z-V 来自任务书表 2, Z-Q 来自表 3, 用于水位库容插值与下游水位反查。"
        icon={Ruler}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <DataTableHint name="Z-V 曲线" rows={Z_V_TABLE.length} schemaPath="zv" />
        <DataTableHint name="Z-Q 曲线" rows={Z_Q_TABLE.length} schemaPath="zq" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Z-V */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Waves className="h-4 w-4" style={{ color: "var(--accent-color)" }} />
              水位-库容曲线 (Z-V)
            </CardTitle>
            <CardDescription>
              {Z_V_TABLE.length} 个控制点 · 单位 亿m³ / m³·s·月
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={zvData}
                margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="zvFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-color)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--accent-color)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="Z"
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  label={{
                    value: "水位 Z (m)",
                    position: "insideBottom",
                    offset: -2,
                    style: { fill: "var(--muted)", fontSize: 11 },
                  }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  label={{
                    value: "V (亿m³)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "var(--muted)", fontSize: 11 },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  label={{
                    value: "V (m³/s·月)",
                    angle: 90,
                    position: "insideRight",
                    style: { fill: "var(--muted)", fontSize: 11 },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--bg-canvas)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="V"
                  stroke="var(--accent-color)"
                  strokeWidth={2}
                  fill="url(#zvFill)"
                  name="库容 (亿m³)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="MSM"
                  stroke="var(--muted)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={{ r: 3, fill: "var(--muted)" }}
                  name="库容 (m³/s·月)"
                />
                {SCHEME_KEYS.map((sk) => (
                  <ReferenceLine
                    key={sk}
                    yAxisId="left"
                    x={SCHEMES[sk].Z_zheng}
                    stroke={["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"][
                      SCHEME_KEYS.indexOf(sk as any)
                    ]}
                    strokeDasharray="4 4"
                    label={{
                      value: `方案${sk}: ${SCHEMES[sk].Z_zheng}m`,
                      position: "top",
                      fontSize: 9,
                      fill: "var(--muted)",
                    }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Z-Q */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: "#22c55e" }} />
              下游水位-流量曲线 (Z-q)
            </CardTitle>
            <CardDescription>
              {Z_Q_TABLE.length} 个控制点 · 用于调洪演算中由 Q 反查下游水位
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={zqData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="zqFill" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.05} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="Q"
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  label={{
                    value: "流量 q (m³/s)",
                    position: "insideBottom",
                    offset: -2,
                    style: { fill: "var(--muted)", fontSize: 11 },
                  }}
                />
                <YAxis
                  dataKey="Z"
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  label={{
                    value: "下游水位 Z (m)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "var(--muted)", fontSize: 11 },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--bg-canvas)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: any, n: any) => [n === "Z" ? `${v} m` : `${v} m³/s`, n]}
                />
                <Line
                  type="monotone"
                  dataKey="Z"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#22c55e" }}
                  name="Z"
                />
                <ReferenceLine
                  x={Q_SAFE}
                  stroke="#ef4444"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Q安=${fmtInt(Q_SAFE)}`,
                    position: "top",
                    fill: "#ef4444",
                    fontSize: 11,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 数据表 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Z-V 控制点</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="overflow-auto rounded-lg"
              style={{ border: "1px solid var(--border)", maxHeight: 300 }}
            >
              <table className="w-full text-xs font-mono tabular-nums">
                <thead
                  className="sticky top-0"
                  style={{ backgroundColor: "var(--bg-canvas)" }}
                >
                  <tr>
                    <th
                      className="px-3 py-1.5 text-left"
                      style={{ backgroundColor: "var(--bg-canvas)", color: "var(--muted)" }}
                    >
                      水位 (m)
                    </th>
                    <th
                      className="px-3 py-1.5 text-right"
                      style={{ backgroundColor: "var(--bg-canvas)", color: "var(--muted)" }}
                    >
                      库容 (亿m³)
                    </th>
                    <th
                      className="px-3 py-1.5 text-right"
                      style={{ backgroundColor: "var(--bg-canvas)", color: "var(--muted)" }}
                    >
                      库容 (m³/s·月)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Z_V_TABLE.map(([z, v, msm], i) => (
                    <tr
                      key={i}
                      className="border-t"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="px-3 py-1 font-semibold" style={{ color: "var(--text)" }}>
                        {z}
                      </td>
                      <td className="px-3 py-1 text-right" style={{ color: "var(--accent-color)" }}>
                        {fmt(v, 3)}
                      </td>
                      <td className="px-3 py-1 text-right" style={{ color: "var(--muted)" }}>
                        {fmt(msm, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Z-Q 控制点</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="overflow-auto rounded-lg"
              style={{ border: "1px solid var(--border)", maxHeight: 300 }}
            >
              <table className="w-full text-xs font-mono tabular-nums">
                <thead
                  className="sticky top-0"
                  style={{ backgroundColor: "var(--bg-canvas)" }}
                >
                  <tr>
                    <th
                      className="px-3 py-1.5 text-left"
                      style={{ backgroundColor: "var(--bg-canvas)", color: "var(--muted)" }}
                    >
                      水位 (m)
                    </th>
                    <th
                      className="px-3 py-1.5 text-right"
                      style={{ backgroundColor: "var(--bg-canvas)", color: "var(--muted)" }}
                    >
                      流量 (m³/s)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Z_Q_TABLE.map(([z, q], i) => (
                    <tr
                      key={i}
                      className="border-t"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="px-3 py-1 font-semibold" style={{ color: "var(--text)" }}>
                        {fmt(z, 1)}
                      </td>
                      <td className="px-3 py-1 text-right" style={{ color: "#22c55e" }}>
                        {fmtInt(q)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// 4. 方案设计参数
// ============================================================

function SchemeTab() {
  const SCHEME_COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"];

  // 投资对比
  const investData = useMemo(
    () =>
      SCHEME_KEYS.map((sk, i) => ({
        scheme: SCHEME_LABELS[sk],
        大坝: ECON[sk].dam_invest,
        机电: ECON[sk].mech_invest,
        临时: ECON[sk].temp_invest,
        补偿: ECON[sk].comp_invest,
        合计: ECON[sk].dam_invest + ECON[sk].mech_invest + ECON[sk].temp_invest + ECON[sk].comp_invest,
        _key: sk,
      })),
    []
  );

  // 投资分年比例
  const investRatioData = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => {
        const obj: any = { year: i + 1 };
        for (const sk of SCHEME_KEYS) {
          obj[sk] = INVEST_RATIO[sk][i] || 0;
        }
        return obj;
      }),
    []
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="04 / Scheme Configuration"
        title="4 个方案设计参数"
        description="正常蓄水位、泄洪建筑、经济指标等 4 方案核心配置。"
        icon={Building2}
      />

      {/* 方案核心参数 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {SCHEME_KEYS.map((sk, i) => (
          <div
            key={sk}
            className="feature-card rounded-xl p-4"
            style={{
              backgroundColor: "var(--bg-canvas)",
              border: `1px solid ${SCHEME_COLORS[i]}40`,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <Badge
                className="font-mono"
                style={{
                  backgroundColor: SCHEME_COLORS[i],
                  color: "white",
                }}
              >
                方案 {sk}
              </Badge>
              <div
                className="text-[10px] font-mono uppercase tracking-widest"
                style={{ color: "var(--muted)" }}
              >
                Z正 = {SCHEMES[sk].Z_zheng} m
              </div>
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              <KV label="正常蓄水位" value={`${SCHEMES[sk].Z_zheng} m`} accent />
              <KV label="最大坝高" value={`${SCHEMES[sk].H_dam_max} m`} />
              <KV
                label="溢流坝"
                value={`${SPILLWAY[sk].spill_n} 孔 × ${SPILLWAY[sk].spill_b}m`}
              />
              <KV
                label="溢流坝顶"
                value={`${SPILLWAY[sk].spill_crest} m`}
              />
              {SPILLWAY[sk].mid_n > 0 && (
                <KV
                  label="中孔"
                  value={`${SPILLWAY[sk].mid_n} 孔 × ${SPILLWAY[sk].mid_b}×${SPILLWAY[sk].mid_h}m`}
                />
              )}
              <KV
                label="装机"
                value={`${ECON[sk].install_cap} 万 kW`}
              />
              <KV label="备用容量" value={`${RESERVE[sk]} 万 kW`} />
              <KV
                label="运行费率"
                value={`${RUN_FACTOR[sk]}%`}
              />
              {FENGTAN_LOSS[sk].N > 0 && (
                <KV
                  label="丰潭损失"
                  value={`N:${FENGTAN_LOSS[sk].N} E:${FENGTAN_LOSS[sk].E}`}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 投资对比 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sigma className="h-4 w-4" style={{ color: "var(--accent-color)" }} />
            枢纽投资组成 (万元)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={investData}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="scheme" tick={{ fontSize: 11, fill: "var(--muted)" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                label={{
                  value: "万元",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "var(--muted)", fontSize: 11 },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: any) => [fmtInt(v as number) + " 万", ""]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="大坝" stackId="a" fill="#1f77b4" />
              <Bar dataKey="机电" stackId="a" fill="#ff7f0e" />
              <Bar dataKey="临时" stackId="a" fill="#2ca02c" />
              <Bar dataKey="补偿" stackId="a" fill="#d62728" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 投资分年比例 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" style={{ color: "var(--accent-color)" }} />
            投资分年比例 ({T_BUILD} 年施工期)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={investRatioData}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                label={{
                  value: "施工年序",
                  position: "insideBottom",
                  offset: -2,
                  style: { fill: "var(--muted)", fontSize: 11 },
                }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: any) => `${(Number(v) * 100).toFixed(1)}%`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {SCHEME_KEYS.map((sk, i) => (
                <Line
                  key={sk}
                  type="monotone"
                  dataKey={sk}
                  stroke={SCHEME_COLORS[i]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name={`方案 ${sk}`}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 详细对比表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">方案经济指标详细对比</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="overflow-auto rounded-lg"
            style={{ border: "1px solid var(--border)" }}
          >
            <table className="w-full text-xs font-mono tabular-nums">
              <thead style={{ backgroundColor: "var(--surface)" }}>
                <tr>
                  <th
                    className="px-3 py-2 text-left sticky left-0 z-10"
                    style={{ backgroundColor: "var(--surface)", color: "var(--muted)" }}
                  >
                    指标
                  </th>
                  {SCHEME_KEYS.map((sk, i) => (
                    <th
                      key={sk}
                      className="px-3 py-2 text-right"
                      style={{
                        backgroundColor: `${SCHEME_COLORS[i]}15`,
                        color: SCHEME_COLORS[i],
                      }}
                    >
                      方案 {sk}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="大坝投资 (万元)">
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{fmtInt(ECON[sk].dam_invest)}</Td>
                  ))}
                </Row>
                <Row label="机电投资 (万元)">
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{fmtInt(ECON[sk].mech_invest)}</Td>
                  ))}
                </Row>
                <Row label="临时工程 (万元)">
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{fmtInt(ECON[sk].temp_invest)}</Td>
                  ))}
                </Row>
                <Row label="补偿投资 (万元)">
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{fmtInt(ECON[sk].comp_invest)}</Td>
                  ))}
                </Row>
                <Row label="水工建筑 (万元)" highlight>
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{fmtInt(HYDRAULIC_BUILD[sk].cost)}</Td>
                  ))}
                </Row>
                <Row label="水工修理 (万元)">
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{fmt(HYDRAULIC_BUILD[sk].overhaul, 1)}</Td>
                  ))}
                </Row>
                <Row label="机电安装 (万kW)">
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{MECH[sk].install}</Td>
                  ))}
                </Row>
                <Row label="机电成本 (万元)">
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{fmtInt(MECH[sk].cost)}</Td>
                  ))}
                </Row>
                <Row label="机电修理 (万元)">
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{fmt(MECH[sk].overhaul, 1)}</Td>
                  ))}
                </Row>
                <Row label="房屋交通 (万元)">
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{fmtInt(HOUSE_TRAFFIC[sk].cost)}</Td>
                  ))}
                </Row>
                <Row label="补偿原值 (万元)">
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{fmtInt(COMPENSATION[sk].value)}</Td>
                  ))}
                </Row>
                <Row label="年补偿费 (万元)">
                  {SCHEME_KEYS.map((sk) => (
                    <Td key={sk}>{fmt(COMPENSATION[sk].deduct, 1)}</Td>
                  ))}
                </Row>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// 5. 设计洪水
// ============================================================

function FloodTab() {
  const floodData = useMemo(() => {
    // 取最长的 10000 年 (88 时刻) 作为 x 轴
    const len = FLOOD_DATA["P=0.01% (10000年)"].length;
    return Array.from({ length: len }, (_, i) => {
      const obj: any = { t: i + 1 };
      for (const key of FLOOD_KEYS) {
        obj[key] = FLOOD_DATA[key][i] ?? null;
      }
      return obj;
    });
  }, []);

  // 洪峰统计
  const floodStats = useMemo(
    () =>
      FLOOD_KEYS.map((key) => {
        const arr = FLOOD_DATA[key];
        return {
          key,
          Qmax: Math.max(...arr),
          峰现时刻: arr.indexOf(Math.max(...arr)) + 1,
          历时: arr.length,
          均值: arr.reduce((a, b) => a + b, 0) / arr.length,
        };
      }),
    []
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="05 / Design Floods"
        title="三场设计洪水过程线"
        description="P=5% (下游防洪)、P=0.1% (设计)、P=0.01% (校核) 三场典型洪水, 用于调洪演算。"
        icon={Waves}
      />
      <DataTableHint
        name="洪水过程线"
        rows={Math.max(...FLOOD_KEYS.map((k) => FLOOD_DATA[k].length))}
        schemaPath="floods"
      />

      {/* 洪峰卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {floodStats.map((s) => (
          <div
            key={s.key}
            className="feature-card rounded-xl p-4"
            style={{
              backgroundColor: "var(--bg-canvas)",
              border: `1px solid ${FLOOD_COLORS[s.key]}40`,
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <Badge
                className="font-mono"
                style={{ backgroundColor: FLOOD_COLORS[s.key], color: "white" }}
              >
                {s.key}
              </Badge>
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              <div>
                <div
                  className="text-[10px] uppercase tracking-widest mb-0.5"
                  style={{ color: "var(--muted)" }}
                >
                  洪峰流量
                </div>
                <div
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: FLOOD_COLORS[s.key] }}
                >
                  {fmtInt(s.Qmax)}
                </div>
                <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                  m³/s · 第 {s.峰现时刻} 时刻
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                <div>
                  <div className="text-[10px]" style={{ color: "var(--muted)" }}>历时</div>
                  <div className="font-semibold" style={{ color: "var(--text)" }}>
                    {s.历时} × 3h
                  </div>
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: "var(--muted)" }}>均值</div>
                  <div className="font-semibold" style={{ color: "var(--text)" }}>
                    {fmtInt(s.均值)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 过程线叠加 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: "var(--accent-color)" }} />
            三场洪水过程线叠加
          </CardTitle>
          <CardDescription>横轴为 3 小时步长的时刻数</CardDescription>
        </CardHeader>
        <CardContent className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={floodData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <defs>
                {FLOOD_KEYS.map((k) => (
                  <linearGradient
                    key={k}
                    id={`grad-${k}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={FLOOD_COLORS[k]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={FLOOD_COLORS[k]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                label={{
                  value: "时刻 (× 3h)",
                  position: "insideBottom",
                  offset: -2,
                  style: { fill: "var(--muted)", fontSize: 11 },
                }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                label={{
                  value: "流量 (m³/s)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "var(--muted)", fontSize: 11 },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: any) => `${fmtInt(v as number)} m³/s`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {FLOOD_KEYS.map((k) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={FLOOD_COLORS[k]}
                  strokeWidth={2}
                  dot={false}
                  name={k}
                />
              ))}
              <ReferenceLine
                y={Q_SAFE}
                stroke="var(--accent-color)"
                strokeDasharray="6 4"
                label={{
                  value: `Q安=${fmtInt(Q_SAFE)}`,
                  position: "right",
                  fill: "var(--accent-color)",
                  fontSize: 10,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 洪水数据表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">完整洪水数据 (m³/s)</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="overflow-auto rounded-lg"
            style={{ border: "1px solid var(--border)", maxHeight: 400 }}
          >
            <table className="w-full text-xs font-mono tabular-nums">
                <thead
                  className="sticky top-0"
                  style={{ backgroundColor: "var(--bg-canvas)" }}
                >
                  <tr>
                    <th
                      className="px-3 py-1.5 text-left sticky left-0"
                      style={{ backgroundColor: "var(--bg-canvas)", color: "var(--muted)" }}
                    >
                      时刻
                    </th>
                    {FLOOD_KEYS.map((k) => (
                      <th
                        key={k}
                        className="px-3 py-1.5 text-right"
                        style={{
                          backgroundColor: "var(--bg-canvas)",
                          color: FLOOD_COLORS[k],
                        }}
                      >
                        {k}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {floodData.map((d) => (
                  <tr
                    key={d.t}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td
                      className="px-3 py-0.5 text-left sticky left-0 font-semibold"
                      style={{ backgroundColor: "var(--bg-canvas)", color: "var(--text)" }}
                    >
                      {d.t}
                    </td>
                    {FLOOD_KEYS.map((k) => (
                      <td
                        key={k}
                        className="px-3 py-0.5 text-right"
                        style={{ color: FLOOD_COLORS[k] }}
                      >
                        {d[k] != null ? fmtInt(d[k]) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// 6. 经济/工程参数
// ============================================================

function EconomicTab() {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="06 / Economic & Substitution"
        title="经济与替代指标"
        description="经济计算与火电/煤矿替代投资相关的全部系数。"
        icon={Sigma}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 时间与折算 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">时间参数与折算</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 font-mono text-sm">
              <DataRow label="经济折算率 r₀" value={fmt(R0, 2)} />
              <DataRow label="施工年限 T建" value={`${T_BUILD} 年`} />
              <DataRow label="运行年限 T运" value={`${T_RUN} 年`} />
              <DataRow label="火电重复年限 T替" value={`${T_FIRE} 年`} />
              <DataRow label="工程寿命 T" value={`${T_LIFE} 年`} />
              <DataRow label="经济利用小时" value={`${fmtInt(H_ECON)} h`} />
            </div>
          </CardContent>
        </Card>

        {/* 替代指标 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">替代电源 / 煤矿投资</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 font-mono text-sm">
              <DataRow label="火电单位千瓦投资" value={`${FIRE_KWH_COST} 元/kW`} />
              <DataRow label="火电燃料费" value={`${FIRE_FUEL_COST} 元/度`} />
              <DataRow label="火电运行费率" value={`${(FIRE_OP_FACTOR * 100).toFixed(0)}%`} />
              <DataRow label="火电规模系数 (容量)" value={fmt(FIRE_SCALE_CAP, 2)} />
              <DataRow label="火电规模系数 (电量)" value={fmt(FIRE_SCALE_E, 2)} />
              <DataRow label="煤矿吨煤投资" value={`${MINE_KWH_COST} 元/度`} />
            </div>
          </CardContent>
        </Card>

        {/* 投资分年比例 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">枢纽投资分年比例</CardTitle>
            <CardDescription>{T_BUILD} 年施工期</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 font-mono text-xs">
              <div>
                <div className="font-semibold mb-1" style={{ color: "var(--muted)" }}>
                  4 方案分年
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="px-1 py-1 text-left" style={{ color: "var(--muted)" }}>
                          方案
                        </th>
                        {INVEST_RATIO.I.map((_, i) => (
                          <th
                            key={i}
                            className="px-1 py-1 text-right"
                            style={{ color: "var(--muted)" }}
                          >
                            Y{i + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SCHEME_KEYS.map((sk) => (
                        <tr key={sk}>
                          <td
                            className="px-1 py-0.5 font-semibold"
                            style={{ color: "var(--text)" }}
                          >
                            {sk}
                          </td>
                          {INVEST_RATIO[sk].map((r, i) => (
                            <td
                              key={i}
                              className="px-1 py-0.5 text-right"
                              style={{ color: "var(--text)" }}
                            >
                              {(r * 100).toFixed(1)}%
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div
                className="pt-2 border-t text-[10px]"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                ⚠️ 表中数字为投资分年比例, 总和=1.0 (每行)
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 其他分年比例 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">其他分年比例</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 font-mono text-xs">
              <RatioRow label="补偿 I (7 年)" data={COMP_RATIO_I} />
              <RatioRow label="补偿 II (6 年)" data={COMP_RATIO_II} />
              <RatioRow label="火电投资 (6 年)" data={FIRE_INV_RATIO} />
              <RatioRow label="煤矿投资 (6 年)" data={MINE_INV_RATIO} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// 共用小组件
// ============================================================

function SectionHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        className="p-2.5 rounded-xl shrink-0"
        style={{
          backgroundColor: "var(--accent-soft)",
          color: "var(--accent-color)",
        }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div
          className="text-[10px] font-mono uppercase tracking-widest mb-0.5"
          style={{ color: "var(--accent-color)" }}
        >
          {eyebrow}
        </div>
        <h2
          className="font-display text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          {title}
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div
        className="text-[10px] uppercase tracking-widest font-mono"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span
          className="font-mono tabular-nums text-2xl font-semibold"
          style={{ color: "var(--text)" }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function KV({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span
        className="tabular-nums font-semibold"
        style={{ color: accent ? "var(--accent-color)" : "var(--text)" }}
      >
        {value}
      </span>
    </div>
  );
}

function Row({
  label,
  children,
  highlight,
}: {
  label: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <tr
      className="border-t"
      style={{
        borderColor: "var(--border)",
        backgroundColor: highlight ? "var(--surface)" : "transparent",
      }}
    >
      <td
        className="px-3 py-1.5 text-left sticky left-0 font-medium"
        style={{
          backgroundColor: "inherit",
          color: highlight ? "var(--text)" : "var(--muted)",
        }}
      >
        {label}
      </td>
      {children}
    </tr>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-1.5 text-right" style={{ color: "var(--text)" }}>
      {children}
    </td>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between py-1.5 border-b last:border-b-0"
      style={{ borderColor: "var(--border)" }}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span className="tabular-nums font-semibold" style={{ color: "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}

function RatioRow({ label, data }: { label: string; data: number[] }) {
  return (
    <div
      className="py-1.5 border-b last:border-b-0"
      style={{ borderColor: "var(--border)" }}
    >
      <div style={{ color: "var(--muted)" }} className="mb-1">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {data.map((v, i) => (
          <span
            key={i}
            className="px-1.5 py-0.5 rounded text-[10px] tabular-nums"
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--text)",
            }}
          >
            Y{i + 1}: {(v * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 标量编辑 input (回车 / 失焦 commit, Esc 取消)
// ============================================================

function ScalarInput({
  k,
  value,
  display,
  unit,
  hint,
  step,
  min,
  max,
  onCommit,
}: {
  k: ScalarKey;
  value: number;
  display: string;
  unit?: string;
  hint?: string;
  step: number;
  min?: number;
  max?: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showValue = draft ?? display;

  function commit() {
    if (draft == null) return;
    const n = Number(draft);
    if (!Number.isFinite(n)) {
      setDraft(null);
      return;
    }
    let v = n;
    if (typeof min === "number" && v < min) v = min;
    if (typeof max === "number" && v > max) v = max;
    if (v !== value) onCommit(v);
    setDraft(null);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={showValue}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            inputRef.current?.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(null);
            inputRef.current?.blur();
          }
        }}
        title={hint ?? k}
        className="font-mono tabular-nums text-2xl font-semibold tracking-tight w-full bg-transparent border-b border-dashed focus:outline-none focus:border-solid"
        style={{
          color: "var(--accent-color)",
          borderColor: draft != null ? "var(--accent-color)" : "var(--border)",
        }}
      />
      <div className="flex items-center justify-between mt-1">
        {unit && (
          <span
            className="text-[11px] font-mono"
            style={{ color: "var(--muted)" }}
          >
            {unit}
          </span>
        )}
        {hint && (
          <span
            className="text-[10px] truncate ml-auto"
            style={{ color: "var(--muted)" }}
            title={hint}
          >
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 二维数据编辑入口提示
// ============================================================

function DataTableHint({
  name,
  rows,
  cols,
  schemaPath,
}: {
  name: string;
  rows: number;
  cols?: number;
  schemaPath: string;
}) {
  const { data, isHydrated } = useDataset();
  if (!isHydrated) return null;
  const liveRows =
    name === "径流" ? data.raw_monthly.length :
    name === "Z-V 曲线" ? data.zv.length :
    name === "Z-Q 曲线" ? data.zq.length :
    name === "洪水过程线" ? Object.values(data.floods).reduce((a, b) => Math.max(a, b.length), 0) :
    rows;
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg px-4 py-2.5 text-[11px] font-mono"
      style={{
        backgroundColor: "var(--surface)",
        border: "1px dashed var(--border)",
        color: "var(--muted)",
      }}
    >
      <span className="inline-flex items-center gap-1.5" style={{ color: "var(--accent-color)" }}>
        <FileJson className="h-3.5 w-3.5" /> {name}
      </span>
      <span>
        当前 <b style={{ color: "var(--text)" }}>{liveRows}</b>
        {cols ? <> × <b style={{ color: "var(--text)" }}>{cols}</b></> : null} 条记录
      </span>
      <span className="ml-auto">
        通过页面顶部的
        <span style={{ color: "var(--accent-color)" }}>「导入 JSON」</span>
        修改本表 (JSON key: <code style={{ color: "var(--text)" }}>{schemaPath}</code>)
      </span>
    </div>
  );
}

// ============================================================
// 数据集导入 / 导出 / 重置 按钮组
// ============================================================

function ImportExportBar({ compact = false }: { compact?: boolean }) {
  const { isHydrated, isModified, importJson, exportJson, reset } = useDataset();
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isHydrated) return null;

  function handleExport() {
    const text = exportJson();
    const ts = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14);
    downloadJson(`wqx-dataset-${ts}.json`, text);
    setFeedback({ kind: "ok", msg: "已下载 JSON 文件" });
  }

  function handleImportClick() {
    fileRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一文件
    if (!file) return;
    try {
      const text = await file.text();
      importJson(text);
      setFeedback({
        kind: "ok",
        msg: `已导入 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
      });
    } catch (err: any) {
      const msg =
        err instanceof DatasetImportError
          ? err.message
          : err?.message ?? String(err);
      setFeedback({ kind: "err", msg: `导入失败: ${msg}` });
    }
  }

  function handleReset() {
    if (typeof window !== "undefined" && !window.confirm("确定恢复任务书默认数据吗? 当前修改将丢失。")) {
      return;
    }
    reset();
    setFeedback({ kind: "ok", msg: "已恢复默认值" });
  }

  return (
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={handleImportClick}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors"
          style={{
            backgroundColor: "var(--bg-canvas)",
            color: "var(--text)",
            border: "1px solid var(--border)",
          }}
          title="从 JSON 文件加载数据集"
        >
          <Upload className="h-3.5 w-3.5" />
          导入 JSON
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors"
          style={{
            backgroundColor: "var(--bg-canvas)",
            color: "var(--text)",
            border: "1px solid var(--border)",
          }}
          title="下载当前数据集为 JSON 文件"
        >
          <Download className="h-3.5 w-3.5" />
          导出 JSON
        </button>
        <button
          onClick={handleReset}
          disabled={!isModified}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors"
          style={{
            backgroundColor: "var(--bg-canvas)",
            color: isModified ? "var(--text)" : "var(--muted)",
            border: "1px solid var(--border)",
            opacity: isModified ? 1 : 0.5,
            cursor: isModified ? "pointer" : "not-allowed",
          }}
          title="恢复任务书默认数据"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重置默认
        </button>
        {!compact && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium uppercase tracking-wider"
            style={{
              backgroundColor: isModified
                ? "rgba(245, 158, 11, 0.12)"
                : "var(--accent-soft)",
              color: isModified ? "var(--warning)" : "var(--accent-color)",
              border: isModified
                ? "1px solid var(--warning)"
                : "1px solid var(--accent-color)",
            }}
          >
            {isModified ? (
              <>
                <PencilLine className="h-3 w-3" />
                已修改 · 自动保存
              </>
            ) : (
              <>
                <Check className="h-3 w-3" />
                默认值 · 自动保存
              </>
            )}
          </div>
        )}
      </div>
      {feedback && (
        <div
          className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded"
          style={{
            color: feedback.kind === "ok" ? "var(--success)" : "var(--error)",
            backgroundColor:
              feedback.kind === "ok"
                ? "rgba(34, 197, 94, 0.1)"
                : "rgba(239, 68, 68, 0.1)",
          }}
        >
          {feedback.kind === "ok" ? (
            <Check className="h-3 w-3" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          {feedback.msg}
          <button
            onClick={() => setFeedback(null)}
            className="ml-1 opacity-60 hover:opacity-100"
            aria-label="关闭"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export function DataPage() {
  return (
    <div className="space-y-8">
      {/* 页头 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div
            className="text-[10px] font-mono uppercase tracking-widest mb-1"
            style={{ color: "var(--accent-color)" }}
          >
            DATA ARCHIVE / 数据档案
          </div>
          <h1
            className="font-display text-3xl font-semibold tracking-tight"
            style={{ color: "var(--text)" }}
          >
            任务书默认数据
          </h1>
          <p
            className="text-sm mt-1.5 max-w-2xl"
            style={{ color: "var(--muted)" }}
          >
            全部原始资料以 TypeScript 常量形式内联于 <code style={{ color: "var(--accent-color)" }}>src/lib/engine/</code>{" "}
            目录下, 此处按类别展示以便查阅。
          </p>
        </div>
        <ImportExportBar />
      </div>

      <Tabs defaultValue="params" className="w-full">
        <TabsList className="flex-wrap h-auto gap-1 mb-6">
          <TabsTrigger value="params" className="gap-1.5">
            <Gauge className="h-3.5 w-3.5" /> 关键参数
          </TabsTrigger>
          <TabsTrigger value="runoff" className="gap-1.5">
            <Droplets className="h-3.5 w-3.5" /> 径流数据
          </TabsTrigger>
          <TabsTrigger value="curves" className="gap-1.5">
            <Ruler className="h-3.5 w-3.5" /> 库容/泄流曲线
          </TabsTrigger>
          <TabsTrigger value="schemes" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> 方案设计
          </TabsTrigger>
          <TabsTrigger value="floods" className="gap-1.5">
            <Waves className="h-3.5 w-3.5" /> 设计洪水
          </TabsTrigger>
          <TabsTrigger value="econ" className="gap-1.5">
            <Sigma className="h-3.5 w-3.5" /> 经济参数
          </TabsTrigger>
        </TabsList>

        <TabsContent value="params">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="runoff">
          <RunoffTab />
        </TabsContent>
        <TabsContent value="curves">
          <CurvesTab />
        </TabsContent>
        <TabsContent value="schemes">
          <SchemeTab />
        </TabsContent>
        <TabsContent value="floods">
          <FloodTab />
        </TabsContent>
        <TabsContent value="econ">
          <EconomicTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
