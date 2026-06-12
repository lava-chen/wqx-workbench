"use client";

import { useState, useMemo } from "react";
import { useAllResults } from "@/hooks/useAllResults";
import { useParams } from "@/hooks/useParams";
import {
  SCHEMES,
  Z_V_TABLE,
  Z_Q_TABLE,
  z_to_v,
  v_to_z,
  q_to_zd,
  ECON,
  Q_SAFE as ENGINE_Q_SAFE,
  R0 as ENGINE_R0,
} from "@/lib/engine";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  CompareChartDeadLevel,
  CompareChartFirmPower,
  CompareChartEnergy,
  CompareChartInstalled,
  CompareChartDesignCheck,
  CompareChartEconomic,
  CompareChartOverview,
} from "./CompareCharts";
import { DispatchChartsAll } from "./DispatchCharts";
import {
  FloodRouting2x2,
  FloodRoutingAllGrid,
} from "./FloodRoutingCharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ============================================================
// 颜色方案
// ============================================================
const COLORS: Record<string, string> = {
  I: "#1f77b4",
  II: "#ff7f0e",
  III: "#2ca02c",
  IV: "#d62728",
};

const SCHEME_KEYS = ["I", "II", "III", "IV"] as const;

const SCHEME_LABELS: Record<string, string> = {
  I: "方案 I",
  II: "方案 II",
  III: "方案 III",
  IV: "方案 IV",
};

// ============================================================
// 图表标签配置
// ============================================================
const CHART_TABS = [
  { value: "chart1", label: "水位-库容曲线" },
  { value: "chart2", label: "下游水位-流量曲线" },
  { value: "chart3", label: "经济对比" },
  { value: "chart4", label: "装机-电能关系" },
  { value: "chart5", label: "方案指标雷达图" },
  { value: "chart6", label: "多年平均电能对比" },
  { value: "chart7", label: "装机利用小时数" },
  // ---- 多方案对比 (fig_compare_*, 对齐 figs_scientific) ----
  { value: "compare_dead", label: "对比·死水位" },
  { value: "compare_firm", label: "对比·保证出力" },
  { value: "compare_energy", label: "对比·多年电能" },
  { value: "compare_inst", label: "对比·装机构成" },
  { value: "compare_z", label: "对比·特征水位" },
  { value: "compare_econ", label: "对比·经济" },
  { value: "compare_overview", label: "对比·综合概览" },
  // ---- 水库调度图 (fig_dispatch_{I,II,III,IV}, 防破坏线 + 调度规则) ----
  { value: "dispatch", label: "调度图·4 方案" },
  // ---- 调洪过程线 (fig_flood_routing_*, 双 Y 轴 + Q_in 阶梯) ----
  { value: "flood_2x2_p5", label: "调洪·P=5% 2×2" },
  { value: "flood_2x2_p01", label: "调洪·P=0.1% 2×2" },
  { value: "flood_2x2_p001", label: "调洪·P=0.01% 2×2" },
  { value: "flood_all_4x3", label: "调洪·4×3 全景" },
];

// ============================================================
// 雷达图数据归一化
// ============================================================
function normalizeMetrics(
  raw: Array<{
    scheme: string;
    装机容量: number;
    保证出力: number;
    多年平均电能: number;
    年费用: number;
    校核洪水位: number;
  }>
) {
  const metrics = ["装机容量", "保证出力", "多年平均电能", "年费用", "校核洪水位"] as const;
  const reversed = new Set(["年费用", "校核洪水位"]);

  const max: Record<string, number> = {};
  const min: Record<string, number> = {};

  for (const m of metrics) {
    const vals = raw.map((d) => d[m]);
    max[m] = Math.max(...vals);
    min[m] = Math.min(...vals);
  }

  return metrics.map((m) => {
    const entry: Record<string, number | string> = { metric: m };
    for (const d of raw) {
      const range = max[m] - min[m];
      if (range === 0) {
        entry[d.scheme] = 50;
      } else if (reversed.has(m)) {
        entry[d.scheme] = Number((((max[m] - d[m]) / range) * 100).toFixed(1));
      } else {
        entry[d.scheme] = Number((((d[m] - min[m]) / range) * 100).toFixed(1));
      }
    }
    return entry;
  });
}

