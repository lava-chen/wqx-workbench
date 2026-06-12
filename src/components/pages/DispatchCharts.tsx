"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { compute_fangpo_line, SCHEMES } from "@/lib/engine";

const COLORS = {
  fangpo: "#1F77B4",
  flood: "#8E44AD",
  zheng: "#000000",
  dead: "#000000",
  xun: "#C0392B",
  aux: "#B3B3B3",
  hist: "#D4D4D8",
};

const DISPLAY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3] as const;

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
  singleScheme?: string;
}

interface DispatchDataRow {
  month: number;
  fangpo: number | null;
  aux1: number | null;
  aux2: number | null;
  aux3: number | null;
  bandBase: number | null;
  bandSpan: number | null;
  p25: number | null;
  p75: number | null;
  flood: number | null;
  [key: `hist_${number}`]: number | null;
}

interface DispatchBundle {
  data: DispatchDataRow[];
  historyKeys: string[];
  Z_zheng: number;
  Z_dead: number;
  Z_xun: number;
  Z_fangshou_high: number;
  Np_wan: number;
}

interface FloodDotProps {
  cx?: number;
  cy?: number;
  payload?: {
    flood?: number | null;
  };
}

interface TooltipEntry {
  value?: number | null;
  color?: string;
  stroke?: string;
  name?: string;
  dataKey?: string;
}

interface TooltipContentProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number | string;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const index = Math.floor(q * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function computeBand(
  allCurves: Record<number, Record<number, number>>,
  months: number[],
) {
  const p25: number[] = [];
  const p75: number[] = [];

  for (const month of months) {
    const values = Object.keys(allCurves)
      .map((year) => allCurves[Number(year)]?.[month])
      .filter((value): value is number => value !== undefined && !isNaN(value))
      .sort((a, b) => a - b);

    if (values.length === 0) {
      p25.push(NaN);
      p75.push(NaN);
      continue;
    }

    p25.push(percentile(values, 0.25));
    p75.push(percentile(values, 0.75));
  }

  return { p25, p75 };
}

function SquareDot(props: FloodDotProps) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || payload?.flood == null) return null;
  return (
    <rect
      x={cx - 6}
      y={cy - 6}
      width={12}
      height={12}
      fill={COLORS.flood}
      stroke="white"
      strokeWidth={1.2}
    />
  );
}

function useDispatchBundle(
  schemeKey: string,
  water: DispatchWaterLite | undefined,
  flood: DispatchFloodLite | undefined,
): DispatchBundle | null {
  return useMemo(() => {
    if (!water || !flood) return null;

    const Z_dead = water.Z_dead;
    const Np_wan = water.Np_wan;
    const Z_zheng = SCHEMES[schemeKey].Z_zheng;
    const Z_fangshou_high = flood.Z_fangshou_high;

    const result = compute_fangpo_line(schemeKey, Z_dead, Np_wan, 30);
    const months = result.months;
    const Z_env = result.Z_env;
    const allCurves = result.all_curves;
    const historyKeys = Object.keys(allCurves).map((year) => `hist_${year}`);

    const idx7 = months.indexOf(7);
    const idx8 = months.indexOf(8);
    const Z_xun = !isNaN(Z_env[idx7])
      ? Z_env[idx7]
      : !isNaN(Z_env[idx8])
        ? Z_env[idx8]
        : Z_zheng;

    const { p25, p75 } = computeBand(allCurves, months);

    const aux1 = Z_env.map((z) => z + ((Z_xun - z) * 1) / 4);
    const aux2 = Z_env.map((z) => z + ((Z_xun - z) * 2) / 4);
    const aux3 = Z_env.map((z) => z + ((Z_xun - z) * 3) / 4);

    const data: DispatchDataRow[] = months.map((month, i) => {
      const row: DispatchDataRow = {
        month,
        fangpo: isNaN(Z_env[i]) ? null : Z_env[i],
        aux1: isNaN(aux1[i]) ? null : aux1[i],
        aux2: isNaN(aux2[i]) ? null : aux2[i],
        aux3: isNaN(aux3[i]) ? null : aux3[i],
        bandBase: isNaN(p25[i]) ? null : p25[i],
        bandSpan:
          isNaN(p25[i]) || isNaN(p75[i]) ? null : Math.max(0, p75[i] - p25[i]),
        p25: isNaN(p25[i]) ? null : p25[i],
        p75: isNaN(p75[i]) ? null : p75[i],
        flood: month >= 5 && month <= 9 ? Z_fangshou_high : null,
      };

      Object.keys(allCurves).forEach((year) => {
        const key = `hist_${year}` as const;
        const value = allCurves[Number(year)]?.[month];
        ((row as unknown) as Record<string, number | null>)[key] =
          value === undefined || isNaN(value) ? null : value;
      });

      return row;
    });

    return {
      data,
      historyKeys,
      Z_zheng,
      Z_dead,
      Z_xun,
      Z_fangshou_high,
      Np_wan,
    };
  }, [flood, schemeKey, water]);
}

