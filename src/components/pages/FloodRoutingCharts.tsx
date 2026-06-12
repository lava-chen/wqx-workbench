"use client";

/**
 * 调洪过程线 (fig_flood_routing_*) — Recharts 交互版
 * 内容对齐 figs_scientific/scripts_plot_flood_routing.py：
 *  - 双 Y 轴：左 Z (m)，右 Q (m³/s)
 *  - 蓝线（左轴）：水位 Z 过程
 *  - 绿阶梯（右轴）：来水 Q_in
 *  - 红线（右轴）：下泄 Q_out
 *  - 橙色虚线（右轴）：安全泄量 q_safe
 *  - 黑色细实线（左轴）：起调水位 Z_start
 *
 * 与 figs_scientific 不同之处（web 交互增益）：
 *  - hover Tooltip 显示精确 t/Z/Q 值
 *  - Brush 缩放 — 拖动选时段（交互亮点）
 *  - Legend 点击切换曲线
 *  - 2×2 网格对比（fig_flood_routing_compare_2x2 风格）
 *  - 4×3 全景（4 方案 × 3 标准）
 */

import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// ────────────────────────────────────────────────────────────
// 颜色 — 与 hydro_plot.COLORS 对齐
// ────────────────────────────────────────────────────────────
const COLORS = {
  Z: "#1F77B4",          // 水位（蓝）
  Q_in: "#2E8B57",        // 来水（墨绿）
  Q_out: "#C0392B",       // 下泄（砖红）
  Q_safe: "#FF7F0E",      // 安全泄量（橙虚）
  Z_zheng: "#000000",     // 起调水位（黑细实）
};

const DT_H = 3; // 每段 3 小时（与 flood.ts 一致）

// 标准 key 标签
const STD_KEYS = ["P5", "P0_1", "P0_01"] as const;
const STD_LABELS: Record<string, { label: string; sub: string; freq: string }> = {
  P5:    { label: "P=5% 下游防洪",   sub: "20 年一遇",  freq: "P=5%" },
  P0_1:  { label: "P=0.1% 大坝设计", sub: "1000 年一遇", freq: "P=0.1%" },
  P0_01: { label: "P=0.01% 大坝校核", sub: "10000 年一遇", freq: "P=0.01%" },
};

const SCHEME_LABELS: Record<string, string> = {
  I: "方案 I",
  II: "方案 II",
  III: "方案 III",
  IV: "方案 IV",
};

// ────────────────────────────────────────────────────────────
// 类型
// ────────────────────────────────────────────────────────────
export interface FloodSeries {
  Q_in: number[];
  Z: number[];
  Q_out: number[];
  Z_max: number;
  Q_max: number;
}

export interface FloodResultWithSeries {
  Z_fangshou_high: number;
  Z_design: number;
  Q_design_max: number;
  Z_check: number;
  Q_check_max: number;
  series?: Record<string, FloodSeries>;
}

export interface FloodChartsProps {
  floodResults: Record<string, FloodResultWithSeries>;
  Q_SAFE: number;
}

// ────────────────────────────────────────────────────────────
// 单方案 × 单标准 调洪图
// ────────────────────────────────────────────────────────────
interface FloodPoint {
  t: number;       // day
  Z: number;
  Q_in: number;
  Q_out: number;
}

interface FloodChartBundle {
  data: FloodPoint[];
  Z_start: number;
  Z_max: number;
  Q_max: number;
  t_total: number; // 总时长 (d)
  Q_safe: number;
}

function buildFloodData(
  sk: string,
  std_key: string,
  floodResults: FloodResultWithSeries | undefined,
  Q_SAFE: number,
  Z_start_override?: number,
): FloodChartBundle | null {
  if (!floodResults?.series) return null;
  const series = floodResults.series[std_key];
  if (!series) return null;

  const Q_in_series = series.Q_in;
  const Z_series = series.Z;
  const Q_out_series = series.Q_out;
  const n = Q_in_series.length;

  // 构造 n+1 数据点（端点形式），最后一段 Q_in 用 Q_in[n-1] 延伸
  const data: FloodPoint[] = [];
  for (let i = 0; i <= n; i++) {
    data.push({
      t: (i * DT_H) / 24,
      Z: Z_series[i],
      Q_in: i < n ? Q_in_series[i] : Q_in_series[n - 1],
      Q_out: Q_out_series[i],
    });
  }
  const t_total = (n * DT_H) / 24;

  return {
    data,
    Z_start: Z_start_override ?? Z_series[0],
    Z_max: series.Z_max,
    Q_max: series.Q_max,
    t_total,
    Q_safe: Q_SAFE,
  };
}

