"use client";

import { useState, useMemo } from "react";
import { TrendingDown, TrendingUp, AlertTriangle, Droplets, Percent, Ruler, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAllResults } from "@/hooks/useAllResults";
import {
  run_for_schemes,
  flood_routing,
  load_all_floods,
  SCHEMES,
  Q_SAFE,
  R0,
  wind_wave_height,
  z_to_v,
  get_yearly_invest,
  get_yearly_running,
  compute_fangshou_benefit,
  WIND_V,
  WIND_D,
  SAFETY_1,
  SAFETY_2,
  FIRE_FUEL_COST,
  FIRE_OP_FACTOR,
  FIRE_INV_RATIO,
  MINE_INV_RATIO,
  FIRE_KWH_COST,
  MINE_KWH_COST,
  FIRE_SCALE_CAP,
  FIRE_SCALE_E,
} from "@/lib/engine";
const FLOOD_DOWN_KEY = "P=5% (20年)";
const FLOOD_DESIGN_KEY = "P=0.1% (1000年)";
const FLOOD_CHECK_KEY = "P=0.01% (10000年)";

// ── Constants ───────────────────────────────────────────
const SCHEME_KEYS = ["I", "II", "III", "IV"] as const;

const Q_SAFE_MIN = 15000;
const Q_SAFE_MAX = 25000;
const Q_SAFE_STEP = 1000;

const R0_MIN = 0.05;
const R0_MAX = 0.20;
const R0_STEP = 0.01;

const Z_OFFSETS = [-3, -2, -1, 0, 1, 2, 3] as const;

// ── Types ───────────────────────────────────────────────
interface QSensitivityRow {
  scheme: string;
  Z_check_orig: number;
  Z_dam_orig: number;
  Z_check_new: number;
  Z_dam_new: number;
}

interface R0SensitivityRow {
  scheme: string;
  annual_total_orig: number;
  annual_total_new: number;
}

interface ZSensitivityRow {
  scheme: string;
  Z_zheng_orig: number;
  Z_zheng_new: number;
  Z_check_orig: number;
  Z_check_new: number;
  Z_dam_orig: number;
  Z_dam_new: number;
}

// ── Local economic helpers (r0-parameterized) ────────────
function localFtoP(r0: number, t: number): number {
  return 1.0 / Math.pow(1 + r0, t);
}

function localCapitalRecoveryFactor(r0: number, n: number): number {
  return (r0 * Math.pow(1 + r0, n)) / (Math.pow(1 + r0, n) - 1);
}

function localPresentValue(cashflows: number[] | Record<number, number>, r0: number): number {
  let pv = 0.0;
  if (Array.isArray(cashflows)) {
    for (let i = 0; i < cashflows.length; i++) {
      const amt = cashflows[i];
      if (amt === 0) continue;
      pv += amt * localFtoP(r0, i + 1);
    }
  } else {
    for (const tStr of Object.keys(cashflows)) {
      const t = parseInt(tStr);
      pv += cashflows[t] * localFtoP(r0, t);
    }
  }
  return pv;
}

interface SimpleTableRow {
  scheme: string;
  Z_zheng: number;
  N_bi: number;
  E_avg: number;
  V_fangshou: number;
}

interface SimpleEconResult {
  scheme: string;
  annual_total: number;
}

