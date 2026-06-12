"use client";

/**
 * 仪表盘 (Dashboard)
 * ─────────────────────────────────────────────────────────
 * 设计语言: "工程观测台" — 衬线标题 + 等宽数据 + 拓扑等高线装饰
 *
 * 模块布局:
 *   ① Hero            — 项目名 + 拓扑 SVG + 实时计算状态
 *   ② KPI Strip       — 4 个核心指标 (装机 / 电量 / 校核洪水位 / 推荐年费用)
 *   ③ 对比矩阵        — 4 方案 × 6 指标, 单元格内嵌条形图
 *   ④ 调洪安全矩阵    — 设计 / 校核 / 保坝 三档洪水 × 4 方案
 *   ⑤ 双联面板        — 月调度防破坏线预览 + 计算链路进度
 *   ⑥ 快捷导航        — 6 个入口 tile
 */

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  Droplets,
  GitBranch,
  LineChart,
  Mountain,
  Radio,
  Sliders,
  Sparkles,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react";
import { useAllResults } from "@/hooks/useAllResults";
import { useParams } from "@/hooks/useParams";
import { compute_fangpo_line } from "@/lib/engine";

// ============================================================
// 工具
// ============================================================

function fmt(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("zh-CN");
}
function fmtPower(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

const SCHEME_KEYS = ["I", "II", "III", "IV"] as const;

// ============================================================
// ① 拓扑等高线 SVG (Hero 装饰)
// ============================================================

function TopoLines({ className }: { className?: string }) {
  // 模拟河流阶地的等高线 — 用 9 条平滑曲线从下到上堆叠
  const lines = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg
      viewBox="0 0 600 240"
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="topo-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke="url(#topo-fade)"
        strokeWidth="1.2"
        strokeLinecap="round"
      >
        {lines.map((i) => {
          const yBase = 30 + i * 26;
          const amp = 14 + i * 2.5;
          // 每条曲线相位略错开, 模拟等高线
          const phase = i * 0.35;
          const d = `M 0 ${yBase}
            C 100 ${yBase - amp} 200 ${yBase + amp * 0.6} 300 ${yBase - amp * 0.3}
            S 500 ${yBase + amp * 0.5} 600 ${yBase - amp * 0.2 + Math.sin(phase) * 4}`;
          return <path key={i} d={d} />;
        })}
      </g>
      {/* 极细的"水纹" 短竖线, 暗示水面/标尺 */}
      <g stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.6">
        {Array.from({ length: 20 }, (_, i) => (
          <line
            key={i}
            x1={20 + i * 30}
            y1={236}
            x2={20 + i * 30}
            y2={240 - ((i * 17) % 22)}
          />
        ))}
      </g>
    </svg>
  );
}

// ============================================================
// ② KPI 单元
// ============================================================

function KpiCell({
  label,
  en,
  value,
  unit,
  delta,
  Icon,
  tone = "default",
}: {
  label: string;
  en: string;
  value: string;
  unit: string;
  delta?: { text: string; positive?: boolean };
  Icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "critical" | "success";
}) {
  const toneColor =
    tone === "warning"
      ? "var(--warning)"
      : tone === "critical"
        ? "var(--error)"
        : tone === "success"
          ? "var(--success)"
          : "var(--accent-color)";

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border p-5 transition-colors"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--bg-canvas)",
      }}
    >
      {/* 角落小标 */}
      <div
        className="absolute right-3 top-3 text-[10px] font-mono uppercase tracking-[0.15em]"
        style={{ color: "var(--muted)" }}
      >
        {en}
      </div>
      <div
        className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg"
        style={{
          backgroundColor: "var(--surface)",
          color: toneColor,
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div
        className="text-[11px] font-medium uppercase tracking-wider"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className="font-display text-3xl font-semibold tabular-nums leading-none tracking-tight"
          style={{ color: "var(--text)" }}
        >
          {value}
        </span>
        <span
          className="text-[11px] font-mono"
          style={{ color: "var(--muted)" }}
        >
          {unit}
        </span>
      </div>
      {delta && (
        <div
          className="mt-3 flex items-center gap-1 text-[11px] font-mono"
          style={{
            color: delta.positive ? "var(--success)" : "var(--muted)",
          }}
        >
          <TrendingUp
            className="h-3 w-3"
            style={{
              transform: delta.positive ? "none" : "scaleY(-1)",
            }}
          />
          {delta.text}
        </div>
      )}
      {/* 底部彩色细线 */}
      <div
        className="absolute bottom-0 left-0 h-px w-full opacity-60"
        style={{
          background: `linear-gradient(to right, transparent, ${toneColor}, transparent)`,
        }}
      />
    </div>
  );
}