function DispatchChart({
  sk,
  bundle,
  height = 360,
}: {
  sk: string;
  bundle: DispatchBundle;
  height?: number;
}) {
  const {
    data,
    historyKeys,
    Np_wan,
    Z_dead,
    Z_fangshou_high,
    Z_xun,
    Z_zheng,
  } = bundle;

  const yMax = Math.ceil(Math.max(Z_zheng, Z_xun, Z_fangshou_high) + 3);
  const yMin = Math.floor(Z_dead - 2);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">方案 {sk} · 水库调度图</CardTitle>
        <CardDescription className="text-xs">
          N_p = {Np_wan.toFixed(1)} 万 kW · Z_正 {Z_zheng.toFixed(1)} m · Z_死{" "}
          {Z_dead.toFixed(1)} m · Z_限 {Z_xun.toFixed(1)} m · Z_防{" "}
          {Z_fangshou_high.toFixed(2)} m
        </CardDescription>
      </CardHeader>
      <CardContent style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 18, right: 64, left: 14, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="month"
              type="category"
              ticks={[...DISPLAY_MONTHS]}
              interval={0}
              tick={{ fontSize: 10 }}
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
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                return (
                  <div className="rounded-md border bg-white/95 px-3 py-2 text-xs shadow-md">
                    <div className="mb-1 font-semibold">月份 {label}</div>
                    {payload.map((item, index) => {
                      if (
                        item.value == null ||
                        typeof item.value !== "number" ||
                        Number.isNaN(item.value) ||
                        String(item.dataKey).startsWith("hist_") ||
                        item.dataKey === "bandBase" ||
                        item.dataKey === "bandSpan"
                      ) {
                        return null;
                      }
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-sm"
                            style={{ background: item.color || item.stroke }}
                          />
                          <span className="text-slate-600">{item.name}:</span>
                          <span className="font-mono font-semibold">
                            {(item.value as number).toFixed(2)} m
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />

            {historyKeys.map((key) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS.hist}
                strokeWidth={0.8}
                strokeOpacity={0.18}
                dot={false}
                connectNulls={false}
                legendType="none"
                isAnimationActive={false}
              />
            ))}

            <Area
              type="monotone"
              dataKey="bandBase"
              stackId="band"
              stroke="none"
              fill="none"
              legendType="none"
              isAnimationActive={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="bandSpan"
              stackId="band"
              name="历史过程 25%-75% 分位带"
              stroke="none"
              fill={COLORS.hist}
              fillOpacity={0.18}
              isAnimationActive={false}
              connectNulls={false}
            />

            <Line
              type="monotone"
              dataKey="p25"
              stroke={COLORS.hist}
              strokeWidth={0.8}
              strokeOpacity={0.6}
              dot={false}
              legendType="none"
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="p75"
              stroke={COLORS.hist}
              strokeWidth={0.8}
              strokeOpacity={0.6}
              dot={false}
              legendType="none"
              isAnimationActive={false}
              connectNulls={false}
            />

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

            <Line
              type="monotone"
              dataKey="fangpo"
              name="防破坏线 Z_fp (P=87.5%)"
              stroke={COLORS.fangpo}
              strokeWidth={2.8}
              dot={{
                r: 5,
                fill: COLORS.fangpo,
                stroke: "white",
                strokeWidth: 1.2,
              }}
              activeDot={{ r: 7 }}
              connectNulls
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="flood"
              name={`防洪调度线 Z_fs=${Z_fangshou_high.toFixed(2)} m`}
              stroke={COLORS.flood}
              strokeWidth={2.2}
              dot={<SquareDot />}
              connectNulls
              isAnimationActive={false}
            />

            <ReferenceLine
              y={Z_zheng}
              stroke={COLORS.zheng}
              strokeWidth={1.2}
              label={{
                value: `Z_正 ${Z_zheng.toFixed(1)}`,
                position: "insideTopLeft",
                fontSize: 9,
                fill: COLORS.zheng,
                offset: 4,
              }}
            />
            <ReferenceLine
              y={Z_dead}
              stroke={COLORS.dead}
              strokeWidth={1.2}
              strokeDasharray="6 2 1 2"
              label={{
                value: `Z_死 ${Z_dead.toFixed(1)}`,
                position: "insideBottomLeft",
                fontSize: 9,
                fill: COLORS.dead,
                offset: 4,
              }}
            />
            <ReferenceLine
              y={Z_xun}
              stroke={COLORS.xun}
              strokeWidth={1.4}
              strokeDasharray="2 3"
              label={{
                value: `Z_限 ${Z_xun.toFixed(1)}`,
                position: "insideTopLeft",
                fontSize: 9,
                fill: COLORS.xun,
                offset: 50,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function DispatchChartsAll({
  waterResults,
  floodResults,
  singleScheme,
}: DispatchChartsProps) {
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
    const entry = bundles.find((item) => item.sk === singleScheme);
    if (!entry?.bundle) {
      return (
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-slate-500">
            方案 {singleScheme} 数据尚未计算
          </CardContent>
        </Card>
      );
    }
    return <DispatchChart sk={entry.sk} bundle={entry.bundle} height={520} />;
  }

  return (
    <div className="space-y-3">
      <div className="px-1 text-xs text-slate-500">
        防破坏线（蓝粗实）+ 防洪调度线（紫）+ 加大出力 1/4-3/4 辅助线 +
        历史过程细线与 25%-75% 分位带。
        <span className="text-slate-400"> hover 任意曲线可查看精确水位。</span>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {bundles.map(({ sk, bundle }) =>
          bundle ? (
            <DispatchChart key={sk} sk={sk} bundle={bundle} />
          ) : (
            <Card key={sk}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">方案 {sk}</CardTitle>
              </CardHeader>
              <CardContent className="flex h-[360px] items-center justify-center text-sm text-slate-500">
                数据尚未计算
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
