/**
 * Agent 数据层 — Server 端计算
 *
 * 与 useAllResults 行为一致, 但纯函数, 可在 Next.js Route Handler 中直接调用.
 * 不依赖 React hooks / window.
 */

import {
  computeDeadLevel,
  findNpForScheme,
  calcInstalled,
  find_repeat_capacity,
  load_all_floods,
  flood_routing,
  build_table,
  SCHEMES,
  Q_SAFE as ENGINE_Q_SAFE,
  R0 as ENGINE_R0,
  FIRE_FUEL_COST,
  FIRE_OP_FACTOR,
  get_yearly_invest,
  get_yearly_running,
  compute_fangshou_benefit,
} from "@/lib/engine";

import type {
  AgentParams,
  SchemeFullResult,
  SchemeKey,
} from "./types";

const FLOOD_DOWN_KEY = "P=5% (20年)";
const FLOOD_DESIGN_KEY = "P=0.1% (1000年)";
const FLOOD_CHECK_KEY = "P=0.01% (10000年)";

const SCHEMES_ORDER: SchemeKey[] = ["I", "II", "III", "IV"];

// ── 本地经济 helper (与 useAllResults 一致, 支持 R0 形参) ──

function f_to_p(r0: number, t: number): number {
  return 1.0 / Math.pow(1 + r0, t);
}

function capital_recovery_factor(r0: number, n: number): number {
  return (r0 * Math.pow(1 + r0, n)) / (Math.pow(1 + r0, n) - 1);
}

interface EconRowLocal {
  scheme: string;
  N_bi: number;
  E_avg: number;
  Z_zheng: number;
  V_fangshou: number;
  annual_total: number;
  PV_build: number;
  PV_fang: number;
  PV_run: number;
  B_fang: number;
  annual_run: number;
  fire_inv: number;
  fire_fuel_full: number;
  fire_op_full: number;
}

function localEconomicCompare(
  table: Array<{ scheme: string; N_bi: number; E_avg: number; Z_zheng: number; V_fangshou: number }>,
  r0: number,
): EconRowLocal[] {
  const I_row = table.find((r) => r.scheme === "I")!;
  const N_bi_I = I_row.N_bi;
  const E_I = I_row.E_avg;
  const Z_zheng_I = I_row.Z_zheng;

  const results: EconRowLocal[] = [];

  for (const row of table) {
    const sk = row.scheme;
    const N_bi = row.N_bi;
    const E_avg = row.E_avg;

    const cf = get_yearly_invest(sk, N_bi, E_avg, N_bi_I, E_I, Z_zheng_I);
    const R = get_yearly_running(sk, N_bi, E_avg);

    const fire_fuel_full = FIRE_FUEL_COST * Math.max(0, E_I - E_avg) * 1e8 / 1e4;
    const fire_inv_total = cf.fire.reduce((a, b) => a + b, 0);
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

    const PV_build =
      cashflows.reduce((acc, amt, i) => acc + amt * f_to_p(r0, i + 1), 0);

    const pa = (Math.pow(1 + r0, 50) - 1) / (r0 * Math.pow(1 + r0, 50));
    const PV_fang = B_fang * pa * f_to_p(r0, 11);
    const annual_run = R.u_hydro + fire_fuel_full + fire_op_full;
    const PV_run = annual_run * pa * f_to_p(r0, 11);
    const fire_repeat = cf.fire.reduce((a, b) => a + b, 0);
    const PV_fire_repeat = fire_repeat * f_to_p(r0, 11 + 25);
    const total_PV = PV_build - PV_fang + PV_run + PV_fire_repeat;
    const annual_total = total_PV * capital_recovery_factor(r0, 50);

    results.push({
      scheme: sk,
      N_bi,
      E_avg,
      Z_zheng: row.Z_zheng,
      V_fangshou: row.V_fangshou,
      PV_build,
      PV_fang,
      PV_run,
      B_fang,
      annual_total,
      annual_run,
      fire_inv: fire_inv_total,
      fire_fuel_full,
      fire_op_full,
    });
  }
  return results;
}

// ── 主入口 ──

export interface ComputeInput {
  Q_SAFE?: number;
  R0?: number;
  Z_zheng_offset?: Partial<Record<SchemeKey, number>>;
}

export interface ComputeOutput {
  schemes: SchemeFullResult[];
  economic: Array<{
    scheme: string;
    annual_total: number;
    PV_build: number;
    PV_fang: number;
    PV_run: number;
    B_fang: number;
    annual_run: number;
    fire_inv: number;
    fire_fuel_full: number;
    fire_op_full: number;
  }>;
  recommended: SchemeKey;
  params: AgentParams;
}

/**
 * 跑一次完整 4 方案计算. 浏览器端 useAllResults 与 server 路由都调它.
 */
