"use client";

import { useMemo, useState } from "react";
import {
  Brush,
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

const COLORS = {
  Z: "#1F77B4",
  Q_in: "#2E8B57",
  Q_out: "#C0392B",
  Q_safe: "#FF7F0E",
  Z_start: "#000000",
};

const DT_H = 3;
const STD_KEYS = ["P5", "P0_1", "P0_01"] as const;
const SCHEME_KEYS = ["I", "II", "III", "IV"] as const;

const STD_LABELS: Record<
  (typeof STD_KEYS)[number],
  { label: string; sub: string }
> = {
  P5: { label: "P=5% 下游防洪", sub: "20 年一遇" },
  P0_1: { label: "P=0.1% 大坝设计", sub: "1000 年一遇" },
  P0_01: { label: "P=0.01% 大坝校核", sub: "10000 年一遇" },
};

const SCHEME_LABELS: Record<(typeof SCHEME_KEYS)[number], string> = {
  I: "方案 I",
  II: "方案 II",
  III: "方案 III",
  IV: "方案 IV",
};

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

interface FloodPoint {
  t: number;
  Z: number;
  Q_in: number;
  Q_out: number;
}

interface FloodChartBundle {
  data: FloodPoint[];
  Z_start: number;
  Z_max: number;
  Q_max: number;
  t_total: number;
  Q_safe: number;
}

function buildFloodData(
  stdKey: string,
  floodResults: FloodResultWithSeries | undefined,
  qSafe: number,
  zStartOverride?: number,
): FloodChartBundle | null {
  if (!floodResults?.series) return null;
  const series = floodResults.series[stdKey];
  if (!series) return null;

  const qInSeries = series.Q_in;
  const zSeries = series.Z;
  const qOutSeries = series.Q_out;
  const n = qInSeries.length;

  const data: FloodPoint[] = [];
  for (let i = 0; i <= n; i++) {
    data.push({
      t: (i * DT_H) / 24,
      Z: zSeries[i],
      Q_in: i < n ? qInSeries[i] : qInSeries[n - 1],
      Q_out: qOutSeries[i],
    });
  }

  return {
    data,
    Z_start: zStartOverride ?? zSeries[0],
    Z_max: series.Z_max,
    Q_max: series.Q_max,
    t_total: (n * DT_H) / 24,
    Q_safe: qSafe,
  };
}

function FloodRoutingChart({
  sk,
  stdKey,
  floodResults,
  qSafe,
  zStartOverride,
  height = 320,
  showBrush = false,
  compact = false,
}: {
  sk: (typeof SCHEME_KEYS)[number];
  stdKey: (typeof STD_KEYS)[number];
  floodResults: FloodResultWithSeries | undefined;
  qSafe: number;
  zStartOverride?: number;
  height?: number;
  showBrush?: boolean;
  compact?: boolean;
}) {
  const bundle = useMemo(
    () => buildFloodData(stdKey, floodResults, qSafe, zStartOverride),
    [stdKey, floodResults, qSafe, zStartOverride],
  );

  if (!bundle) {
    return (
      <Card>
        <CardHeader className={compact ? "pb-1" : "pb-2"}>
          <CardTitle className={compact ? "text-[13px]" : "text-sm"}>
            {SCHEME_LABELS[sk]} · {STD_LABELS[stdKey].label}
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
  const zMin = Math.min(...data.map((d) => d.Z));
  const qAllMax = Math.max(Q_safe, ...data.map((d) => Math.max(d.Q_in, d.Q_out)));

  return (
    <Card>
      <CardHeader className={compact ? "pb-1" : "pb-2"}>
        <CardTitle className={compact ? "text-[13px]" : "text-sm"}>
          {SCHEME_LABELS[sk]} · {STD_LABELS[stdKey].label}
        </CardTitle>
        {compact ? (
          <CardDescription className="text-[11px] font-mono leading-tight text-slate-500">
            Z_max {Z_max.toFixed(2)} · Q_max {Q_max.toFixed(0)} · Z_0 {Z_start.toFixed(1)}
          </CardDescription>
        ) : (
          <CardDescription className="text-xs font-mono">
            Z_max = {Z_max.toFixed(2)} m · Q_max = {Q_max.toFixed(0)} m³/s · Z_0 ={" "}
            {Z_start.toFixed(1)} m · T = {t_total.toFixed(1)} d
          </CardDescription>
        )}
      </CardHeader>
      <CardContent style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{
              top: compact ? 6 : 10,
              right: compact ? 42 : 60,
              left: compact ? 2 : 8,
              bottom: showBrush ? 36 : compact ? 0 : 4,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, t_total]}
              tick={{ fontSize: compact ? 8 : 9 }}
              tickFormatter={(v) => Number(v).toFixed(1)}
              label={
                showBrush || compact
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
              tick={{ fontSize: compact ? 8 : 9 }}
              domain={[zMin - 0.5, Z_max + 1.5]}
              label={{
                value: "Z (m)",
                angle: -90,
                position: "insideLeft",
                fontSize: compact ? 8 : 9,
                fill: COLORS.Z,
              }}
            />
            <YAxis
              yAxisId="q"
              orientation="right"
              tick={{ fontSize: compact ? 8 : 9 }}
              domain={[0, qAllMax * 1.15]}
              label={{
                value: compact ? "Q" : "Q (m³/s)",
                angle: 90,
                position: "insideRight",
                fontSize: compact ? 8 : 9,
              }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                return (
                  <div className="rounded-md border bg-white/95 px-3 py-2 text-xs shadow-md">
                    <div className="mb-1 font-semibold">
                      t = {Number(label).toFixed(2)} d
                    </div>
                    {payload.map((item, index: number) => (
                      <div key={index} className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-sm"
                          style={{ background: item.color || item.stroke }}
                        />
                        <span className="text-slate-600">{item.name}:</span>
                        <span className="font-mono font-semibold">
                          {Number(item.value).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {!compact && <Legend wrapperStyle={{ fontSize: 9 }} />}

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
              stroke={COLORS.Z_start}
              strokeWidth={1}
              strokeDasharray="4 2"
              label={{
                value: `Z_0 ${Z_start.toFixed(1)}`,
                position: "right",
                fontSize: 8,
                fill: "#000",
              }}
            />

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
                value: compact ? "q_safe" : `q_safe ${Q_safe}`,
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
                tickFormatter={(v) => Number(v).toFixed(1)}
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

export function FloodRouting2x2({
  floodResults,
  Q_SAFE,
  std_key = "P5",
  height = 320,
}: {
  floodResults: Record<string, FloodResultWithSeries>;
  Q_SAFE: number;
  std_key?: (typeof STD_KEYS)[number];
  height?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="px-1 text-xs text-slate-500">
        四方案 {STD_LABELS[std_key].label}（{STD_LABELS[std_key].sub}）调洪过程对比。
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {SCHEME_KEYS.map((sk) => (
          <FloodRoutingChart
            key={sk}
            sk={sk}
            stdKey={std_key}
            floodResults={floodResults?.[sk]}
            qSafe={Q_SAFE}
            height={height}
            showBrush={false}
          />
        ))}
      </div>
    </div>
  );
}

export function FloodRoutingAllGrid({
  floodResults,
  Q_SAFE,
  cellHeight = 360,
}: {
  floodResults: Record<string, FloodResultWithSeries>;
  Q_SAFE: number;
  cellHeight?: number;
}) {
  const [activeScheme, setActiveScheme] =
    useState<(typeof SCHEME_KEYS)[number]>("I");
  const [activeStd, setActiveStd] = useState<(typeof STD_KEYS)[number]>("P5");

  return (
    <div className="space-y-3">
      <div className="px-1 text-xs text-slate-500">
        单图查看模式：通过按钮切换方案和标准，比 12 张缩略图更适合看调洪过程细节。
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white/85 p-3">
        <div className="flex flex-wrap gap-2">
          {SCHEME_KEYS.map((sk) => (
            <button
              key={sk}
              type="button"
              onClick={() => setActiveScheme(sk)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                activeScheme === sk
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {SCHEME_LABELS[sk]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STD_KEYS.map((stdKey) => (
            <button
              key={stdKey}
              type="button"
              onClick={() => setActiveStd(stdKey)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                activeStd === stdKey
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              <span>{STD_LABELS[stdKey].label}</span>
              <span className="ml-2 text-[11px] opacity-80">
                {STD_LABELS[stdKey].sub}
              </span>
            </button>
          ))}
        </div>
        <div className="px-1 text-xs text-slate-500">
          当前查看：{SCHEME_LABELS[activeScheme]} / {STD_LABELS[activeStd].label}
        </div>
        <FloodRoutingChart
          sk={activeScheme}
          stdKey={activeStd}
          floodResults={floodResults?.[activeScheme]}
          qSafe={Q_SAFE}
          height={cellHeight}
          showBrush
        />
      </div>
    </div>
  );
}
