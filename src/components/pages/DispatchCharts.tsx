"use client";

/**
 * 水库调度图 (fig_dispatch_{I,II,III,IV}) — Recharts 交互版
 * 内容对齐 figs_scientific/scripts_plot_dispatch_chart.py：
 *  - 防破坏线（蓝粗实线 + 圆点）— `compute_fangpo_line` 上包络
 *  - 防洪调度线（紫实线 + 方块）— P=5% 调洪 Z_max，仅 5-9 月
 *  - 加大出力辅助线 1/4、2/4、3/4（灰虚线）
 *  - 历史过程 25-75% 分位带（浅灰填充）+ 各年细线（极弱化）
 *  - 正常蓄水位（黑细实）、死水位（黑点划）、汛限水位（红点）
 *
 * 与 figs_scientific 不同之处（web 交互增益）：
 *  - hover Tooltip 显示精确水位
 *  - 4 方案以 2×2 网格同屏对比（fig_dispatch_compare_2x2 风格）
 *  - Legend 点击切换显隐
 */

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  compute_fangpo_line,
  SCHEMES,
  Q_SAFE,
} from "@/lib/engine";

// ────────────────────────────────────────────────────────────
// 颜色 — 与 hydro_plot.COLORS 对齐
// ────────────────────────────────────────────────────────────
const COLORS = {
  Z_fangpo: "#1F77B4",     // 防破坏线（蓝粗实）
  Z_fangshou: "#8E44AD",   // 防洪调度线（紫实）
  Z_zheng: "#000000",      // 正常蓄水位（黑细实）
  Z_dead: "#000000",       // 死水位（黑点划）
  Z_xun: "#C0392B",        // 汛限水位（红点线）
  aux: "#7F7F7F",          // 加大出力辅助线（灰虚）
  hist: "#B0B0B0",         // 历史过程（浅灰）
};

// ────────────────────────────────────────────────────────────
// 类型 — 与 useAllResults 对齐
// ────────────────────────────────────────────────────────────
export interface DispatchWaterLite {
  Z_dead: number;
  Np_wan: number;
}

export interface DispatchFloodLite {
  Z_fangshou_high: number;
}

export interface DispatchChartsProps {
  waterResults: Record<string, DispatchWaterLite>;
  floodResults: Record<string, DispatchFloodLite>;
  Q_SAFE?: number;
  // 是否单方案视图（默认 2×2 网格）
  singleScheme?: string;
}

// ────────────────────────────────────────────────────────────
// 工具：分位带计算
// ────────────────────────────────────────────────────────────
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(q * (sorted.length - 1))),
  );
  return sorted[i];
}

function computeBand(
  all_curves: Record<number, Record<number, number>>,
  months: number[],
): { p25: number[]; p50: number[]; p75: number[] } {
  const p25: number[] = [];
  const p50: number[] = [];
  const p75: number[] = [];
  for (const m of months) {
    const vals: number[] = [];
    for (const yr of Object.keys(all_curves)) {
      const v = all_curves[parseInt(yr)]?.[m];
      if (v !== undefined && !isNaN(v)) vals.push(v);
    }
    if (vals.length === 0) {
      p25.push(NaN);
      p50.push(NaN);
      p75.push(NaN);
    } else {
      vals.sort((a, b) => a - b);
      p25.push(percentile(vals, 0.25));
      p50.push(percentile(vals, 0.5));
      p75.push(percentile(vals, 0.75));
    }
  }
  return { p25, p50, p75 };
}

// ────────────────────────────────────────────────────────────
// 单方案数据预处理 — 返回 Recharts 用的 data[] + 参考线
// ────────────────────────────────────────────────────────────
interface DispatchDataRow {
  month: number;
  fangpo: number | null;
  aux1: number | null;
  aux2: number | null;
  aux3: number | null;
  p25: number | null;     // 25% 分位
  p75: number | null;     // 75% 分位
  p50: number | null;     // 中位数
  flood: number | null;   // 防洪调度线（仅 5-9 月）
}

interface DispatchBundle {
  data: DispatchDataRow[];
  Z_zheng: number;
  Z_dead: number;
  Z_xun: number;
  Z_fangshou_high: number;
  Np_wan: number;
}