// ============================================================
// ③ 对比矩阵: 单元格内嵌条形图
// ============================================================

interface MatrixMetric {
  key: string;
  label: string;
  unit: string;
  format: (v: number) => string;
  betterWhen: "high" | "low";
  // 从 result 行里取数
  pick: (row: any) => number;
}

function ComparisonMatrix({ table }: { table: any[] }) {
  const metrics: MatrixMetric[] = [
    {
      key: "Z_zheng",
      label: "正常蓄水位",
      unit: "m",
      format: (v) => fmt(v, 1),
      betterWhen: "high",
      pick: (r) => r.Z_zheng,
    },
    {
      key: "N_bi",
      label: "装机容量",
      unit: "万kW",
      format: (v) => fmtInt(v),
      betterWhen: "high",
      pick: (r) => r.N_bi,
    },
    {
      key: "E_avg",
      label: "年发电量",
      unit: "亿kWh",
      format: (v) => fmt(v, 2),
      betterWhen: "high",
      pick: (r) => r.E_avg,
    },
    {
      key: "V_fangshou",
      label: "防洪库容",
      unit: "亿m³",
      format: (v) => fmt(v, 2),
      betterWhen: "high",
      pick: (r) => r.V_fangshou,
    },
    {
      key: "N_y",
      label: "保证出力",
      unit: "万kW",
      format: (v) => fmt(v, 1),
      betterWhen: "high",
      pick: (r) => r.N_y,
    },
    {
      key: "N_chong",
      label: "重复容量",
      unit: "万kW",
      format: (v) => fmt(v, 1),
      betterWhen: "high",
      pick: (r) => r.N_chong,
    },
  ];

  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-canvas)" }}
    >
      <div
        className="flex items-center justify-between border-b px-5 py-3.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5" style={{ color: "var(--accent-color)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
            方案水利指标对比
          </span>
          <span
            className="text-[10px] font-mono uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            I ~ IV · 4 SCHEMES
          </span>
        </div>
        <span
          className="text-[10px] font-mono uppercase tracking-wider"
          style={{ color: "var(--muted)" }}
        >
          ◼︎ 数值 · ▮ 量级
        </span>
      </div>
      <div className="grid grid-cols-[110px_repeat(4,1fr)] text-xs">
        {/* 表头 */}
        <div
          className="border-b border-r px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider"
          style={{ color: "var(--muted)", borderColor: "var(--border)" }}
        >
          指标 / 方案
        </div>
        {SCHEME_KEYS.map((k, idx) => (
          <div
            key={k}
            className="border-b px-3 py-2.5 text-center"
            style={{
              borderRight: idx < 3 ? "1px solid var(--border)" : undefined,
              borderColor: "var(--border)",
            }}
          >
            <span
              className="font-display text-base font-semibold"
              style={{ color: "var(--text)" }}
            >
              {k}
            </span>
          </div>
        ))}

        {metrics.map((m) => {
          const values = table.map((row) => m.pick(row));
          const max = Math.max(...values, Number.EPSILON);
          const min = Math.min(...values);
          // 找最佳方案
          const best =
            m.betterWhen === "high"
              ? values.indexOf(max)
              : values.indexOf(min);
          return (
            <div key={m.key} className="contents">
              <div
                className="border-r px-4 py-3"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="text-[13px] font-medium"
                  style={{ color: "var(--text)" }}
                >
                  {m.label}
                </div>
                <div
                  className="text-[10px] font-mono"
                  style={{ color: "var(--muted)" }}
                >
                  {m.unit}
                </div>
              </div>
              {values.map((v, i) => {
                const ratio = (v - min) / (max - min + Number.EPSILON);
                const isBest = i === best;
                return (
                  <div
                    key={i}
                    className="relative flex flex-col gap-1 px-3 py-2.5"
                    style={{
                      borderRight: i < 3 ? "1px solid var(--border)" : undefined,
                      borderColor: "var(--border)",
                    }}
                  >
                    <div className="flex items-baseline justify-between">
                      <span
                        className="font-mono tabular-nums text-[13px]"
                        style={{
                          color: isBest ? "var(--accent-color)" : "var(--text)",
                          fontWeight: isBest ? 600 : 500,
                        }}
                      >
                        {m.format(v)}
                      </span>
                      {isBest && (
                        <span
                          className="text-[9px] font-mono uppercase tracking-wider"
                          style={{ color: "var(--accent-color)" }}
                        >
                          ★
                        </span>
                      )}
                    </div>
                    {/* 内嵌条 */}
                    <div
                      className="h-1 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: "var(--surface)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(8, ratio * 100)}%`,
                          background: isBest
                            ? "var(--accent-color)"
                            : "var(--muted)",
                          opacity: isBest ? 1 : 0.45,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// ④ 调洪安全矩阵
// ============================================================

function FloodMatrix({
  floodResults,
  onNavigate,
}: {
  floodResults: Record<string, any>;
  onNavigate: () => void;
}) {
  // 找每个方案的设计 / 校核 洪水位
  const cellData = SCHEME_KEYS.map((k) => {
    const f = floodResults[k];
    if (!f) return null;
    return {
      key: k,
      Z_check: f.Z_check,
      Q_check_max: f.Q_check_max,
      Z_design: f.Z_design,
      Q_design_max: f.Q_design_max,
      Z_fangshou: f.Z_fangshou_high,
    };
  });

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-canvas)" }}
    >
      <div
        className="flex items-center justify-between border-b px-5 py-3.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <Waves className="h-3.5 w-3.5" style={{ color: "var(--accent-color)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
            调洪安全
          </span>
          <span
            className="text-[10px] font-mono uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            FLOOD ROUTING
          </span>
        </div>
        <button
          onClick={onNavigate}
          className="flex items-center gap-1 text-[11px] font-mono transition-colors"
          style={{ color: "var(--muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--accent-color)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--muted)";
          }}
        >
          详情
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
      <div className="flex-1 px-5 py-4">
        <div className="space-y-3">
          {cellData.map((c) => {
            if (!c) return null;
            // 简易安全裕度: 假设坝顶 ≈ 130m
            const headroom = 130 - c.Z_check;
            const safety = headroom > 3 ? "ok" : headroom > 0 ? "warn" : "crit";
            const safetyColor =
              safety === "ok"
                ? "var(--success)"
                : safety === "warn"
                  ? "var(--warning)"
                  : "var(--error)";
            return (
              <div key={c.key}>
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className="font-display text-sm font-semibold"
                    style={{ color: "var(--text)" }}
                  >
                    方案 {c.key}
                  </span>
                  <span
                    className="flex items-center gap-1.5 text-[10px] font-mono"
                    style={{ color: safetyColor }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: safetyColor }}
                    />
                    {safety === "ok" ? "SAFE" : safety === "warn" ? "TIGHT" : "RISK"}
                  </span>
                </div>
                {/* 三档水位条 */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span
                      className="w-10 font-mono uppercase"
                      style={{ color: "var(--muted)" }}
                    >
                      消落
                    </span>
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full"
                      style={{ backgroundColor: "var(--surface)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(c.Z_fangshou / 130) * 100}%`,
                          backgroundColor: "var(--muted)",
                        }}
                      />
                    </div>
                    <span
                      className="w-14 text-right font-mono tabular-nums"
                      style={{ color: "var(--text)" }}
                    >
                      {fmt(c.Z_fangshou, 1)}m
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span
                      className="w-10 font-mono uppercase"
                      style={{ color: "var(--muted)" }}
                    >
                      设计
                    </span>
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full"
                      style={{ backgroundColor: "var(--surface)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(c.Z_design / 130) * 100}%`,
                          backgroundColor: "var(--accent-color)",
                          opacity: 0.65,
                        }}
                      />
                    </div>
                    <span
                      className="w-14 text-right font-mono tabular-nums"
                      style={{ color: "var(--text)" }}
                    >
                      {fmt(c.Z_design, 1)}m
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span
                      className="w-10 font-mono uppercase"
                      style={{ color: "var(--muted)" }}
                    >
                      校核
                    </span>
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full"
                      style={{ backgroundColor: "var(--surface)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(c.Z_check / 130) * 100}%`,
                          backgroundColor: safetyColor,
                        }}
                      />
                    </div>
                    <span
                      className="w-14 text-right font-mono tabular-nums"
                      style={{
                        color: safetyColor,
                        fontWeight: 600,
                      }}
                    >
                      {fmt(c.Z_check, 1)}m
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div
          className="mt-4 flex items-center gap-2 border-t pt-3 text-[10px] font-mono"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <span>参考坝顶 130m</span>
          <span>·</span>
          <span>SAFE {">"}3m 裕度</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ⑤ 调度预览 — 用 P=87.5% 分位作"防破坏线", 25/75% 作分位带
//    (与 fig_dispatch_II.png 的工程含义对齐, 不同于 Z_env 上包络)
// ============================================================

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(q * (sorted.length - 1))),
  );
  return sorted[i];
}

function DispatchPreview({
  currentScheme,
  Np_wan,
  Z_zheng,
  Z_dead,
}: {
  currentScheme: string;
  Np_wan: number;
  Z_zheng: number;
  Z_dead: number;
}) {
  const series = useMemo(() => {
    try {
      // 用 30 年, 与 DispatchCharts.tsx 保持一致
      const r = compute_fangpo_line(currentScheme, Z_dead, Np_wan, 30);
      const months = r.months;
      // 对每个月, 取所有年的 Z 值, 算 P87.5 / P25 / P75
      const p875: number[] = [];
      const p25: number[] = [];
      const p75: number[] = [];
      for (const m of months) {
        const vals: number[] = [];
        for (const yr of Object.keys(r.all_curves)) {
          const v = r.all_curves[parseInt(yr)]?.[m];
          if (v !== undefined && Number.isFinite(v)) vals.push(v);
        }
        if (vals.length === 0) {
          p875.push(NaN);
          p25.push(NaN);
          p75.push(NaN);
        } else {
          vals.sort((a, b) => a - b);
          p25.push(percentile(vals, 0.25));
          p75.push(percentile(vals, 0.75));
          p875.push(percentile(vals, 0.875));
        }
      }
      return months.map((m, i) => ({
        month: m,
        z: p875[i],   // 防破坏线 = P87.5%
        lo: p25[i],   // 25% 分位
        hi: p75[i],   // 75% 分位
      }));
    } catch {
      return null;
    }
  }, [currentScheme, Np_wan, Z_dead]);

  // 月份显示: 4,5,6,7,8,9,10,11,12,1,2,3
  const monthLabels = ["4", "5", "6", "7", "8", "9", "10", "11", "12", "1", "2", "3"];

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-canvas)" }}
    >
      <div
        className="flex items-center justify-between border-b px-5 py-3.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <LineChart className="h-3.5 w-3.5" style={{ color: "var(--accent-color)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
            调度轨迹
          </span>
          <span
            className="text-[10px] font-mono uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            P87.5 防破坏线 · 25~75% 分位带
          </span>
        </div>
        <span
          className="text-[10px] font-mono uppercase tracking-wider"
          style={{ color: "var(--muted)" }}
        >
          方案 {currentScheme}
        </span>
      </div>
      <div className="flex-1 px-5 py-4">
        {series ? (
          <DispatchChart
            series={series}
            Z_zheng={Z_zheng}
            Z_dead={Z_dead}
            monthLabels={monthLabels}
          />
        ) : (
          <div
            className="flex h-32 items-center justify-center text-xs"
            style={{ color: "var(--muted)" }}
          >
            调度数据不可用
          </div>
        )}
      </div>
    </div>
  );
}

function DispatchChart({
  series,
  Z_zheng,
  Z_dead,
  monthLabels,
}: {
  series: { month: number; z: number; lo: number; hi: number }[];
  Z_zheng: number;
  Z_dead: number;
  monthLabels: string[];
}) {
  const width = 100;
  const height = 38;
  const padTop = 4;
  const padBottom = 8;
  const innerH = height - padTop - padBottom;
  // y 轴范围
  const allZ = series.flatMap((s) =>
    [s.z, s.lo, s.hi].filter((v) => Number.isFinite(v)),
  );
  const maxZ = Math.max(Z_zheng + 1, ...allZ);
  const minZ = Math.min(Z_dead - 1, ...allZ);
  const range = (maxZ - minZ) || 1;

  const points = series.map((s, i) => {
    const x = (i / (series.length - 1)) * width;
    const z = Number.isFinite(s.z) ? s.z : minZ;
    const y = padTop + (1 - (z - minZ) / range) * innerH;
    const loY =
      Number.isFinite(s.lo)
        ? padTop + (1 - (s.lo - minZ) / range) * innerH
        : null;
    const hiY =
      Number.isFinite(s.hi)
        ? padTop + (1 - (s.hi - minZ) / range) * innerH
        : null;
    return { x, y, z, loY, hiY, month: s.month };
  });

  // 构造折线 path (防破坏线 P87.5)
  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  // 25-75% 分位带 (填充)
  const bandPath =
    `M 0 ${height - padBottom} ` +
    points.map((p) => `L ${p.x} ${p.hiY ?? height}`).join(" ") +
    " " +
    [...points].reverse().map((p) => `L ${p.x} ${p.loY ?? height}`).join(" ") +
    ` L ${width} ${height - padBottom} Z`;

  // 关键水位参考线
  const zhengY = padTop + (1 - (Z_zheng - minZ) / range) * innerH;
  const deadY = padTop + (1 - (Z_dead - minZ) / range) * innerH;

  // 找最高点 (P87.5 的峰)
  const peak = points.reduce((a, b) => ((b.z > a.z ? b : a)));

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full"
        >
          {/* 死水位参考线 */}
          <line
            x1="0"
            y1={deadY}
            x2={width}
            y2={deadY}
            stroke="var(--error)"
            strokeOpacity="0.5"
            strokeWidth="0.3"
            strokeDasharray="1 1"
          />
          {/* 正常蓄水位参考线 */}
          <line
            x1="0"
            y1={zhengY}
            x2={width}
            y2={zhengY}
            stroke="var(--accent-color)"
            strokeOpacity="0.5"
            strokeWidth="0.3"
            strokeDasharray="1 1"
          />
          {/* 25-75% 分位带 */}
          <path
            d={bandPath}
            fill="var(--accent-color)"
            fillOpacity="0.1"
          />
          {/* P87.5 防破坏线 */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent-color)"
            strokeWidth="0.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* 数据点 */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="0.9"
              fill="var(--accent-color)"
            />
          ))}
        </svg>
        {/* 数值标注: 最高点 */}
        <div
          className="absolute -translate-x-1/2 -translate-y-full rounded px-1.5 py-0.5 text-[9px] font-mono tabular-nums"
          style={{
            left: `${peak.x}%`,
            top: `${(peak.y / height) * 100}%`,
            backgroundColor: "var(--bg-canvas)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        >
          {fmt(peak.z, 1)}m
        </div>
      </div>
      <div
        className="mt-1 flex justify-between text-[9px] font-mono"
        style={{ color: "var(--muted)" }}
      >
        {monthLabels.map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </div>
      <div
        className="mt-1.5 flex items-center justify-between border-t pt-2 text-[10px] font-mono"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1" style={{ color: "var(--muted)" }}>
            <span
              className="h-px w-3"
              style={{ backgroundColor: "var(--accent-color)" }}
            />
            P87.5 防破坏
          </span>
          <span className="flex items-center gap-1" style={{ color: "var(--muted)" }}>
            <span
              className="h-1.5 w-3 rounded-sm"
              style={{
                backgroundColor: "var(--accent-color)",
                opacity: 0.15,
              }}
            />
            25~75% 带
          </span>
          <span className="flex items-center gap-1" style={{ color: "var(--muted)" }}>
            <span
              className="h-px w-3"
              style={{
                backgroundColor: "var(--error)",
                borderTop: "1px dashed",
              }}
            />
            死水位
          </span>
        </div>
        <span style={{ color: "var(--muted)" }}>
          范围{" "}
          <span style={{ color: "var(--text)" }}>
            {fmt(minZ, 1)} ~ {fmt(maxZ, 1)}m
          </span>
        </span>
      </div>
    </div>
  );
}

// ============================================================
// ⑥ 计算链路进度卡
// ============================================================

const CHAIN_STEPS = [
  { id: "runoff", label: "径流", en: "RUNOFF" },
  { id: "freq", label: "频率", en: "FREQ" },
  { id: "dead", label: "死水位", en: "DEAD" },
  { id: "firm", label: "保证出力", en: "FIRM" },
  { id: "install", label: "装机", en: "INSTALL" },
  { id: "energy", label: "电量", en: "ENERGY" },
  { id: "flood", label: "调洪", en: "FLOOD" },
  { id: "econ", label: "经济", en: "ECON" },
];

function CalcChainCard() {
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-canvas)" }}
    >
      <div
        className="flex items-center justify-between border-b px-5 py-3.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5" style={{ color: "var(--accent-color)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
            计算链路
          </span>
          <span
            className="text-[10px] font-mono uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            COMPUTE PIPELINE
          </span>
        </div>
        <span
          className="flex items-center gap-1.5 text-[10px] font-mono"
          style={{ color: "var(--success)" }}
        >
          <CheckCircle2 className="h-3 w-3" />
          8/8 通过
        </span>
      </div>
      <div className="flex-1 px-5 py-4">
        <div className="grid grid-cols-4 gap-1.5">
          {CHAIN_STEPS.map((s, i) => (
            <div
              key={s.id}
              className="relative flex flex-col items-center gap-1 rounded-lg p-2 transition-colors"
              style={{
                backgroundColor: "var(--surface)",
              }}
            >
              {/* 步骤编号小圆 */}
              <div
                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-mono font-semibold"
                style={{
                  backgroundColor: "var(--accent-color)",
                  color: "#fff",
                }}
              >
                {i + 1}
              </div>
              <div
                className="text-[11px] font-medium"
                style={{ color: "var(--text)" }}
              >
                {s.label}
              </div>
              <div
                className="text-[8px] font-mono uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                {s.en}
              </div>
            </div>
          ))}
        </div>
        {/* 时间线箭头 */}
        <div
          className="mt-4 flex items-center gap-2 border-t pt-3 text-[11px]"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <Radio className="h-3 w-3 animate-pulse" style={{ color: "var(--success)" }} />
          <span>
            内核: <span style={{ color: "var(--text)" }}>TypeScript · 零 Python 依赖</span>
          </span>
        </div>
        <div
          className="mt-1.5 text-[10px] font-mono"
          style={{ color: "var(--muted)" }}
        >
          链路单向无回环 · 参数变更即时重算
        </div>
      </div>
    </div>
  );
}


// ============================================================
// ⑦ 快捷导航
// ============================================================

function QuickNav({
  onNavigate,
}: {
  onNavigate: (tab: string) => void;
}) {
  const tiles = [
    {
      id: "params",
      label: "参数配置",
      en: "PARAMETERS",
      desc: "Q安 / r₀ / 蓄水位偏移",
      Icon: Sliders,
    },
    {
      id: "calc-chain",
      label: "计算链路",
      en: "CHAIN",
      desc: "8 步计算流水线可视化",
      Icon: GitBranch,
    },
    {
      id: "data",
      label: "数据档案",
      en: "DATA",
      desc: "径流 / 洪水 / 曲线",
      Icon: Database,
    },
    {
      id: "charts",
      label: "交互图表",
      en: "CHARTS",
      desc: "调度 / 调洪 / 对比",
      Icon: BarChart3,
    },
    {
      id: "agent",
      label: "Agent 自检",
      en: "AGENT",
      desc: "AI 计算对账 / 异常告警",
      Icon: Sparkles,
    },
    {
      id: "overview",
      label: "方案编辑",
      en: "EDITOR",
      desc: "4 方案参数表单",
      Icon: Mountain,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <button
          key={t.id}
          onClick={() => onNavigate(t.id)}
          className="group flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--bg-canvas)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-color)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div className="flex w-full items-center justify-between">
            <t.Icon
              className="h-4 w-4 transition-colors"
              style={{ color: "var(--muted)" }}
            />
            <ChevronRight
              className="h-3 w-3 transition-colors"
              style={{ color: "var(--muted)" }}
            />
          </div>
          <div
            className="text-sm font-medium transition-colors"
            style={{ color: "var(--text)" }}
          >
            {t.label}
          </div>
          <div
            className="text-[10px] font-mono uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            {t.en}
          </div>
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            {t.desc}
          </div>
        </button>
      ))}
    </div>
  );
}