function localEconomicCompare(table: SimpleTableRow[], r0: number): SimpleEconResult[] {
  const I_row = table.find((r) => r.scheme === "I")!;
  const N_bi_I = I_row.N_bi;
  const E_I = I_row.E_avg;
  const Z_zheng_I = I_row.Z_zheng;

  const results: SimpleEconResult[] = [];

  for (const row of table) {
    const sk = row.scheme;
    const N_bi = row.N_bi;
    const E_avg = row.E_avg;

    const cf = get_yearly_invest(sk, N_bi, E_avg, N_bi_I, E_I, Z_zheng_I);
    const R = get_yearly_running(sk, N_bi, E_avg);

    const fire_fuel_full = FIRE_FUEL_COST * Math.max(0, E_I - E_avg) * 1e8 / 1e4;
    const fire_inv_total = cf.fire.reduce((a: number, b: number) => a + b, 0);
    const fire_op_full = FIRE_OP_FACTOR * fire_inv_total;

    const B_fang = compute_fangshou_benefit(sk, table as any);

    const cashflows: number[] = new Array(11).fill(0.0);
    for (let i = 0; i < 11; i++) {
      cashflows[i] = cf.invest[i] + cf.comp[i] + cf.fire[i] + cf.mine[i];
    }

    const r9 = 0.2 * R.u_hydro;
    const r10 = 0.7 * R.u_hydro;
    const r11 = 0.9 * R.u_hydro;
    const initRun: Record<number, number> = { 9: r9, 10: r10, 11: r11 };
    if (sk !== "I") {
      initRun[9] += 0.2 * fire_fuel_full;
      initRun[10] += 0.7 * fire_fuel_full;
      initRun[11] += 0.9 * fire_fuel_full;
    }
    for (const yr of [9, 10, 11]) {
      cashflows[yr - 1] += initRun[yr];
    }

    const PV_build = localPresentValue(cashflows, r0);

    const pa = (Math.pow(1 + r0, 50) - 1) / (r0 * Math.pow(1 + r0, 50));
    const PV_fang = B_fang * pa * localFtoP(r0, 11);
    const annual_run = R.u_hydro + fire_fuel_full + fire_op_full;
    const PV_run = annual_run * pa * localFtoP(r0, 11);
    const fire_repeat = cf.fire.reduce((a: number, b: number) => a + b, 0);
    const PV_fire_repeat = fire_repeat * localFtoP(r0, 11 + 25);
    const total_PV = PV_build - PV_fang + PV_run + PV_fire_repeat;
    const annual_total = total_PV * localCapitalRecoveryFactor(r0, 50);

    results.push({ scheme: sk, annual_total });
  }

  return results;
}

// ── Helpers ─────────────────────────────────────────────
function fmtFixed(v: number, d: number): string {
  return v.toFixed(d);
}

function calcDamElevation(Z_design: number, Z_check: number): number {
  const dh_design = wind_wave_height(WIND_V, WIND_D);
  const dh_check = wind_wave_height(WIND_V * 0.8, WIND_D);
  return Math.max(Z_design + dh_design + SAFETY_1, Z_check + dh_check + SAFETY_2);
}

function buildSimpleTable(baseline: ReturnType<typeof useAllResults>): SimpleTableRow[] {
  return SCHEME_KEYS.map((sk) => {
    const w = baseline.waterResults[sk];
    const f = baseline.floodResults[sk];
    const s = SCHEMES[sk];
    const V_zheng = z_to_v(s.Z_zheng);
    const V_fang = Math.max(0, z_to_v(f.Z_fangshou_high) - V_zheng);
    return {
      scheme: sk,
      Z_zheng: s.Z_zheng,
      N_bi: w.N_bi,
      E_avg: w.E_avg,
      V_fangshou: V_fang,
    };
  });
}