function useDispatchBundle(
  sk: string,
  water: DispatchWaterLite | undefined,
  flood: DispatchFloodLite | undefined,
): DispatchBundle | null {
  return useMemo(() => {
    if (!water || !flood) return null;
    const Z_dead = water.Z_dead;
    const Np_wan = water.Np_wan;
    const Z_zheng = SCHEMES[sk].Z_zheng;
    const Z_fangshou_high = flood.Z_fangshou_high;

    // 重型计算 — compute_fangpo_line 31 年逆时序等出力试算
    const r = compute_fangpo_line(sk, Z_dead, Np_wan, 30);
    const months = r.months;
    const Z_env = r.Z_env;
    const all_curves = r.all_curves;

    // 汛限水位：7月 / 8月 的防破坏坐标
    const idx7 = months.indexOf(7);
    const idx8 = months.indexOf(8);
    const Z_xun = !isNaN(Z_env[idx7])
      ? Z_env[idx7]
      : !isNaN(Z_env[idx8])
      ? Z_env[idx8]
      : Z_zheng;

    // 25-75% 分位带
    const { p25, p75 } = computeBand(all_curves, months);

    // 加大出力辅助线: Z_it = Z_env + (Z_xun - Z_env) * i/4
    const aux1 = Z_env.map((z) => z + (Z_xun - z) * 1 / 4);
    const aux2 = Z_env.map((z) => z + (Z_xun - z) * 2 / 4);
    const aux3 = Z_env.map((z) => z + (Z_xun - z) * 3 / 4);

    // 防洪调度线：仅 5-9 月
    const data: DispatchDataRow[] = months.map((m, i) => {
      const fangpo = isNaN(Z_env[i]) ? null : Z_env[i];
      const lo = isNaN(p25[i]) ? null : p25[i];
      const hi = isNaN(p75[i]) ? null : p75[i];
      return {
        month: m,
        fangpo,
        aux1: aux1[i],
        aux2: aux2[i],
        aux3: aux3[i],
        p25: lo,
        p75: hi,
        p50: null,
        flood: m >= 5 && m <= 9 ? Z_fangshou_high : null,
      };
    });

    return {
      data,
      Z_zheng,
      Z_dead,
      Z_xun,
      Z_fangshou_high,
      Np_wan,
    };
  }, [sk, water, flood]);
}