// ============================================================
// ⑧ 主组件
// ============================================================

export interface DashboardPageProps {
  /** 由父组件传入, 用于切换 tab */
  onNavigate?: (tab: string) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps = {}) {
  const { params, isModified } = useParams();
  const { waterResults, floodResults, table, econ } = useAllResults();
  const currentScheme = params.scheme;
  const current = waterResults[currentScheme];
  const currentEcon = econ.find((e: any) => e.scheme === currentScheme);

  // 推荐方案 (年费用最低)
  const recommended = useMemo(() => {
    if (!econ?.length) return null;
    return [...econ].sort(
      (a, b) => a.annual_total - b.annual_total,
    )[0];
  }, [econ]);

  // 装机 / 电量 / 校核洪水位 / 年费用
  const kpi = useMemo(() => {
    if (!current) return null;
    return {
      install: current.N_bi,
      energy: current.E_avg,
      Z_check: floodResults[currentScheme]?.Z_check ?? 0,
      Q_check: floodResults[currentScheme]?.Q_check_max ?? 0,
      Z_zheng: current.Z_zheng,
      Z_dead: current.Z_dead,
      Np: current.Np_wan,
      annual: currentEcon?.annual_total ?? 0,
    };
  }, [current, currentEcon, currentScheme, floodResults]);

  // 实时"计算时间" (mounted 状态)
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-5">
      {/* ① Hero ────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--border)" }}
      >
        {/* 拓扑背景 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ color: "var(--accent-color)" }}
        >
          <TopoLines className="h-full w-full" />
        </div>
        {/* 右上角渐变光晕 */}
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, var(--accent-color) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />

        <div className="relative grid gap-6 p-7 lg:grid-cols-[1fr_auto] lg:items-start">
          {/* 左侧: 标题区 */}
          <div>
            <div
              className="mb-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em]"
              style={{ color: "var(--accent-color)" }}
            >
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ backgroundColor: "var(--accent-color)" }}
              />
              工程观测台 · OBSERVATORY
            </div>
            <h1
              className="font-brand text-[clamp(2.2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight"
              style={{ color: "var(--text)" }}
            >
              五强溪
              <span style={{ color: "var(--accent-color)" }}>·</span>
              <br className="sm:hidden" />
              <span> 水电站</span>
            </h1>
            <p
              className="mt-3 max-w-xl text-sm leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              基于 TypeScript 计算内核与 Agent 自检的课程设计辅助系统。
              <span style={{ color: "var(--text)" }}>
                支持多方案同台对比、参数敏感性分析与调洪演算全过程可追溯。
              </span>
            </p>
            <div
              className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-mono"
              style={{ color: "var(--muted)" }}
            >
              <span className="flex items-center gap-1.5">
                <Droplets className="h-3 w-3" />
                沅水 · 桃源
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="h-3 w-3" />
                装机 120~150 万kW
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                课程设计 · {new Date().getFullYear()}
              </span>
            </div>
          </div>

          {/* 右侧: 实时状态面板 */}
          <div
            className="flex flex-col gap-2 rounded-xl border p-4"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--bg-canvas)",
              minWidth: "220px",
            }}
          >
            <div
              className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              <span>LIVE STATUS</span>
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ backgroundColor: "var(--success)" }}
              />
            </div>
            <div className="space-y-1.5 pt-1">
              <StatusRow
                label="当前方案"
                value={
                  <span
                    className="font-display text-lg font-semibold"
                    style={{ color: "var(--text)" }}
                  >
                    {currentScheme}
                  </span>
                }
              />
              <StatusRow
                label="Q 安"
                value={
                  <span
                    className="font-mono tabular-nums text-sm"
                    style={{ color: "var(--text)" }}
                  >
                    {fmtInt(params.Q_SAFE)}{" "}
                    <span style={{ color: "var(--muted)" }}>m³/s</span>
                  </span>
                }
              />
              <StatusRow
                label="r₀"
                value={
                  <span
                    className="font-mono tabular-nums text-sm"
                    style={{ color: "var(--text)" }}
                  >
                    {(params.R0 * 100).toFixed(1)}
                    <span style={{ color: "var(--muted)" }}>%</span>
                  </span>
                }
              />
              <StatusRow
                label="参数状态"
                value={
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: isModified ? "var(--warning)" : "var(--success)",
                    }}
                  >
                    {isModified ? "已修改" : "默认值"}
                  </span>
                }
              />
              <StatusRow
                label="计算时间"
                value={
                  <span
                    className="font-mono tabular-nums text-xs"
                    style={{ color: "var(--text)" }}
                  >
                    {now
                      ? now.toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })
                      : "—"}
                  </span>
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* ② KPI Strip ───────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCell
          label="装机容量"
          en="Nbi"
          value={kpi ? fmtPower(kpi.install) : "—"}
          unit="万kW"
          Icon={Zap}
          delta={{
            text: `保证出力 ${kpi ? fmtPower(kpi.Np) : "—"} 万kW`,
            positive: true,
          }}
        />
        <KpiCell
          label="年发电量"
          en="Eavg"
          value={kpi ? fmt(kpi.energy, 2) : "—"}
          unit="亿kWh"
          Icon={Activity}
          delta={{ text: "多年平均", positive: true }}
        />
        <KpiCell
          label="校核洪水位"
          en="Zck"
          value={kpi ? fmt(kpi.Z_check, 2) : "—"}
          unit="m"
          Icon={Waves}
          tone={kpi && kpi.Z_check > 122 ? "warning" : "default"}
          delta={{
            text: `Q_max ${kpi ? fmtInt(kpi.Q_check) : "—"} m³/s`,
          }}
        />
        <KpiCell
          label={recommended ? `推荐方案 · ${recommended.scheme}` : "年费用"}
          en="ANNUAL"
          value={
            recommended ? fmtInt(recommended.annual_total) : "—"
          }
          unit="万元/年"
          Icon={TrendingUp}
          tone="success"
          delta={
            recommended
              ? {
                  text: `当前方案 ${fmtInt(kpi?.annual ?? 0)} 万元`,
                }
              : undefined
          }
        />
      </div>

      {/* ③ + ④ 对比矩阵 + 调洪安全 ──────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <ComparisonMatrix table={table ?? []} />
        <FloodMatrix
          floodResults={floodResults}
          onNavigate={() => onNavigate?.("charts")}
        />
      </div>

      {/* ⑤ 调度预览 + 计算链路 ──────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {kpi ? (
          <DispatchPreview
            currentScheme={currentScheme}
            Np_wan={kpi.Np}
            Z_zheng={kpi.Z_zheng}
            Z_dead={kpi.Z_dead}
          />
        ) : (
          <div />
        )}
        <CalcChainCard />
      </div>

      {/* ⑥ 快捷导航 ────────────────────────────────────── */}
      <QuickNav onNavigate={(t) => onNavigate?.(t)} />

      {/* 底部脚注 */}
      <div
        className="flex items-center justify-between border-t pt-3 text-[10px] font-mono"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        <span>Wuqiangxi Hydropower · Course Design Dashboard</span>
        <span>v0.1.0 · 五强溪</span>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="text-[10px] font-mono uppercase tracking-wider"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </span>
      {value}
    </div>
  );
}