// ── Component ───────────────────────────────────────────
export function SensitivityPage() {
  const baseline = useAllResults();

  const [qSafe, setQSafe] = useState(Q_SAFE);
  const [r0Val, setR0Val] = useState(R0);
  const [zOffsets, setZOffsets] = useState<Record<string, number>>({
    I: 0, II: 0, III: 0, IV: 0,
  });

  // ── Sensitivity: Q_安 ─────────────────────────────────
  const qSensitivity = useMemo<QSensitivityRow[]>(() => {
    const newFlood = run_for_schemes(undefined, qSafe);
    return SCHEME_KEYS.map((sk) => {
      const orig = baseline.floodResults[sk];
      const nf = newFlood[sk];
      const Z_dam_orig = calcDamElevation(orig.Z_design, orig.Z_check);
      const Z_dam_new = calcDamElevation(nf.Z_design, nf.Z_check);
      return {
        scheme: sk,
        Z_check_orig: orig.Z_check,
        Z_dam_orig,
        Z_check_new: nf.Z_check,
        Z_dam_new,
      };
    });
  }, [baseline, qSafe]);

  // ── Sensitivity: r₀ ───────────────────────────────────
  const r0Sensitivity = useMemo<R0SensitivityRow[]>(() => {
    const simpleTable = buildSimpleTable(baseline);
    const origEcon = localEconomicCompare(simpleTable, R0);
    const newEcon = localEconomicCompare(simpleTable, r0Val);
    return SCHEME_KEYS.map((sk) => {
      const o = origEcon.find((e) => e.scheme === sk)!;
      const n = newEcon.find((e) => e.scheme === sk)!;
      return {
        scheme: sk,
        annual_total_orig: o.annual_total,
        annual_total_new: n.annual_total,
      };
    });
  }, [baseline, r0Val]);

  // ── Sensitivity: Z_zheng ──────────────────────────────
  const zSensitivity = useMemo<ZSensitivityRow[]>(() => {
    const floods = load_all_floods();
    return SCHEME_KEYS.map((sk) => {
      const origZ_zheng = SCHEMES[sk].Z_zheng;
      const newZ_zheng = origZ_zheng + (zOffsets[sk] || 0);
      const orig = baseline.floodResults[sk];

      const r5 = flood_routing(sk, floods[FLOOD_DOWN_KEY], newZ_zheng, qSafe, false, undefined);
      const r1 = flood_routing(sk, floods[FLOOD_DESIGN_KEY], newZ_zheng, qSafe, true, undefined);
      const r01 = flood_routing(sk, floods[FLOOD_CHECK_KEY], newZ_zheng, qSafe, true, undefined);

      const Z_dam_orig = calcDamElevation(orig.Z_design, orig.Z_check);
      const Z_dam_new = calcDamElevation(r1.Z_max, r01.Z_max);

      return {
        scheme: sk,
        Z_zheng_orig: origZ_zheng,
        Z_zheng_new: newZ_zheng,
        Z_check_orig: orig.Z_check,
        Z_check_new: r01.Z_max,
        Z_dam_orig,
        Z_dam_new,
      };
    });
  }, [baseline, zOffsets, qSafe]);

  // ── Helpers for rendering ─────────────────────────────
  function renderDiffCell(orig: number, next: number, unit: string, inverted: boolean = false) {
    const diff = next - orig;
    const isBetter = inverted ? diff < 0 : diff > 0;
    const isWorse = inverted ? diff > 0 : diff < 0;
    const colorClass = isBetter ? "text-[var(--success)]" : isWorse ? "text-[var(--error)]" : "text-[var(--muted)]";
    const Icon = isBetter
      ? (inverted ? TrendingDown : TrendingUp)
      : isWorse
        ? (inverted ? TrendingUp : TrendingDown)
        : null;

    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs text-[var(--muted)]">
          {fmtFixed(orig, 2)} &rarr; <span className="font-semibold text-[var(--text)]">{fmtFixed(next, 2)}</span> {unit}
        </span>
        {diff !== 0 && (
          <span className={cn("text-xs font-medium flex items-center gap-0.5", colorClass)}>
            {Icon && <Icon className="h-3 w-3" />}
            {diff > 0 ? "+" : ""}{fmtFixed(diff, 2)} {unit}
          </span>
        )}
        {diff === 0 && (
          <span className="text-xs text-[var(--muted)]">无变化</span>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display" style={{ color: "var(--text)" }}>
            参数配置工作台
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            调整关键参数后，方案总览、调洪演算、经济比较将自动重算。
            <span style={{ color: "var(--accent)" }}> 受影响的指标 </span>
            会在各页面以紫色标注。
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium uppercase tracking-wider"
          style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
          <SlidersHorizontal className="h-3 w-3" />
          {SCHEME_KEYS.length} 方案 · 3 参数
        </div>
      </div>

      {/* Warning Banner */}
      <div className="flex items-start gap-3 rounded-lg p-4" style={{ backgroundColor: "var(--warning-soft)", border: "1px solid var(--warning)" }}>
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} />
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--warning)" }}>敏感性分析</h3>
          <p className="text-sm mt-0.5" style={{ color: "var(--warning)" }}>
            ⚠️ 敏感性分析仅用于理解参数影响，非正式设计成果。请以原始计算结果为准。
          </p>
        </div>
      </div>

      {/* ── Card 1: Q_安 ────────────────────────────────── */}
      <Card className="border-[var(--border)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Droplets className="h-5 w-5" style={{ color: "var(--accent-color)" }} />
            <CardTitle className="text-[var(--text)] font-display">安全泄量 Q<sub>安</sub> 敏感性</CardTitle>
          </div>
          <CardDescription className="text-[var(--muted)]">
            调整下游安全泄量，观察校核洪水位与坝顶高程的变化。原始值: Q<sub>安</sub> = {Q_SAFE} m³/s
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--muted)]">{Q_SAFE_MIN} m³/s</span>
              <Badge variant="secondary" className="font-mono text-sm px-3 bg-[var(--surface)] text-[var(--text)]">
                {qSafe} m³/s
              </Badge>
              <span className="text-xs text-[var(--muted)]">{Q_SAFE_MAX} m³/s</span>
            </div>
            <input
              type="range"
              min={Q_SAFE_MIN}
              max={Q_SAFE_MAX}
              step={Q_SAFE_STEP}
              value={qSafe}
              onChange={(e) => setQSafe(Number(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ backgroundColor: "var(--surface)", accentColor: "var(--accent-color)" }}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 font-medium text-[var(--muted)]">方案</th>
                  <th className="text-right py-2 font-medium text-[var(--muted)]">校核洪水位 Z<sub>校</sub> (m)</th>
                  <th className="text-right py-2 font-medium text-[var(--muted)]">坝顶高程 Z<sub>坝</sub> (m)</th>
                </tr>
              </thead>
              <tbody>
                {qSensitivity.map((r) => (
                  <tr key={r.scheme} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                    <td className="py-2.5">
                      <Badge variant="outline" className="font-mono border-[var(--border)] text-[var(--text)]">方案 {r.scheme}</Badge>
                    </td>
                    <td className="py-2.5">{renderDiffCell(r.Z_check_orig, r.Z_check_new, "m")}</td>
                    <td className="py-2.5">{renderDiffCell(r.Z_dam_orig, r.Z_dam_new, "m")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 2: r₀ ──────────────────────────────────── */}
      <Card className="border-[var(--border)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Percent className="h-5 w-5" style={{ color: "var(--success)" }} />
            <CardTitle className="text-[var(--text)] font-display">折算率 r<sub>0</sub> 敏感性</CardTitle>
          </div>
          <CardDescription className="text-[var(--muted)]">
            调整经济折算率，观察年费用及方案排序的变化。原始值: r<sub>0</sub> = {(R0 * 100).toFixed(0)}%
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--muted)]">{fmtFixed(R0_MIN, 2)}</span>
              <Badge variant="secondary" className="font-mono text-sm px-3 bg-[var(--surface)] text-[var(--text)]">
                {fmtFixed(r0Val, 2)}
              </Badge>
              <span className="text-xs text-[var(--muted)]">{fmtFixed(R0_MAX, 2)}</span>
            </div>
            <input
              type="range"
              min={R0_MIN}
              max={R0_MAX}
              step={R0_STEP}
              value={r0Val}
              onChange={(e) => setR0Val(Number(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ backgroundColor: "var(--surface)", accentColor: "var(--success)" }}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 font-medium text-[var(--muted)]">方案</th>
                  <th className="text-right py-2 font-medium text-[var(--muted)]">年费用 AC (万元)</th>
                  <th className="text-right py-2 font-medium text-[var(--muted)]">排序变化</th>
                </tr>
              </thead>
              <tbody>
                {r0Sensitivity.map((r, idx) => {
                  const diff = r.annual_total_new - r.annual_total_orig;
                  const colorClass = diff < 0 ? "text-[var(--success)]" : diff > 0 ? "text-[var(--error)]" : "text-[var(--muted)]";
                  const Icon = diff < 0 ? TrendingDown : diff > 0 ? TrendingUp : null;
                  return (
                    <tr key={r.scheme} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                      <td className="py-2.5">
                        <Badge variant="outline" className="font-mono border-[var(--border)] text-[var(--text)]">方案 {r.scheme}</Badge>
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs text-[var(--muted)]">
                            {fmtFixed(r.annual_total_orig, 0)} &rarr;{" "}
                            <span className="font-semibold text-[var(--text)]">{fmtFixed(r.annual_total_new, 0)}</span>{" "}
                            万元
                          </span>
                          {diff !== 0 && (
                            <span className={cn("text-xs font-medium flex items-center gap-0.5", colorClass)}>
                              {Icon && <Icon className="h-3 w-3" />}
                              {diff > 0 ? "+" : ""}{fmtFixed(diff, 0)} 万元
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-xs text-[var(--muted)]">
                        <span className="text-[var(--text)] font-medium">第 {idx + 1} 位</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 3: Z_zheng ─────────────────────────────── */}
      <Card className="border-[var(--border)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Ruler className="h-5 w-5" style={{ color: "var(--accent-color)" }} />
            <CardTitle className="text-[var(--text)] font-display">正常蓄水位 Z<sub>正</sub> 敏感性</CardTitle>
          </div>
          <CardDescription className="text-[var(--muted)]">
            调整各方案的正常蓄水位（±3m），观察校核洪水位与坝顶高程的变化。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SCHEME_KEYS.map((sk) => {
              const origZ = SCHEMES[sk].Z_zheng;
              const curOffset = zOffsets[sk] || 0;
              const newZ = origZ + curOffset;
              return (
                <div key={sk} className="space-y-1.5 rounded-lg border border-[var(--border)] p-3 bg-[var(--surface)]">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="font-mono border-[var(--border)] text-[var(--text)]">方案 {sk}</Badge>
                    <span className="text-xs text-[var(--muted)]">原始: {origZ}m</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-[var(--text)] shrink-0">调整:</label>
                    <select
                      value={curOffset}
                      onChange={(e) =>
                        setZOffsets((prev) => ({ ...prev, [sk]: Number(e.target.value) }))
                      }
                      className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-canvas)] px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 text-[var(--text)]"
                      style={{ "--tw-ring-color": "var(--accent-color)" } as React.CSSProperties}
                    >
                      {Z_OFFSETS.map((o) => (
                        <option key={o} value={o}>
                          {o === 0 ? "0 (不变)" : o > 0 ? `+${o}m → ${origZ + o}m` : `${o}m → ${origZ + o}m`}
                        </option>
                      ))}
                    </select>
                  </div>
                  {curOffset !== 0 && (
                    <p className="text-xs font-medium" style={{ color: "var(--accent-color)" }}>
                      新蓄水位: {newZ} m
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 font-medium text-[var(--muted)]">方案</th>
                  <th className="text-right py-2 font-medium text-[var(--muted)]">正常蓄水位 (m)</th>
                  <th className="text-right py-2 font-medium text-[var(--muted)]">校核洪水位 Z<sub>校</sub> (m)</th>
                  <th className="text-right py-2 font-medium text-[var(--muted)]">坝顶高程 Z<sub>坝</sub> (m)</th>
                </tr>
              </thead>
              <tbody>
                {zSensitivity.map((r) => (
                  <tr key={r.scheme} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                    <td className="py-2.5">
                      <Badge variant="outline" className="font-mono border-[var(--border)] text-[var(--text)]">方案 {r.scheme}</Badge>
                    </td>
                    <td className="py-2.5">
                      {r.Z_zheng_orig !== r.Z_zheng_new ? (
                        <span className="text-xs font-medium" style={{ color: "var(--accent-color)" }}>
                          {r.Z_zheng_orig} &rarr; {r.Z_zheng_new} m
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">{r.Z_zheng_orig} m (不变)</span>
                      )}
                    </td>
                    <td className="py-2.5">{renderDiffCell(r.Z_check_orig, r.Z_check_new, "m")}</td>
                    <td className="py-2.5">{renderDiffCell(r.Z_dam_orig, r.Z_dam_new, "m")}</td>
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