function FloodRoutingChart({
  sk,
  std_key,
  floodResults,
  Q_SAFE,
  Z_start_override,
  height = 320,
  showBrush = false,
}: {
  sk: string;
  std_key: string;
  floodResults: FloodResultWithSeries | undefined;
  Q_SAFE: number;
  Z_start_override?: number;
  height?: number;
  showBrush?: boolean;
}) {
  const bundle = useMemo(
    () => buildFloodData(sk, std_key, floodResults, Q_SAFE, Z_start_override),
    [sk, std_key, floodResults, Q_SAFE, Z_start_override],
  );

  if (!bundle) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {SCHEME_LABELS[sk]} · {STD_LABELS[std_key].label}
          </CardTitle>
        </CardHeader>
        <CardContent
          className="flex items-center justify-center text-sm text-slate-500"
          style={{ height }}
        >
          序列数据未就绪
        </CardContent>
      </Card>
    );
  }

  const { data, Z_start, Z_max, Q_max, t_total, Q_safe } = bundle;
  const Z_min = Math.min(...data.map((d) => d.Z));
  const Q_all_max = Math.max(
    Q_safe,
    ...data.map((d) => Math.max(d.Q_in, d.Q_out)),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {SCHEME_LABELS[sk]} · {STD_LABELS[std_key].label}
        </CardTitle>
        <CardDescription className="text-xs font-mono">
          Z_max = {Z_max.toFixed(2)} m · Q_max = {Q_max.toFixed(0)} m³/s · Z_0 ={" "}
          {Z_start.toFixed(1)} m · T = {t_total.toFixed(1)} d
        </CardDescription>
      </CardHeader>
      <CardContent style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 60, left: 8, bottom: showBrush ? 36 : 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, t_total]}
              tick={{ fontSize: 9 }}
              tickFormatter={(v) => v.toFixed(1)}
              label={
                showBrush
                  ? undefined
                  : {
                      value: "时间 t (d)",
                      position: "insideBottom",
                      offset: -2,
                      fontSize: 9,
                    }
              }
            />
            <YAxis
              yAxisId="z"
              tick={{ fontSize: 9 }}
              domain={[Z_min - 0.5, Z_max + 1.5]}
              label={{
                value: "Z (m)",
                angle: -90,
                position: "insideLeft",
                fontSize: 9,
                fill: COLORS.Z,
              }}
            />
            <YAxis
              yAxisId="q"
              orientation="right"
              tick={{ fontSize: 9 }}
              domain={[0, Q_all_max * 1.15]}
              label={{
                value: "Q (m³/s)",
                angle: 90,
                position: "insideRight",
                fontSize: 9,
              }}
            />
            <Tooltip
              content={({ active, payload, label }: any) => {
                if (!active || !payload || payload.length === 0) return null;
                return (
                  <div className="rounded-md border bg-white/95 px-3 py-2 shadow-md text-xs">
                    <div className="font-semibold mb-1">
                      t = {(label as number).toFixed(2)} d
                    </div>
                    {payload.map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-sm"
                          style={{ background: p.color || p.stroke }}
                        />
                        <span className="text-slate-600">{p.name}:</span>
                        <span className="font-mono font-semibold">
                          {(p.value as number).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 9 }} />

            {/* 左轴：水位 */}
            <Line
              yAxisId="z"
              type="monotone"
              dataKey="Z"
              name="水位 Z"
              stroke={COLORS.Z}
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceLine
              yAxisId="z"
              y={Z_start}
              stroke={COLORS.Z_zheng}
              strokeWidth={1}
              strokeDasharray="4 2"
              label={{
                value: `Z_0 ${Z_start.toFixed(1)}`,
                position: "right",
                fontSize: 8,
                fill: "#000",
              }}
            />

            {/* 右轴：流量 */}
            <Line
              yAxisId="q"
              type="step"
              dataKey="Q_in"
              name="来水 Q_in"
              stroke={COLORS.Q_in}
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="q"
              type="monotone"
              dataKey="Q_out"
              name="下泄 Q_out"
              stroke={COLORS.Q_out}
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceLine
              yAxisId="q"
              y={Q_safe}
              stroke={COLORS.Q_safe}
              strokeWidth={1.2}
              strokeDasharray="3 2"
              label={{
                value: `q_安 ${Q_safe}`,
                position: "insideBottomRight",
                fontSize: 8,
                fill: COLORS.Q_safe,
                offset: 4,
              }}
            />

            {showBrush && (
              <Brush
                dataKey="t"
                height={26}
                stroke={COLORS.Z}
                travellerWidth={8}
                tickFormatter={(v) => v.toFixed(1)}
                startIndex={0}
                endIndex={Math.min(data.length - 1, 24)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// 2×2 对比（fig_flood_routing_compare_2x2 风格）
// ────────────────────────────────────────────────────────────
export function FloodRouting2x2({
  floodResults,
  Q_SAFE,
  std_key = "P5",
  height = 320,
}: {
  floodResults: Record<string, FloodResultWithSeries>;
  Q_SAFE: number;
  std_key?: "P5" | "P0_1" | "P0_01";
  height?: number;
}) {
  const schemes = ["I", "II", "III", "IV"];
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500 px-1">
        四方案 {STD_LABELS[std_key].label}（{STD_LABELS[std_key].sub}）调洪过程线对比。
        {std_key === "P5" && "下游防洪：下泄被安全泄量约束，水位由入库与泄流能力共同决定。"}
        {std_key === "P0_1" && "大坝设计：闸门全开，校核泄流能力。"}
        {std_key === "P0_01" && "大坝校核：闸门全开，验证最高水位。"}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {schemes.map((sk) => (
          <FloodRoutingChart
            key={sk}
            sk={sk}
            std_key={std_key}
            floodResults={floodResults?.[sk]}
            Q_SAFE={Q_SAFE}
            height={height}
            showBrush={false}
          />
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 4×3 全景（4 方案行 × 3 标准列）— fig_flood_routing_scheme_{I,II,III,IV}_P{5,0.1,0.01} 12 张等价
// ────────────────────────────────────────────────────────────
export function FloodRoutingAllGrid({
  floodResults,
  Q_SAFE,
  cellHeight = 240,
}: {
  floodResults: Record<string, FloodResultWithSeries>;
  Q_SAFE: number;
  cellHeight?: number;
}) {
  const schemes = ["I", "II", "III", "IV"];
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 px-1">
        全景视图：4 方案 × 3 标准 = 12 张调洪图。
        hover 查看精确数值，拖动 Brush 缩放时间范围。
      </div>
      {/* 列头 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 px-1">
        <div className="text-xs font-semibold text-slate-600">方案 \ 标准</div>
        {STD_KEYS.map((sk) => (
          <div key={sk} className="text-xs font-semibold text-slate-600">
            {STD_LABELS[sk].label}
            <div className="text-[10px] font-normal text-slate-500">
              {STD_LABELS[sk].sub}
            </div>
          </div>
        ))}
      </div>
      {schemes.map((sk) => (
        <div key={sk} className="grid grid-cols-1 lg:grid-cols-4 gap-2">
          <div className="flex items-center text-sm font-semibold text-slate-700 px-1">
            {SCHEME_LABELS[sk]}
          </div>
          {STD_KEYS.map((std_key) => (
            <FloodRoutingChart
              key={std_key}
              sk={sk}
              std_key={std_key}
              floodResults={floodResults?.[sk]}
              Q_SAFE={Q_SAFE}
              height={cellHeight}
              showBrush={false}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