// ============================================================
// 主组件
// ============================================================
export function ChartsPage() {
  const [activeChart, setActiveChart] = useState("chart1");
  const { waterResults, floodResults, econ } = useAllResults();
  const { params, isModified, defaults } = useParams();

  // ---- Chart 1: 水位-库容曲线数据 ----
  const zvData = useMemo(
    () => Z_V_TABLE.map(([z, v]) => ({ Z: z, V: v })),
    []
  );

  // ---- Chart 2: 下游水位-流量曲线数据 ----
  const zqData = useMemo(
    () => Z_Q_TABLE.map(([z, q]) => ({ Z: z, Q: q })),
    []
  );

  // ---- Chart 3: 经济对比柱状图数据 (responds to R0 param) ----
  const econBarData = useMemo(() => {
    if (!econ || econ.length === 0) return [];
    return SCHEME_KEYS.map((sk) => {
      const row = econ.find((e) => e.scheme === sk);
      const cfg = ECON[sk];
      const totalInvest = cfg.dam_invest + cfg.mech_invest + cfg.temp_invest;
      return {
        scheme: SCHEME_LABELS[sk],
        枢纽总投资: Math.round(totalInvest),
        年运行费: row ? Math.round(row.annual_run) : 0,
        年费用: row ? Math.round(row.annual_total) : 0,
        _key: sk,
      };
    });
  }, [econ]);

  // ---- Chart 4: 装机-电能关系数据 ----
  const nyData = useMemo(() => {
    return SCHEME_KEYS.map((sk) => {
      const w = waterResults[sk];
      return {
        scheme: SCHEME_LABELS[sk],
        N_Y: w ? Math.round(w.N_Y * 10) / 10 : 0,
        E_avg: w ? Math.round(w.E_avg * 100) / 100 : 0,
        _key: sk,
      };
    });
  }, [waterResults]);

  // ---- Chart 5: 雷达图数据 ----
  const radarData = useMemo(() => {
    const raw = SCHEME_KEYS.map((sk) => {
      const w = waterResults[sk];
      const f = floodResults[sk];
      const e = econ?.find((r) => r.scheme === sk);
      return {
        scheme: sk,
        装机容量: w ? w.N_Y : 0,
        保证出力: w ? w.Np_wan : 0,
        多年平均电能: w ? w.E_avg : 0,
        年费用: e ? e.annual_total : 0,
        校核洪水位: f ? f.Z_check : 0,
      };
    });
    return normalizeMetrics(raw);
  }, [waterResults, floodResults, econ]);

  // ---- Chart 6 & 7: 电能 & 利用小时数数据 ----
  const energyBarData = useMemo(() => {
    return SCHEME_KEYS.map((sk) => {
      const w = waterResults[sk];
      const E_avg = w ? w.E_avg : 0;
      const N_Y = w ? w.N_Y : 1;
      const hours = N_Y > 0 ? Math.round((E_avg * 10000) / N_Y) : 0;
      return {
        scheme: SCHEME_LABELS[sk],
        E_avg: Math.round(E_avg * 100) / 100,
        利用小时数: hours,
        _key: sk,
      };
    });
  }, [waterResults]);

  // ---- 方案水位参考线 ----
  const schemeRefLines = useMemo(() => {
    const lines: Array<{
      y: number;
      stroke: string;
      strokeDasharray: string;
      label: string;
    }> = [];
    for (const sk of SCHEME_KEYS) {
      const baseZ = SCHEMES[sk].Z_zheng;
      const offset = params.Z_zheng_offset[sk] || 0;
      const adjustedZ = baseZ + offset;
      lines.push({
        y: adjustedZ,
        stroke: COLORS[sk],
        strokeDasharray: offset !== 0 ? "4 4" : "6 4",
        label: `${SCHEME_LABELS[sk]} 正常水位 ${adjustedZ}m${offset !== 0 ? " (调整)" : ""}`,
      });
      const deadZ = waterResults[sk]?.Z_dead;
      if (deadZ !== undefined) {
        lines.push({
          y: deadZ,
          stroke: COLORS[sk],
          strokeDasharray: "2 4",
          label: `${SCHEME_LABELS[sk]} 死水位 ${Math.round(deadZ)}m`,
        });
      }
    }
    return lines;
  }, [waterResults, params.Z_zheng_offset]);

  // ---- 渲染工具函数 ----
  function chartCard(title: string, children: React.ReactNode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="h-[420px]">{children}</CardContent>
      </Card>
    );
  }

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="space-y-4">
      {/* Parameter status note */}
      {isModified && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          <span className="font-medium">当前参数：</span>
          {params.Q_SAFE !== defaults.Q_SAFE && (
            <Badge variant="secondary" className="text-[10px]">
              Q<sub>安</sub>={params.Q_SAFE}
            </Badge>
          )}
          {params.R0 !== defaults.R0 && (
            <Badge variant="secondary" className="text-[10px]">
              r<sub>0</sub>={params.R0.toFixed(2)}
            </Badge>
          )}
          {Object.entries(params.Z_zheng_offset).filter(([, v]) => v !== 0).map(([sk, v]) => (
            <Badge key={sk} variant="secondary" className="text-[10px] bg-purple-100 text-purple-700">
              方案{sk} Z<sub>正</sub>{v > 0 ? "+" : ""}{v}m
            </Badge>
          ))}
          <span className="ml-auto text-amber-500">图表数据已反映参数调整</span>
        </div>
      )}

      <Tabs
        value={activeChart}
        onValueChange={(val: string) => setActiveChart(val)}
        className="w-full"
      >
        <TabsList className="flex-wrap h-auto gap-1 mb-6 overflow-x-auto justify-start">
          {CHART_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex-none"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Chart 1: 水位-库容曲线 — 4 方案 2×2 对比 */}
        <TabsContent value="chart1">
          <div className="text-xs text-slate-500 px-1 mb-3">
            4 方案共用同一条 Z-V 曲线（库容是水位的固有函数）。
            每个子图标注该方案的 Z_正（实线）、Z_死（点划线）和工作区段（V_死-V_正 淡色填充）。
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {SCHEME_KEYS.map((sk) => {
              const Z_zheng_adj = SCHEMES[sk].Z_zheng + (params.Z_zheng_offset[sk] || 0);
              const Z_dead = waterResults[sk]?.Z_dead;
              const V_zheng = z_to_v(Z_zheng_adj);
              const V_dead = Z_dead !== undefined ? z_to_v(Z_dead) : undefined;
              return (
                <div
                  key={sk}
                  className="rounded-lg border bg-card p-3 text-card-foreground shadow-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-semibold" style={{ color: COLORS[sk] }}>
                      方案 {sk} · Z-V 曲线
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      Z_正 {Z_zheng_adj.toFixed(1)} m ·{" "}
                      {Z_dead !== undefined
                        ? `Z_死 ${Z_dead.toFixed(1)} m`
                        : "Z_死 —"}
                    </div>
                  </div>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={zvData}
                        margin={{ top: 8, right: 32, left: 4, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis
                          dataKey="V"
                          tick={{ fontSize: 9 }}
                          label={{
                            value: "库容 V (亿m³)",
                            position: "insideBottomRight",
                            offset: -4,
                            fontSize: 9,
                          }}
                        />
                        <YAxis
                          domain={[40, 150]}
                          allowDataOverflow={false}
                          tick={{ fontSize: 9 }}
                          label={{
                            value: "水位 Z (m)",
                            angle: -90,
                            position: "insideLeft",
                            fontSize: 9,
                          }}
                        />
                        <Tooltip
                          formatter={(value: any) => [value.toFixed(2), ""]}
                          labelFormatter={(v: any) => `V = ${v} 亿m³`}
                        />
                        {/* 工作区段填色 V_死-V_正（仅在该子图内） */}
                        {V_dead !== undefined && (
                          <ReferenceArea
                            x1={V_dead}
                            x2={V_zheng}
                            y1={40}
                            y2={150}
                            fill={COLORS[sk]}
                            fillOpacity={0.08}
                            stroke="none"
                          />
                        )}
                        <Line
                          type="monotone"
                          dataKey="Z"
                          stroke="#1f77b4"
                          strokeWidth={2}
                          dot={false}
                          name="Z-V 曲线"
                          isAnimationActive={false}
                        />
                        <ReferenceLine
                          y={Z_zheng_adj}
                          stroke={COLORS[sk]}
                          strokeWidth={1.6}
                          label={{
                            value: `Z_正 ${Z_zheng_adj.toFixed(1)}`,
                            position: "insideTopRight",
                            fontSize: 9,
                            fill: COLORS[sk],
                          }}
                        />
                        {Z_dead !== undefined && (
                          <ReferenceLine
                            y={Z_dead}
                            stroke={COLORS[sk]}
                            strokeWidth={1.4}
                            strokeDasharray="6 2 1 2"
                            label={{
                              value: `Z_死 ${Z_dead.toFixed(1)}`,
                              position: "insideBottomRight",
                              fontSize: 9,
                              fill: COLORS[sk],
                            }}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Chart 2: 下游水位-流量曲线 with current Q_SAFE */}
        <TabsContent value="chart2">
          {chartCard(
            "下游水位-流量曲线 (Z-q Curve)",
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={zqData}
                margin={{ top: 30, right: 50, left: 24, bottom: 14 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="Q"
                  tick={{ fontSize: 10 }}
                  label={{
                    value: "流量 q (m³/s)",
                    position: "insideBottomRight",
                    offset: -8,
                    fontSize: 10,
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  domain={[
                    (dataMin: number) => Math.floor(dataMin * 10) / 10 - 0.2,
                    (dataMax: number) => Math.ceil(dataMax * 10) / 10 + 0.2,
                  ]}
                  allowDataOverflow={false}
                  label={{
                    value: "下游水位 Z (m)",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 10,
                    offset: 14,
                  }}
                />
                <Tooltip
                  formatter={(value: any) => [Number(value).toFixed(2), "Z (m)"]}
                  labelFormatter={(v: any) => `q = ${v} m³/s`}
                />
                <Line
                  type="monotone"
                  dataKey="Z"
                  stroke="#2ca02c"
                  strokeWidth={2.2}
                  dot={false}
                  name="Z-q 曲线"
                  isAnimationActive={false}
                />
                <ReferenceLine
                  x={params.Q_SAFE}
                  stroke="#d62728"
                  strokeWidth={1.4}
                  strokeDasharray={params.Q_SAFE !== ENGINE_Q_SAFE ? "4 4" : "6 4"}
                  label={{
                    value: `Q_安 = ${params.Q_SAFE} m³/s${params.Q_SAFE !== ENGINE_Q_SAFE ? " (调整)" : ""}`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "#d62728",
                    offset: 6,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        {/* Chart 3: 经济对比柱状图 */}
        <TabsContent value="chart3">
          {chartCard(
            "经济对比 — 方案 I / II / III / IV",
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={econBarData}
                margin={{ top: 30, right: 36, left: 20, bottom: 12 }}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  allowDataOverflow={false}
                  label={{
                    value: "万元",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 10,
                    offset: 12,
                  }}
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 }) + " 万元",
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="枢纽总投资" fill="#1f77b4" name="枢纽总投资">
                  <LabelList
                    dataKey="枢纽总投资"
                    position="top"
                    fontSize={10}
                    formatter={(v: any) =>
                      Number(v) >= 1e4
                        ? (v / 1e4).toFixed(2) + " 亿"
                        : v.toFixed(0)
                    }
                  />
                </Bar>
                <Bar dataKey="年运行费" fill="#ff7f0e" name="年运行费">
                  <LabelList
                    dataKey="年运行费"
                    position="top"
                    fontSize={10}
                    formatter={(v: any) => v.toFixed(0)}
                  />
                </Bar>
                <Bar dataKey="年费用" fill="#2ca02c" name="年费用">
                  <LabelList
                    dataKey="年费用"
                    position="top"
                    fontSize={10}
                    formatter={(v: any) => v.toFixed(0)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        {/* Chart 4: 装机-电能关系图 (双 Y 轴) */}
        <TabsContent value="chart4">
          {chartCard(
            "装机容量与多年平均电能",
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={nyData}
                margin={{ top: 30, right: 50, left: 20, bottom: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10 }}
                  allowDataOverflow={false}
                  label={{
                    value: "N_Y (万kW)",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 10,
                    offset: 12,
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  allowDataOverflow={false}
                  label={{
                    value: "E_avg (亿kW·h)",
                    angle: 90,
                    position: "insideRight",
                    fontSize: 10,
                    offset: 12,
                  }}
                />
                <Tooltip
                  formatter={(value: any, name: any) => {
                    if (name === "装机容量") return [`${Number(value).toFixed(1)} 万kW`, name];
                    if (name === "多年平均电能") return [`${Number(value).toFixed(2)} 亿kW·h`, name];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="N_Y" name="装机容量" barSize={42}>
                  <LabelList
                    dataKey="N_Y"
                    position="top"
                    fontSize={10}
                    formatter={(v: any) => v.toFixed(1)}
                  />
                  {nyData.map((entry) => (
                    <Cell key={entry._key} fill={COLORS[entry._key]} />
                  ))}
                </Bar>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="E_avg"
                  name="多年平均电能"
                  stroke="#8884d8"
                  strokeWidth={2.2}
                  dot={{ r: 4, fill: "#8884d8" }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="E_avg"
                    position="top"
                    fontSize={10}
                    offset={8}
                    formatter={(v: any) => v.toFixed(2)}
                  />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        {/* Chart 5: 方案指标雷达图 */}
        <TabsContent value="chart5">
          {chartCard(
            "方案指标雷达图对比（按方案归一化 0-100）",
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                data={radarData}
                cx="50%"
                cy="50%"
                outerRadius="70%"
                margin={{ top: 16, right: 32, left: 32, bottom: 16 }}
              >
                <PolarGrid strokeDasharray="3 3" stroke="#D1D5DB" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fontSize: 11, fill: "#374151" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fontSize: 9, fill: "#9CA3AF" }}
                  axisLine={false}
                />
                {SCHEME_KEYS.map((sk) => (
                  <Radar
                    key={sk}
                    name={SCHEME_LABELS[sk]}
                    dataKey={sk}
                    stroke={COLORS[sk]}
                    fill={COLORS[sk]}
                    fillOpacity={0.12}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    Number(value).toFixed(1) + " / 100",
                    name,
                  ]}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        {/* Chart 6: 多年平均电能对比 */}
        <TabsContent value="chart6">
          {chartCard(
            "多年平均电能 E_avg 对比 (亿kW·h)",
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={energyBarData}
                margin={{ top: 36, right: 36, left: 20, bottom: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  allowDataOverflow={false}
                  label={{
                    value: "亿kW·h",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 10,
                    offset: 12,
                  }}
                />
                <Tooltip
                  formatter={(value: any) => [
                    `${Number(value).toFixed(2)} 亿kW·h`,
                    "E_avg",
                  ]}
                />
                <Bar
                  dataKey="E_avg"
                  name="多年平均电能"
                  label={{
                    position: "top",
                    fontSize: 11,
                    formatter: (v: any) => Number(v).toFixed(2),
                  }}
                >
                  {energyBarData.map((entry) => (
                    <Cell key={entry._key} fill={COLORS[entry._key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        {/* Chart 7: 装机利用小时数对比 */}
        <TabsContent value="chart7">
          {chartCard(
            "装机利用小时数对比 (h)",
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={energyBarData}
                margin={{ top: 36, right: 36, left: 20, bottom: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  allowDataOverflow={false}
                  label={{
                    value: "h",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 10,
                    offset: 12,
                  }}
                />
                <Tooltip
                  formatter={(value: any) => [
                    `${Number(value).toLocaleString()} h`,
                    "装机利用小时数",
                  ]}
                />
                <Bar
                  dataKey="利用小时数"
                  name="装机利用小时数"
                  label={{
                    position: "top",
                    fontSize: 11,
                    formatter: (v: any) => Number(v).toLocaleString(),
                  }}
                >
                  {energyBarData.map((entry) => (
                    <Cell key={entry._key} fill={COLORS[entry._key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        {/* ---- 多方案对比 (fig_compare_*) ---- */}
        <TabsContent value="compare_dead">
          <CompareChartDeadLevel
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
        </TabsContent>
        <TabsContent value="compare_firm">
          <CompareChartFirmPower
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
        </TabsContent>
        <TabsContent value="compare_energy">
          <CompareChartEnergy
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
        </TabsContent>
        <TabsContent value="compare_inst">
          <CompareChartInstalled
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
        </TabsContent>
        <TabsContent value="compare_z">
          <CompareChartDesignCheck
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
        </TabsContent>
        <TabsContent value="compare_econ">
          <CompareChartEconomic
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
        </TabsContent>
        <TabsContent value="compare_overview">
          <CompareChartOverview
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
        </TabsContent>

        {/* ---- 水库调度图 (防破坏线 + 调度规则) ---- */}
        <TabsContent value="dispatch">
          <DispatchChartsAll
            waterResults={waterResults}
            floodResults={floodResults}
          />
        </TabsContent>

        {/* ---- 调洪过程线 ---- */}
        <TabsContent value="flood_2x2_p5">
          <FloodRouting2x2
            floodResults={floodResults}
            Q_SAFE={ENGINE_Q_SAFE}
            std_key="P5"
          />
        </TabsContent>
        <TabsContent value="flood_2x2_p01">
          <FloodRouting2x2
            floodResults={floodResults}
            Q_SAFE={ENGINE_Q_SAFE}
            std_key="P0_1"
          />
        </TabsContent>
        <TabsContent value="flood_2x2_p001">
          <FloodRouting2x2
            floodResults={floodResults}
            Q_SAFE={ENGINE_Q_SAFE}
            std_key="P0_01"
          />
        </TabsContent>
        <TabsContent value="flood_all_4x3">
          <FloodRoutingAllGrid
            floodResults={floodResults}
            Q_SAFE={ENGINE_Q_SAFE}
          />
        </TabsContent>
      </Tabs>

      {/* 网格总览模式：显示全部 7 张图表 (两列布局) */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4 text-slate-700">
          全部图表一览
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* 水位-库容曲线 — 4 方案 2×2 (跨两列) */}
          <div className="xl:col-span-2 rounded-lg border bg-card p-3 text-card-foreground shadow-sm">
            <div className="text-base font-semibold leading-none tracking-tight mb-2">
              水位-库容曲线 (Z-V Curve) · 4 方案对比
            </div>
            <div className="text-xs text-slate-500 mb-2">
              每方案标注 Z_正（实线）+ Z_死（点划）+ 工作区段（淡色填充 V_死-V_正）。
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {SCHEME_KEYS.map((sk) => {
                const Z_zheng_adj = SCHEMES[sk].Z_zheng + (params.Z_zheng_offset[sk] || 0);
                const Z_dead = waterResults[sk]?.Z_dead;
                const V_zheng = z_to_v(Z_zheng_adj);
                const V_dead = Z_dead !== undefined ? z_to_v(Z_dead) : undefined;
                return (
                  <div key={sk} className="border rounded p-2">
                    <div className="text-xs font-semibold mb-1" style={{ color: COLORS[sk] }}>
                      方案 {sk} · Z_正 {Z_zheng_adj.toFixed(1)} m{Z_dead !== undefined ? ` · Z_死 ${Z_dead.toFixed(1)} m` : ""}
                    </div>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={zvData}
                          margin={{ top: 6, right: 28, left: 4, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis dataKey="V" tick={{ fontSize: 8 }} />
                          <YAxis
                            domain={[40, 150]}
                            allowDataOverflow={false}
                            tick={{ fontSize: 8 }}
                            label={{
                              value: "Z (m)",
                              angle: -90,
                              position: "insideLeft",
                              fontSize: 8,
                            }}
                          />
                          <Tooltip
                            formatter={(value: any) => [value.toFixed(2), ""]}
                            labelFormatter={(v: any) => `V = ${v} 亿m³`}
                          />
                          {V_dead !== undefined && (
                            <ReferenceArea
                              x1={V_dead}
                              x2={V_zheng}
                              y1={40}
                              y2={150}
                              fill={COLORS[sk]}
                              fillOpacity={0.08}
                              stroke="none"
                            />
                          )}
                          <Line
                            type="monotone"
                            dataKey="Z"
                            stroke="#1f77b4"
                            strokeWidth={1.6}
                            dot={false}
                            isAnimationActive={false}
                          />
                          <ReferenceLine
                            y={Z_zheng_adj}
                            stroke={COLORS[sk]}
                            strokeWidth={1.4}
                            label={{
                              value: `Z_正`,
                              position: "insideTopRight",
                              fontSize: 8,
                              fill: COLORS[sk],
                            }}
                          />
                          {Z_dead !== undefined && (
                            <ReferenceLine
                              y={Z_dead}
                              stroke={COLORS[sk]}
                              strokeWidth={1.2}
                              strokeDasharray="6 2 1 2"
                              label={{
                                value: `Z_死`,
                                position: "insideBottomRight",
                                fontSize: 8,
                                fill: COLORS[sk],
                              }}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 下游水位-流量曲线 */}
          <Card>
            <CardHeader>
              <CardTitle>下游水位-流量曲线 (Z-q Curve)</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={zqData}
                  margin={{ top: 24, right: 50, left: 20, bottom: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="Q"
                    label={{ value: "流量 q (m³/s)", position: "insideBottomRight", offset: -5, fontSize: 10 }}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    label={{ value: "下游水位 Z (m)", angle: -90, position: "insideLeft", fontSize: 10, offset: 12 }}
                    tick={{ fontSize: 10 }}
                    allowDataOverflow={false}
                  />
                  <Tooltip
                    formatter={(value: any) => [Number(value).toFixed(2), "Z (m)"]}
                    labelFormatter={(v: any) => `q = ${v} m³/s`}
                  />
                  <Line
                    type="monotone"
                    dataKey="Z"
                    stroke="#2ca02c"
                    strokeWidth={2.2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <ReferenceLine
                    x={params.Q_SAFE}
                    stroke="#d62728"
                    strokeWidth={1.4}
                    strokeDasharray={params.Q_SAFE !== ENGINE_Q_SAFE ? "4 4" : "6 4"}
                    label={{
                      value: `Q_安 = ${params.Q_SAFE} m³/s${params.Q_SAFE !== ENGINE_Q_SAFE ? " (调整)" : ""}`,
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: "#d62728",
                      offset: 6,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 经济对比柱状图 */}
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>经济对比 — 方案 I / II / III / IV (万元)</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={econBarData}
                  margin={{ top: 30, right: 36, left: 20, bottom: 12 }}
                  barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="scheme" tick={{ fontSize: 10 }} />
                  <YAxis
                    label={{ value: "万元", angle: -90, position: "insideLeft", fontSize: 10, offset: 12 }}
                    tick={{ fontSize: 10 }}
                    allowDataOverflow={false}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) => [
                      Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 }) + " 万元",
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="枢纽总投资" fill="#1f77b4" name="枢纽总投资">
                    <LabelList
                      dataKey="枢纽总投资"
                      position="top"
                      fontSize={10}
                      formatter={(v: any) =>
                        Number(v) >= 1e4
                          ? (v / 1e4).toFixed(2) + " 亿"
                          : v.toFixed(0)
                      }
                    />
                  </Bar>
                  <Bar dataKey="年运行费" fill="#ff7f0e" name="年运行费">
                    <LabelList
                      dataKey="年运行费"
                      position="top"
                      fontSize={10}
                      formatter={(v: any) => v.toFixed(0)}
                    />
                  </Bar>
                  <Bar dataKey="年费用" fill="#2ca02c" name="年费用">
                    <LabelList
                      dataKey="年费用"
                      position="top"
                      fontSize={10}
                      formatter={(v: any) => v.toFixed(0)}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 装机-电能关系图 */}
          <Card>
            <CardHeader>
              <CardTitle>装机容量与多年平均电能</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={nyData}
                  margin={{ top: 30, right: 50, left: 20, bottom: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="left"
                    label={{ value: "N_Y (万kW)", angle: -90, position: "insideLeft", fontSize: 10, offset: 12 }}
                    tick={{ fontSize: 10 }}
                    allowDataOverflow={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    label={{ value: "E_avg (亿kW·h)", angle: 90, position: "insideRight", fontSize: 10, offset: 12 }}
                    tick={{ fontSize: 10 }}
                    allowDataOverflow={false}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      if (name === "装机容量") return [`${Number(value).toFixed(1)} 万kW`, name];
                      if (name === "多年平均电能") return [`${Number(value).toFixed(2)} 亿kW·h`, name];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="left" dataKey="N_Y" name="装机容量" barSize={42}>
                    <LabelList
                      dataKey="N_Y"
                      position="top"
                      fontSize={10}
                      formatter={(v: any) => v.toFixed(1)}
                    />
                    {nyData.map((entry) => (
                      <Cell key={entry._key} fill={COLORS[entry._key]} />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="E_avg"
                    name="多年平均电能"
                    stroke="#8884d8"
                    strokeWidth={2.2}
                    dot={{ r: 4, fill: "#8884d8" }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="E_avg"
                      position="top"
                      fontSize={10}
                      offset={8}
                      formatter={(v: any) => v.toFixed(2)}
                    />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 方案指标雷达图 */}
          <Card>
            <CardHeader>
              <CardTitle>方案指标雷达图对比（0-100 归一化）</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  data={radarData}
                  cx="50%"
                  cy="50%"
                  outerRadius="68%"
                >
                  <PolarGrid strokeDasharray="3 3" stroke="#D1D5DB" />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fontSize: 10, fill: "#374151" }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 8, fill: "#9CA3AF" }}
                    axisLine={false}
                  />
                  {SCHEME_KEYS.map((sk) => (
                    <Radar
                      key={sk}
                      name={SCHEME_LABELS[sk]}
                      dataKey={sk}
                      stroke={COLORS[sk]}
                      fill={COLORS[sk]}
                      fillOpacity={0.12}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: any) => [Number(value).toFixed(1) + " / 100", ""]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 多年平均电能对比 */}
          <Card>
            <CardHeader>
              <CardTitle>多年平均电能 E_avg 对比 (亿kW·h)</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={energyBarData}
                  margin={{ top: 32, right: 32, left: 20, bottom: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
                  <YAxis
                    label={{ value: "亿kW·h", angle: -90, position: "insideLeft", fontSize: 10, offset: 12 }}
                    tick={{ fontSize: 10 }}
                    allowDataOverflow={false}
                  />
                  <Tooltip
                    formatter={(value: any) => [
                      `${Number(value).toFixed(2)} 亿kW·h`,
                      "E_avg",
                    ]}
                  />
                  <Bar
                    dataKey="E_avg"
                    name="多年平均电能"
                    label={{
                      position: "top",
                      fontSize: 11,
                      formatter: (v: any) => Number(v).toFixed(2),
                    }}
                  >
                    {energyBarData.map((entry) => (
                      <Cell key={entry._key} fill={COLORS[entry._key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 装机利用小时数对比 */}
          <Card>
            <CardHeader>
              <CardTitle>装机利用小时数对比 (h)</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={energyBarData}
                  margin={{ top: 32, right: 32, left: 20, bottom: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="scheme" tick={{ fontSize: 11 }} />
                  <YAxis
                    label={{ value: "h", angle: -90, position: "insideLeft", fontSize: 10, offset: 12 }}
                    tick={{ fontSize: 10 }}
                    allowDataOverflow={false}
                  />
                  <Tooltip
                    formatter={(value: any) => [
                      `${Number(value).toLocaleString()} h`,
                      "装机利用小时数",
                    ]}
                  />
                  <Bar
                    dataKey="利用小时数"
                    name="装机利用小时数"
                    label={{
                      position: "top",
                      fontSize: 11,
                      formatter: (v: any) => Number(v).toLocaleString(),
                    }}
                  >
                    {energyBarData.map((entry) => (
                      <Cell key={entry._key} fill={COLORS[entry._key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ---- 多方案对比 (fig_compare_*) ---- */}
          <CompareChartDeadLevel
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
          <CompareChartFirmPower
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
          <CompareChartEnergy
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
          <CompareChartInstalled
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
          <CompareChartDesignCheck
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
          <CompareChartEconomic
            waterResults={waterResults}
            floodResults={floodResults}
            econ={econ}
          />
          <div className="xl:col-span-2">
            <CompareChartOverview
              waterResults={waterResults}
              floodResults={floodResults}
              econ={econ}
            />
          </div>

          {/* 调度图 2×2 — 跨两列 */}
          <div className="xl:col-span-2">
            <DispatchChartsAll
              waterResults={waterResults}
              floodResults={floodResults}
            />
          </div>

          {/* 调洪 2×2 — P=5% (fig_flood_routing_compare_2x2) */}
          <div className="xl:col-span-2">
            <FloodRouting2x2
              floodResults={floodResults}
              Q_SAFE={ENGINE_Q_SAFE}
              std_key="P5"
            />
          </div>

          {/* 调洪 2×2 — P=0.1% (设计) */}
          <div className="xl:col-span-2">
            <FloodRouting2x2
              floodResults={floodResults}
              Q_SAFE={ENGINE_Q_SAFE}
              std_key="P0_1"
            />
          </div>

          {/* 调洪 2×2 — P=0.01% (校核) */}
          <div className="xl:col-span-2">
            <FloodRouting2x2
              floodResults={floodResults}
              Q_SAFE={ENGINE_Q_SAFE}
              std_key="P0_01"
            />
          </div>

          {/* 调洪 4×3 全景 (12 张子图) */}
          <div className="xl:col-span-2">
            <FloodRoutingAllGrid
              floodResults={floodResults}
              Q_SAFE={ENGINE_Q_SAFE}
              cellHeight={220}
            />
          </div>
        </div>
      </div>
    </div>
  );
}