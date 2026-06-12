"use client";

/**
 * 多方案对比图（fig_compare_*）— Recharts 交互版
 * 内容对齐 figs_scientific/scripts_plot_compare.py，但用 web 交互：
 *  - hover 显示精确数值（Recharts Tooltip）
 *  - 点击 Legend 切换曲线/柱
 *  - 数值标签在柱顶
 *  - 单位用纯文本（m³/s / 亿 kW·h / 万 kW / 万元 / m）
 *
 * 6 张：
 *   CompareChartDeadLevel    — 死水位
 *   CompareChartFirmPower    — 保证出力
 *   CompareChartEnergy       — 多年平均电能
 *   CompareChartInstalled    — 装机构成 (N_bi + N_重 stacked)
 *   CompareChartDesignCheck  — 特征水位 (Z_防 / Z_设 / Z_校 grouped)
 *   CompareChartEconomic     — 总投资构成 + 动态年费用 (双面板)
 *   CompareChartOverview     — 综合概览 (3×2)
 */

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ECON } from "@/lib/engine";

// ────────────────────────────────────────────────────────────
// 颜色 — 与 hydro_plot.COLORS / SCHEME_COLORS 对齐
// ────────────────────────────────────────────────────────────
const SCHEME_COLORS: Record<string, string> = {
  I: "#1F77B4",
  II: "#2CA02C",
  III: "#FF7F0E",
  IV: "#D62728",
};

const SCHEMES = ["I", "II", "III", "IV"] as const;
const SCHEME_LABELS: Record<string, string> = {
  I: "方案 I",
  II: "方案 II",
  III: "方案 III",
  IV: "方案 IV",
};

// 特征水位 / 装机 / 投资 用色
const COLOR_Z_FANGSHOU = "#A569BD"; // 紫 — 防洪高
const COLOR_Z_DESIGN = "#5DADE2";   // 蓝 — 设计
const COLOR_Z_CHECK = "#E59866";    // 橙 — 校核
const COLOR_N_BI = "#7FB3D5";       // 浅蓝 — 必需
const COLOR_N_CHONG = "#2E86AB";    // 深蓝 — 重复
const COLOR_DAM = "#1F77B4";        // 大坝
const COLOR_MECH = "#2CA02C";       // 机电
const COLOR_TEMP = "#FF7F0E";       // 临时
const COLOR_COMP = "#D62728";       // 水库补偿
const COLOR_ANNUAL_OPT = "#2E86C1"; // 年费用最优
const COLOR_ANNUAL_OTHER = "#5D6D7E";// 年费用非最优

// 单位
const U_Z = "m";
const U_N = "万 kW";
const U_E = "亿 kW·h";
const U_M = "万元";

// ────────────────────────────────────────────────────────────
// 类型 — 与 useAllResults 对齐
// ────────────────────────────────────────────────────────────
export interface WaterResultLite {
  Z_dead: number;
  Np_wan: number;
  N_bi: number;
  N_chong: number;
  N_Y: number;
  E_avg: number;
}

export interface FloodResultLite {
  Z_fangshou_high: number;
  Z_design: number;
  Z_check: number;
}

export interface EconResultLite {
  scheme: string;
  annual_total: number;
}

export interface CompareChartsProps {
  waterResults: Record<string, WaterResultLite>;
  floodResults: Record<string, FloodResultLite>;
  econ?: EconResultLite[];
}

// ────────────────────────────────────────────────────────────
// 通用 ChartCard 包装
// ────────────────────────────────────────────────────────────
function ChartCard({
  title,
  description,
  height = 380,
  children,
}: {
  title: string;
  description?: string;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent style={{ height }}>{children}</CardContent>
    </Card>
  );
}