export function runCompute(input: ComputeInput = {}): ComputeOutput {
  const Q_SAFE = input.Q_SAFE ?? ENGINE_Q_SAFE;
  const R0 = input.R0 ?? ENGINE_R0;
  const Z_zheng_offset: Record<SchemeKey, number> = {
    I: input.Z_zheng_offset?.I ?? 0,
    II: input.Z_zheng_offset?.II ?? 0,
    III: input.Z_zheng_offset?.III ?? 0,
    IV: input.Z_zheng_offset?.IV ?? 0,
  };

  const q_in = load_all_floods();
  const schemes: SchemeFullResult[] = [];

  // 1) 兴利计算
  for (const sk of SCHEMES_ORDER) {
    const dead = computeDeadLevel(sk);
    const np = findNpForScheme(sk);
    const Np_wan = np.N_p / 1e4;
    const inst = calcInstalled(Np_wan, sk);
    const energy = find_repeat_capacity(sk, dead.Z_dead, Np_wan, inst.N_bi);

    schemes.push({
      scheme: sk,
      Z_zheng: SCHEMES[sk].Z_zheng + Z_zheng_offset[sk],
      Z_dead: dead.Z_dead,
      Z_xun: 0, Z_fangshou: 0, Z_design: 0, Z_check: 0,
      Z_dam: 0, Z_dam1: 0, Z_dam2: 0,
      delta_h_design: 0, delta_h_check: 0,
      V_total: 0,
      V_xing: dead.V_xing,
      V_fangshou: 0,
      V_jiehe: 0,
      Q_design_max: 0,
      Q_check_max: 0,
      Q_dump_avg: energy.Q_dump_avg,
      Np: Np_wan,
      N_ji_feng: inst.N_ji_feng,
      N_ji_ji: inst.N_ji_ji,
      N_ji: inst.N_ji,
      N_bei: inst.N_bei,
      N_bi: inst.N_bi,
      N_chong: energy.N_chong,
      N_y: energy.N_Y,
      E_avg: energy.E_avg,
      coef_xing: 0, coef_tiao: 0, eta: 0,
    } as SchemeFullResult);
  }

  // 2) 防洪调洪
  for (const sk of SCHEMES_ORDER) {
    const base_Z = SCHEMES[sk].Z_zheng;
    const Z_start = base_Z + Z_zheng_offset[sk];

    const r5  = flood_routing(sk, q_in[FLOOD_DOWN_KEY],  Z_start, Q_SAFE, false, undefined);
    const r1  = flood_routing(sk, q_in[FLOOD_DESIGN_KEY], Z_start, Q_SAFE, true,  undefined);
    const r01 = flood_routing(sk, q_in[FLOOD_CHECK_KEY],  Z_start, Q_SAFE, true,  undefined);

    const s = schemes.find(x => x.scheme === sk)!;
    s.Z_fangshou = r5.Z_max;
    s.Z_design = r1.Z_max;
    s.Z_check = r01.Z_max;
    s.Q_design_max = r1.Q_max;
    s.Q_check_max = r01.Q_max;
  }

  // 3) 汇总 (走 build_table, 让 V_total / Z_dam / coef_xing / eta 等都补齐)
  const waterDeps = Object.fromEntries(
    schemes.map(s => [s.scheme, {
      Z_dead: s.Z_dead, Np: s.Np * 1e4, N_bi: s.N_bi, N_chong: s.N_chong,
      N_Y: s.N_y, E_avg: s.E_avg, Q_dump_avg: s.Q_dump_avg,
    }]),
  );
  const floodDeps = Object.fromEntries(
    schemes.map(s => [s.scheme, {
      Z_fangshou_high: s.Z_fangshou, Z_design: s.Z_design, Q_design_max: s.Q_design_max,
      Z_check: s.Z_check, Q_check_max: s.Q_check_max,
    }]),
  );
  const table = build_table(waterDeps as any, floodDeps as any);

  // 把 build_table 算的字段回填
  for (const row of table) {
    const s = schemes.find(x => x.scheme === row.scheme)!;
    s.Z_zheng = row.Z_zheng;
    s.Z_dead = row.Z_dead;
    s.Z_xun = row.Z_xun;
    s.Z_fangshou = row.Z_fangshou;
    s.Z_design = row.Z_design;
    s.Z_check = row.Z_check;
    s.Z_dam = row.Z_dam;
    s.Z_dam1 = row.Z_dam1;
    s.Z_dam2 = row.Z_dam2;
    s.delta_h_design = row.delta_h_design;
    s.delta_h_check = row.delta_h_check;
    s.V_total = row.V_total;
    s.V_xing = row.V_xing;
    s.V_fangshou = row.V_fangshou;
    s.V_jiehe = row.V_jiehe;
    s.Q_design_max = row.Q_design_max;
    s.Q_check_max = row.Q_check_max;
    s.Np = row.Np;
    s.N_ji_feng = row.N_ji_feng;
    s.N_ji_ji = row.N_ji_ji;
    s.N_ji = row.N_ji;
    s.N_bei = row.N_bei;
    s.N_bi = row.N_bi;
    s.N_chong = row.N_chong;
    s.N_y = row.N_y;
    s.E_avg = row.E_avg;
    s.coef_xing = row.coef_xing;
    s.coef_tiao = row.coef_tiao;
    s.eta = row.eta;
    s.Q_dump_avg = row.Q_dump_avg;
  }

  // 4) 经济比较
  const econSimple = schemes.map(s => ({
    scheme: s.scheme,
    N_bi: s.N_bi,
    E_avg: s.E_avg,
    Z_zheng: s.Z_zheng,
    V_fangshou: s.V_fangshou,
  }));
  const econ = localEconomicCompare(econSimple, R0);
  for (const e of econ) {
    const s = schemes.find(x => x.scheme === e.scheme)!;
    s.annual_total = e.annual_total;
    s.PV_build = e.PV_build;
    s.PV_fang = e.PV_fang;
    s.PV_run = e.PV_run;
    s.annual_run = e.annual_run;
    s.B_fang = e.B_fang;
  }

  // 5) 推荐方案: 年费用最低
  const recommended = (econ.reduce((best, cur) =>
    cur.annual_total < best.annual_total ? cur : best,
  ).scheme) as SchemeKey;

  const params: AgentParams = {
    Q_SAFE, R0, Z_zheng_offset,
    modified: Q_SAFE !== ENGINE_Q_SAFE || R0 !== ENGINE_R0 ||
      SCHEMES_ORDER.some(sk => Z_zheng_offset[sk] !== 0),
  };

  return {
    schemes,
    economic: econ,
    recommended,
    params,
  };
}