// ────────────────────────────────────────────────────────────
// 单方案调度图
// ────────────────────────────────────────────────────────────
function DispatchChart({
  sk,
  bundle,
  height = 360,
}: {
  sk: string;
  bundle: DispatchBundle;
  height?: number;
}) {
  const { data, Z_zheng, Z_dead, Z_xun, Z_fangshou_high, Np_wan } = bundle;

  // y 轴范围
  const yMax = Math.ceil(Math.max(Z_zheng, Z_xun, Z_fangshou_high) + 3);
  const yMin = Math.floor(Z_dead - 2);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          方案 {sk} · 水库调度图
        </CardTitle>
        <CardDescription className="text-xs">
          N_p = {Np_wan.toFixed(1)} 万 kW · Z_正 {Z_zheng.toFixed(1)} m · Z_死 {Z_dead.toFixed(1)} m · Z_限 {Z_xun.toFixed(1)} m · Z_防 {Z_fangshou_high.toFixed(2)} m
        </CardDescription>
      </CardHeader>
      <CardContent style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 18, right: 64, left: 14, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10 }}
              ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}
            />
            <YAxis
              domain={[yMin, yMax]}
              allowDataOverflow={false}
              tick={{ fontSize: 10 }}
              label={{
                value: "水位 Z (m)",
                angle: -90,
                position: "insideLeft",
                fontSize: 10,
              }}
            />
            <Tooltip
              content={({ active, payload, label }: any) => {
                if (!active || !payload || payload.length === 0) return null;
                return (
                  <div className="rounded-md border bg-white/95 px-3 py-2 shadow-md text-xs">
                    <div className="font-semibold mb-1">{`月份 ${label}`}</div>
                    {payload.map((p: any, i: number) => {
                      if (p.value == null || isNaN(p.value)) return null;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-sm"
                            style={{ background: p.color || p.stroke }}
                          />
                          <span className="text-slate-600">{p.name}:</span>
                          <span className="font-mono font-semibold">
                            {(p.value as number).toFixed(2)} m
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />

            {/* 25-75% 分位带 — 用两条细线代替 fill area（避免 stacked 塌到 0） */}
            <Line
              type="monotone"
              dataKey="p25"
              name="P25"
              stroke={COLORS.hist}
              strokeWidth={0.8}
              strokeOpacity={0.6}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="p75"
              name="P75"
              stroke={COLORS.hist}
              strokeWidth={0.8}
              strokeOpacity={0.6}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
              legendType="none"
            />

            {/* 加大出力辅助线 1/4, 2/4, 3/4 — 灰虚线 */}
            <Line
              type="monotone"
              dataKey="aux1"
              name="辅助线 1/4"
              stroke={COLORS.aux}
              strokeWidth={1}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="aux2"
              name="辅助线 2/4"
              stroke={COLORS.aux}
              strokeWidth={1}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="aux3"
              name="辅助线 3/4"
              stroke={COLORS.aux}
              strokeWidth={1}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />

            {/* 防破坏线 — 蓝粗实线 + 圆点 */}
            <Line
              type="monotone"
              dataKey="fangpo"
              name="防破坏线 Z_fp (P=87.5%)"
              stroke={COLORS.Z_fangpo}
              strokeWidth={2.8}
              dot={{ r: 5, fill: COLORS.Z_fangpo, stroke: "white", strokeWidth: 1.2 }}
              activeDot={{ r: 7 }}
              connectNulls
              isAnimationActive={false}
            />

            {/* 防洪调度线 — 紫实线 + 方块 (5-9 月) — Recharts 默认圆点 */}
            <Line
              type="monotone"
              dataKey="flood"
              name={`防洪调度线 Z_fs=${Z_fangshou_high.toFixed(2)} m`}
              stroke={COLORS.Z_fangshou}
              strokeWidth={2.2}
              dot={{ r: 6, fill: COLORS.Z_fangshou, stroke: "white", strokeWidth: 1.2 }}
              connectNulls
              isAnimationActive={false}
            />

            {/* 阈值参考线 — 标签在左侧（避免被右边界截断） */}
            <ReferenceLine
              y={Z_zheng}
              stroke={COLORS.Z_zheng}
              strokeWidth={1.2}
              label={{
                value: `Z_正 ${Z_zheng.toFixed(1)}`,
                position: "insideTopLeft",
                fontSize: 9,
                fill: COLORS.Z_zheng,
                offset: 4,
              }}
            />
            <ReferenceLine
              y={Z_dead}
              stroke={COLORS.Z_dead}
              strokeWidth={1.2}
              strokeDasharray="6 2 1 2"
              label={{
                value: `Z_死 ${Z_dead.toFixed(1)}`,
                position: "insideBottomLeft",
                fontSize: 9,
                fill: COLORS.Z_dead,
                offset: 4,
              }}
            />
            <ReferenceLine
              y={Z_xun}
              stroke={COLORS.Z_xun}
              strokeWidth={1.4}
              strokeDasharray="2 3"
              label={{
                value: `Z_限 ${Z_xun.toFixed(1)}`,
                position: "insideTopLeft",
                fontSize: 9,
                fill: COLORS.Z_xun,
                offset: 50,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// 4 方案 2×2 网格（默认）/ 单方案视图
// ────────────────────────────────────────────────────────────
export function DispatchChartsAll({
  waterResults,
  floodResults,
  singleScheme,
}: DispatchChartsProps) {
  // 4 个 hooks — 静态调用，React Rules of Hooks 允许
  const bundleI = useDispatchBundle("I", waterResults?.I, floodResults?.I);
  const bundleII = useDispatchBundle("II", waterResults?.II, floodResults?.II);
  const bundleIII = useDispatchBundle("III", waterResults?.III, floodResults?.III);
  const bundleIV = useDispatchBundle("IV", waterResults?.IV, floodResults?.IV);

  const bundles: Array<{ sk: string; bundle: DispatchBundle | null }> = [
    { sk: "I", bundle: bundleI },
    { sk: "II", bundle: bundleII },
    { sk: "III", bundle: bundleIII },
    { sk: "IV", bundle: bundleIV },
  ];

  if (singleScheme) {
    const entry = bundles.find((b) => b.sk === singleScheme);
    if (!entry || !entry.bundle) {
      return (
        <Card>
          <CardContent className="h-32 flex items-center justify-center text-sm text-slate-500">
            方案 {singleScheme} 数据尚未计算
          </CardContent>
        </Card>
      );
    }
    return <DispatchChart sk={entry.sk} bundle={entry.bundle} height={520} />;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 px-1">
        防破坏线（蓝粗实）+ 防洪调度线（紫）+ 加大出力 1/4-3/4 辅助线 + 历史 25-75% 分位带。
        <span className="text-slate-400">hover 任意曲线查看精确水位。</span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {bundles.map(({ sk, bundle }) =>
          bundle ? (
            <DispatchChart key={sk} sk={sk} bundle={bundle} />
          ) : (
            <Card key={sk}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">方案 {sk}</CardTitle>
              </CardHeader>
              <CardContent className="h-[360px] flex items-center justify-center text-sm text-slate-500">
                数据尚未计算
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
