"use client";

import { useMemo } from "react";
import {
  computeDeadLevel,
  findNpForScheme,
  calcInstalled,
  find_repeat_capacity,
  build_table,
  load_all_floods,
  flood_routing,
  SCHEMES,
  get_yearly_invest,
  get_yearly_running,
  compute_fangshou_benefit,
  FIRE_FUEL_COST,
  FIRE_OP_FACTOR,
} from "@/lib/engine";
import { useParams } from "./useParams";
import { useDataset } from "./useDataset";

// ── Flood keys ───────────────────────────────────────────
const FLOOD_DOWN_KEY = "P=5% (20年)";
const FLOOD_DESIGN_KEY = "P=0.1% (1000年)";
const FLOOD_CHECK_KEY = "P=0.01% (10000年)";

// ── Local economic helpers (r0-parameterized) ────────────
function localFtoP(r0: number, t: number): number {
  return 1.0 / Math.pow(1 + r0, t);
}

function localCapitalRecoveryFactor(r0: number, n: number): number {
  return (r0 * Math.pow(1 + r0, n)) / (Math.pow(1 + r0, n) - 1);
}

function localPresentValue(
  cashflows: number[] | Record<number, number>,
  r0: number,
): number {
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

function localEconomicCompare(table: any[], r0: number): any[] {
  const I_row = table.find((row) => row.scheme === "I")!;
  const N_bi_I = I_row.N_bi;
  const E_I = I_row.E_avg;
  const Z_zheng_I = I_row.Z_zheng;

  const results: any[] = [];

  for (const row of table) {
    const sk = row.scheme;
    const N_bi = row.N_bi;
    const E_avg = row.E_avg;

    const cf = get_yearly_invest(sk, N_bi, E_avg, N_bi_I, E_I, Z_zheng_I);
    const R = get_yearly_running(sk, N_bi, E_avg);

    const fire_fuel_full =
      FIRE_FUEL_COST * Math.max(0, E_I - E_avg) * 1e8 / 1e4;
    const fire_inv_total = cf.fire.reduce(
      (a: number, b: number) => a + b,
      0,
    );
    const fire_op_full = FIRE_OP_FACTOR * fire_inv_total;

    const B_fang = compute_fangshou_benefit(sk, table);

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

    const pa =
      (Math.pow(1 + r0, 50) - 1) / (r0 * Math.pow(1 + r0, 50));
    const PV_fang = B_fang * pa * localFtoP(r0, 11);
    const annual_run = R.u_hydro + fire_fuel_full + fire_op_full;
    const PV_run = annual_run * pa * localFtoP(r0, 11);
    const fire_repeat = cf.fire.reduce(
      (a: number, b: number) => a + b,
      0,
    );
    const PV_fire_repeat = fire_repeat * localFtoP(r0, 11 + 25);
    const total_PV = PV_build - PV_fang + PV_run + PV_fire_repeat;
    const annual_total = total_PV * localCapitalRecoveryFactor(r0, 50);

    results.push({
      scheme: sk,
      N_bi,
      E_avg,
      PV_build,
      PV_run,
      PV_fang,
      PV_fire_repeat,
      total_PV,
      annual_total,
      B_fang,
      fire_inv: fire_inv_total,
      fire_fuel_full,
      fire_op_full,
      annual_run,
    });
  }

  return results;
}

// ── Route a flood for one scheme with adjustable Z_start ──
function route_flood_with_offset(
  sk: string,
  q_in: Record<string, number[]>,
  q_safe: number,
  Z_offset: number,
) {
  const base_Z_zheng = SCHEMES[sk].Z_zheng;
  const Z_start = base_Z_zheng + Z_offset;

  const r5 = flood_routing(
    sk,
    q_in[FLOOD_DOWN_KEY],
    Z_start,
    q_safe,
    false,
    undefined,
  );
  const r1 = flood_routing(
    sk,
    q_in[FLOOD_DESIGN_KEY],
    Z_start,
    q_safe,
    true,
    undefined,
  );
  const r01 = flood_routing(
    sk,
    q_in[FLOOD_CHECK_KEY],
    Z_start,
    q_safe,
    true,
    undefined,
  );

  return {
    scheme: sk,
    Z_start,
    Z_fangshou_high: r5.Z_max,
    Z_design: r1.Z_max,
    Q_design_max: r1.Q_max,
    Z_check: r01.Z_max,
    Q_check_max: r01.Q_max,
    // 完整时间序列 — 用于绘图（fig_flood_routing_*）
    series: {
      P5:   { Q_in: q_in[FLOOD_DOWN_KEY],   Z: r5.Z_series,   Q_out: r5.Q_out_series,   Z_max: r5.Z_max,   Q_max: r5.Q_max },
      P0_1: { Q_in: q_in[FLOOD_DESIGN_KEY], Z: r1.Z_series,   Q_out: r1.Q_out_series,   Z_max: r1.Z_max,   Q_max: r1.Q_max },
      P0_01:{ Q_in: q_in[FLOOD_CHECK_KEY],  Z: r01.Z_series,  Q_out: r01.Q_out_series,  Z_max: r01.Z_max,  Q_max: r01.Q_max },
    },
  };
}

// ── Main Hook ────────────────────────────────────────────

export function useAllResults() {
  const { params } = useParams();
  const { version: datasetVersion } = useDataset();
  const { Q_SAFE, R0, Z_zheng_offset } = params;

  return useMemo(() => {
    const schemes = ["I", "II", "III", "IV"] as const;
    const waterResults: Record<string, any> = {};
    const floodResults: Record<string, any> = {};
    const econResults: any[] = [];

    const q_in = load_all_floods();

    for (const sk of schemes) {
      const dead = computeDeadLevel(sk);
      const np = findNpForScheme(sk);
      const Np_wan = np.N_p / 1e4;
      const inst = calcInstalled(Np_wan, sk);
      const energy = find_repeat_capacity(
        sk,
        dead.Z_dead,
        Np_wan,
        inst.N_bi,
      );

      // Flood routing with param adjustments
      const zOffset = Z_zheng_offset[sk] || 0;
      const flood = route_flood_with_offset(sk, q_in, Q_SAFE, zOffset);

      waterResults[sk] = {
        Z_dead: dead.Z_dead,
        Z_zheng: SCHEMES[sk].Z_zheng + zOffset,
        V_xing: dead.V_xing,
        Np: np.N_p,
        Np_wan,
        N_bi: inst.N_bi,
        N_chong: energy.N_chong,
        N_Y: energy.N_Y,
        E_avg: energy.E_avg,
        Q_dump_avg: energy.Q_dump_avg,
      };

      floodResults[sk] = {
        Z_fangshou_high: flood.Z_fangshou_high,
        Z_design: flood.Z_design,
        Q_design_max: flood.Q_design_max,
        Z_check: flood.Z_check,
        Q_check_max: flood.Q_check_max,
        // 保留完整调洪过程线，供交互图表页直接绘制。
        series: flood.series,
      };
    }

    // 汇总表
    const table = build_table(waterResults, floodResults);
    // 经济比较 (using parameterized R0)
    const econ = localEconomicCompare(table, R0);

    return { waterResults, floodResults, table, econ, schemes };
  }, [Q_SAFE, R0, Z_zheng_offset, datasetVersion]);
}