// 自定义 Tooltip：保留 2 位小数
const NumberTooltip = ({ active, payload, label, unit }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border bg-white/95 px-3 py-2 shadow-md text-xs">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: p.color || p.fill }}
          />
          <span className="text-slate-600">{p.name}:</span>
          <span className="font-mono font-semibold">
            {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
            {unit ? ` ${unit}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// 数据 → Recharts data[] 通用转换
// ────────────────────────────────────────────────────────────
function useSchemeData<T>(
  src: Record<string, T> | undefined,
  pick: (v: T) => number,
): Array<{ scheme: string; value: number; color: string; label: string }> {
  return useMemo(() => {
    if (!src) return [];
    return SCHEMES.map((sk) => ({
      scheme: SCHEME_LABELS[sk],
      value: pick(src[sk]),
      color: SCHEME_COLORS[sk],
      label: sk,
    }));
  }, [src, pick]);
}

// ────────────────────────────────────────────────────────────
// 1) 死水位对比
// ────────────────────────────────────────────────────────────
export function CompareChartDeadLevel({ waterResults }: CompareChartsProps) {
  const data = useSchemeData(waterResults, (v) => v.Z_dead);
  return (
    <ChartCard
      title="四方案死水位对比"
      description="Z_dead (m) — 越低则兴利库容越大、泥沙淤积风险增加"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 24, left: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            domain={[(d: number) => d * 0.985, (d: number) => d * 1.005]}
            label={{ value: `水位 (${U_Z})`, angle: -90, position: "insideLeft", fontSize: 11 }}
          />
          <Tooltip content={<NumberTooltip unit={U_Z} />} />
          <Bar dataKey="value" name="死水位" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              formatter={(v: any) => (typeof v === "number" ? v.toFixed(2) : v)}
              style={{ fontSize: 11, fontWeight: 600, fill: "#222" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────
// 2) 保证出力对比
// ────────────────────────────────────────────────────────────
export function CompareChartFirmPower({ waterResults }: CompareChartsProps) {
  const data = useSchemeData(waterResults, (v) => v.Np_wan);
  return (
    <ChartCard
      title="四方案保证出力对比"
      description={`N_p (${U_N}) — P=87.5% 长系列等出力试算最小值`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 24, left: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            domain={[(d: number) => d * 0.96, (d: number) => d * 1.04]}
            label={{ value: `出力 (${U_N})`, angle: -90, position: "insideLeft", fontSize: 11 }}
          />
          <Tooltip content={<NumberTooltip unit={U_N} />} />
          <Bar dataKey="value" name="保证出力" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              formatter={(v: any) => (typeof v === "number" ? v.toFixed(2) : v)}
              style={{ fontSize: 11, fontWeight: 600, fill: "#222" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────
// 3) 多年平均电能对比
// ────────────────────────────────────────────────────────────
export function CompareChartEnergy({ waterResults }: CompareChartsProps) {
  const data = useSchemeData(waterResults, (v) => v.E_avg);
  return (
    <ChartCard
      title="四方案多年平均电能对比"
      description={`E_avg (${U_E}) — 长系列模拟 + 凤滩回水损失扣除`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 24, left: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            domain={[(d: number) => d * 0.95, (d: number) => d * 1.06]}
            label={{ value: `电能 (${U_E})`, angle: -90, position: "insideLeft", fontSize: 11 }}
          />
          <Tooltip content={<NumberTooltip unit={U_E} />} />
          <Bar dataKey="value" name="多年平均电能" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              formatter={(v: any) => (typeof v === "number" ? v.toFixed(2) : v)}
              style={{ fontSize: 11, fontWeight: 600, fill: "#222" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────
// 4) 装机构成 (N_bi 必需 + N_重 重复 stacked)
// ────────────────────────────────────────────────────────────
export function CompareChartInstalled({ waterResults }: CompareChartsProps) {
  const data = useMemo(
    () =>
      SCHEMES.map((sk) => {
        const w = waterResults?.[sk];
        const bi = w?.N_bi ?? 0;
        const ch = w?.N_chong ?? 0;
        return {
          scheme: SCHEME_LABELS[sk],
          N_bi: bi,
          N_chong: ch,
          N_Y: bi + ch,
        };
      }),
    [waterResults],
  );
  return (
    <ChartCard
      title="四方案装机容量构成（必需 + 重复）"
      description={`N_bi 必需 + N_重 重复 = N_Y 装机（${U_N}）`}
      height={420}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 30, right: 24, left: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            label={{ value: `装机 (${U_N})`, angle: -90, position: "insideLeft", fontSize: 11 }}
          />
          <Tooltip content={<NumberTooltip unit={U_N} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="N_bi"
            stackId="cap"
            name="必需 N_bi"
            fill={COLOR_N_BI}
            radius={[0, 0, 0, 0]}
          >
            <LabelList
              dataKey="N_bi"
              position="inside"
              formatter={(v: any) => (typeof v === "number" && v > 5 ? v.toFixed(1) : "")}
              style={{ fontSize: 10, fontWeight: 700, fill: "#fff" }}
            />
          </Bar>
          <Bar
            dataKey="N_chong"
            stackId="cap"
            name="重复 N_重"
            fill={COLOR_N_CHONG}
            radius={[4, 4, 0, 0]}
          >
            <LabelList
              dataKey="N_chong"
              position="inside"
              formatter={(v: any) => (typeof v === "number" && v > 5 ? v.toFixed(1) : "")}
              style={{ fontSize: 10, fontWeight: 700, fill: "#fff" }}
            />
            <LabelList
              dataKey="N_Y"
              position="top"
              formatter={(v: any) =>
                typeof v === "number" ? `N_Y = ${v.toFixed(1)}` : v
              }
              style={{ fontSize: 11, fontWeight: 700, fill: "#222" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────
// 5) 特征水位 grouped (Z_防 / Z_设 / Z_校)
// ────────────────────────────────────────────────────────────
export function CompareChartDesignCheck({ floodResults }: CompareChartsProps) {
  const data = useMemo(
    () =>
      SCHEMES.map((sk) => {
        const f = floodResults?.[sk];
        return {
          scheme: SCHEME_LABELS[sk],
          Z_防: f?.Z_fangshou_high ?? 0,
          Z_设: f?.Z_design ?? 0,
          Z_校: f?.Z_check ?? 0,
        };
      }),
    [floodResults],
  );
  return (
    <ChartCard
      title="四方案特征水位对比（防洪高 / 设计 / 校核）"
      description={`P=5% 防洪高 / P=0.1% 设计 / P=0.01% 校核（${U_Z}）`}
      height={420}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 24, right: 24, left: 12, bottom: 8 }}
          barCategoryGap="20%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            label={{ value: `水位 (${U_Z})`, angle: -90, position: "insideLeft", fontSize: 11 }}
          />
          <Tooltip content={<NumberTooltip unit={U_Z} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="Z_防"
            name="Z_防 (P=5%)"
            fill={COLOR_Z_FANGSHOU}
            radius={[3, 3, 0, 0]}
          >
            <LabelList
              dataKey="Z_防"
              position="top"
              formatter={(v: any) => (typeof v === "number" ? v.toFixed(1) : v)}
              style={{ fontSize: 10, fill: "#222" }}
            />
          </Bar>
          <Bar
            dataKey="Z_设"
            name="Z_设 (P=0.1%)"
            fill={COLOR_Z_DESIGN}
            radius={[3, 3, 0, 0]}
          >
            <LabelList
              dataKey="Z_设"
              position="top"
              formatter={(v: any) => (typeof v === "number" ? v.toFixed(1) : v)}
              style={{ fontSize: 10, fill: "#222" }}
            />
          </Bar>
          <Bar
            dataKey="Z_校"
            name="Z_校 (P=0.01%)"
            fill={COLOR_Z_CHECK}
            radius={[3, 3, 0, 0]}
          >
            <LabelList
              dataKey="Z_校"
              position="top"
              formatter={(v: any) => (typeof v === "number" ? v.toFixed(1) : v)}
              style={{ fontSize: 10, fill: "#222" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────
// 6) 经济对比 — 总投资构成 + 动态年费用 (双面板)
// ────────────────────────────────────────────────────────────
export function CompareChartEconomic({ econ }: CompareChartsProps) {
  // 总投资构成（来自 ECON 常量 + schemes 顺序）
  const investData = useMemo(
    () =>
      SCHEMES.map((sk) => {
        const e = ECON[sk];
        const dam = e.dam_invest;
        const mech = e.mech_invest;
        const temp = e.temp_invest;
        const comp = e.comp_invest;
        return {
          scheme: SCHEME_LABELS[sk],
          大坝: dam,
          机电: mech,
          临时: temp,
          水库补偿: comp,
          合计: dam + mech + temp + comp,
        };
      }),
    [],
  );

  // 年费用（带最优标记）
  const annualData = useMemo(() => {
    if (!econ || econ.length === 0) return [];
    const minA = Math.min(...econ.map((e) => e.annual_total));
    return SCHEMES.map((sk) => {
      const row = econ.find((e) => e.scheme === sk);
      const v = row?.annual_total ?? 0;
      return {
        scheme: SCHEME_LABELS[sk],
        annual: v,
        fill: Math.abs(v - minA) < 1e-3 ? COLOR_ANNUAL_OPT : COLOR_ANNUAL_OTHER,
        isOpt: Math.abs(v - minA) < 1e-3,
      };
    });
  }, [econ]);

  const annualMin = Math.min(...annualData.map((d) => d.annual), 0);

  return (
    <ChartCard
      title="四方案经济对比 — 总投资构成 + 动态年费用"
      description={`上：总投资 (${U_M})；下：动态年费用（最优标记蓝色）`}
      height={680}
    >
      <div className="flex flex-col gap-2 h-full">
        {/* 上：总投资构成 stacked */}
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={investData}
              margin={{ top: 16, right: 24, left: 12, bottom: 4 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 10 }}
                label={{
                  value: `总投资 (${U_M})`,
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 10,
                }}
              />
              <Tooltip content={<NumberTooltip unit={U_M} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="大坝" stackId="inv" name="大坝" fill={COLOR_DAM}>
                <LabelList
                  dataKey="大坝"
                  position="inside"
                  formatter={(v: any) =>
                    typeof v === "number" && v > 5000 ? `${(v / 1e4).toFixed(2)} 亿` : ""
                  }
                  style={{ fontSize: 9, fontWeight: 700, fill: "#fff" }}
                />
              </Bar>
              <Bar dataKey="机电" stackId="inv" name="机电" fill={COLOR_MECH} />
              <Bar dataKey="临时" stackId="inv" name="临时" fill={COLOR_TEMP} />
              <Bar
                dataKey="水库补偿"
                stackId="inv"
                name="水库补偿"
                fill={COLOR_COMP}
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="合计"
                  position="top"
                  formatter={(v: any) =>
                    typeof v === "number" ? `合计 ${(v / 1e4).toFixed(2)} 亿` : v
                  }
                  style={{ fontSize: 10, fontWeight: 700, fill: "#222" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 分隔 */}
        <div className="border-t border-dashed border-slate-200" />

        {/* 下：年费用 */}
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={annualData}
              margin={{ top: 24, right: 24, left: 12, bottom: 4 }}
              barCategoryGap="25%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 10 }}
                domain={[0, (d: number) => d * 1.2]}
                label={{
                  value: `年费用 (${U_M})`,
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 10,
                }}
              />
              <Tooltip content={<NumberTooltip unit={U_M} />} />
              <Bar dataKey="annual" name="年费用" radius={[4, 4, 0, 0]}>
                {annualData.map((d) => (
                  <Cell key={d.scheme} fill={d.fill} />
                ))}
                <LabelList
                  dataKey="annual"
                  position="top"
                  formatter={(v: any) => (typeof v === "number" ? `${v.toFixed(0)}` : v)}
                  style={{ fontSize: 11, fontWeight: 700, fill: "#222" }}
                />
              </Bar>
              {/* 最优参考线 */}
              {annualMin > 0 && (
                <ReferenceLine
                  y={annualMin}
                  stroke="#C0392B"
                  strokeDasharray="3 3"
                  label={{
                    value: `★ 最优 ${annualMin.toFixed(0)} ${U_M}`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "#C0392B",
                  }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────
// 7) 综合概览 3×2
// ────────────────────────────────────────────────────────────
export function CompareChartOverview({
  waterResults,
  floodResults,
}: CompareChartsProps) {
  const panels = useMemo(() => {
    type Panel = {
      key: string;
      title: string;
      unit: string;
      data: Array<{ scheme: string; value: number; color: string }>;
      format: string;
    };
    const arr: Panel[] = [
      {
        key: "Z_dead",
        title: "死水位",
        unit: U_Z,
        format: "{:.2f}",
        data: SCHEMES.map((sk) => ({
          scheme: SCHEME_LABELS[sk],
          value: waterResults?.[sk]?.Z_dead ?? 0,
          color: SCHEME_COLORS[sk],
        })),
      },
      {
        key: "Np",
        title: "保证出力",
        unit: U_N,
        format: "{:.2f}",
        data: SCHEMES.map((sk) => ({
          scheme: SCHEME_LABELS[sk],
          value: waterResults?.[sk]?.Np_wan ?? 0,
          color: SCHEME_COLORS[sk],
        })),
      },
      {
        key: "N_Y",
        title: "装机容量",
        unit: U_N,
        format: "{:.1f}",
        data: SCHEMES.map((sk) => ({
          scheme: SCHEME_LABELS[sk],
          value: waterResults?.[sk]?.N_Y ?? 0,
          color: SCHEME_COLORS[sk],
        })),
      },
      {
        key: "E_avg",
        title: "多年平均电能",
        unit: U_E,
        format: "{:.2f}",
        data: SCHEMES.map((sk) => ({
          scheme: SCHEME_LABELS[sk],
          value: waterResults?.[sk]?.E_avg ?? 0,
          color: SCHEME_COLORS[sk],
        })),
      },
      {
        key: "Z_design",
        title: "设计洪水位",
        unit: U_Z,
        format: "{:.2f}",
        data: SCHEMES.map((sk) => ({
          scheme: SCHEME_LABELS[sk],
          value: floodResults?.[sk]?.Z_design ?? 0,
          color: SCHEME_COLORS[sk],
        })),
      },
      {
        key: "Z_check",
        title: "校核洪水位",
        unit: U_Z,
        format: "{:.2f}",
        data: SCHEMES.map((sk) => ({
          scheme: SCHEME_LABELS[sk],
          value: floodResults?.[sk]?.Z_check ?? 0,
          color: SCHEME_COLORS[sk],
        })),
      },
    ];
    return arr;
  }, [waterResults, floodResults]);

  return (
    <ChartCard
      title="四方案关键指标综合概览"
      description="3×2 子图 — 适合附录或首页摘要"
      height={620}
    >
      <div className="grid grid-cols-3 grid-rows-2 gap-2 h-full">
        {panels.map((p) => {
          return (
            <div key={p.key} className="flex flex-col">
              <div className="text-xs font-semibold text-slate-600 mb-1 px-1">
                {p.title} ({p.unit})
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={p.data}
                    margin={{ top: 20, right: 8, left: 4, bottom: 4 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="scheme" tick={{ fontSize: 9 }} />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      width={36}
                      domain={[
                        (d: number) => d * 0.92,
                        (d: number) => d * 1.12,
                      ]}
                    />
                    <Tooltip content={<NumberTooltip unit={p.unit} />} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                      {p.data.map((d) => (
                        <Cell key={d.scheme} fill={d.color} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="top"
                        formatter={(v: any) =>
                          typeof v === "number" ? v.toFixed(2) : v
                        }
                        style={{ fontSize: 9, fontWeight: 600, fill: "#222" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
