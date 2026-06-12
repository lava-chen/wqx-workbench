/**
 * 经济计算 - 年费用最小法 (任务书 p16-20)
 * 11 年施工期 + 50 年正常运行期 = 61 年
 * 折算率 r0 = 0.10
 * 火电寿命 25 年, 水电站 50 年
 */
import {
  ECON, FENGTAN_LOSS, RUN_FACTOR, RESERVE,
  R0, T_BUILD, T_RUN, T_FIRE,
  HYDRAULIC_BUILD, HOUSE_TRAFFIC, MECH, COMPENSATION,
  INVEST_RATIO, COMP_RATIO_I, COMP_RATIO_II, FIRE_INV_RATIO, MINE_INV_RATIO,
  FIRE_KWH_COST, MINE_KWH_COST, FIRE_FUEL_COST, FIRE_OP_FACTOR,
  FIRE_SCALE_CAP, FIRE_SCALE_E,
} from "./curves";
import { TableRow } from "./summary";

// ============================================================
// 资金时间价值因子
// ============================================================
function p_to_f(t: number): number {
  return Math.pow(1 + R0, t);
}

function f_to_p(t: number): number {
  return 1.0 / p_to_f(t);
}

function capital_recovery_factor(r: number, n: number): number {
  return r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

// ============================================================
// 投资流程
// ============================================================
export interface YearlyInvest {
  invest: number[];
  comp: number[];
  fire: number[];
  mine: number[];
}

export function get_yearly_invest(
  scheme_key: string,
  N_bi_other: number,
  E_other: number,
  N_bi_I: number,
  E_I: number,
  Z_zheng_I: number,
): YearlyInvest {
  const sk = scheme_key;
  const total_invest = ECON[sk].dam_invest + ECON[sk].mech_invest + ECON[sk].temp_invest;
  const ratio = INVEST_RATIO[sk];
  const invest_yearly = ratio.map(r => total_invest * r);

  // 水库补偿
  let comp_yearly: number[];
  if (sk === 'I') {
    comp_yearly = [0.0];
    for (const r of COMP_RATIO_I) {
      comp_yearly.push(ECON[sk].comp_invest * r);
    }
  } else {
    comp_yearly = [0.0];
    for (const r of COMP_RATIO_II) {
      comp_yearly.push(ECON[sk].comp_invest * r);
    }
  }
  while (comp_yearly.length < 11) comp_yearly.push(0.0);

  // 替代电站 (与方案 I 比较)
  const fire_yearly: number[] = new Array(11).fill(0.0);
  const mine_yearly: number[] = new Array(11).fill(0.0);
  if (sk !== 'I') {
    const dN = Math.max(0, N_bi_I - N_bi_other);
    const dE = Math.max(0, E_I - E_other);
    const K_fire = FIRE_KWH_COST * dN * 1e4 * FIRE_SCALE_CAP / 1e4;
    const K_mine = MINE_KWH_COST * dE * 1e8 * FIRE_SCALE_E / 1e4;

    for (let k = 0; k < FIRE_INV_RATIO.length; k++) {
      fire_yearly[5 + k] = K_fire * FIRE_INV_RATIO[k];
    }
    for (let k = 0; k < MINE_INV_RATIO.length; k++) {
      mine_yearly[5 + k] = K_mine * MINE_INV_RATIO[k];
    }
  }

  return { invest: invest_yearly, comp: comp_yearly, fire: fire_yearly, mine: mine_yearly };
}

export interface YearlyRunning {
  u1: number;
  u2: number;
  u3: number;
  u_hydro: number;
}

export function get_yearly_running(scheme_key: string, N_bi: number, _E_avg: number): YearlyRunning {
  const sk = scheme_key;
  const u1 = (RUN_FACTOR[sk] || 2.0) * N_bi;
  const u2 = (HYDRAULIC_BUILD[sk]?.overhaul || 0) +
             (HOUSE_TRAFFIC[sk]?.overhaul || 0) +
             (MECH[sk]?.overhaul || 0);
  const u3 = (COMPENSATION[sk]?.deduct || 0);
  const u_hydro = u1 + u2 + u3;
  return { u1, u2, u3, u_hydro };
}

export function present_value_of_cashflow(cashflows: number[] | Record<number, number>): number {
  let pv = 0.0;
  if (Array.isArray(cashflows)) {
    for (let i = 0; i < cashflows.length; i++) {
      const amt = cashflows[i];
      if (amt === 0) continue;
      pv += amt * f_to_p(i + 1);
    }
  } else {
    for (const tStr of Object.keys(cashflows)) {
      const t = parseInt(tStr);
      pv += cashflows[t] * f_to_p(t);
    }
  }
  return pv;
}

export function annuity(pv: number, r: number, n: number): number {
  return pv * capital_recovery_factor(r, n);
}

export function compute_fangshou_benefit(scheme_key: string, table: TableRow[]): number {
  // 任务书表 6 拦洪量 (亿 m3)
  const W_data: [number, number][] = [
    [1933, 15.2], [1931, 13.6], [1935, 10.1], [1949, 7.5],
    [1969, 6.5], [1954, 6.2], [1970, 2.31], [1974, 1.38], [1938, 0.31],
  ];
  const n = W_data.length;
  const W_sorted = W_data.map(([, w]) => w).sort((a, b) => b - a);
  const P_list = W_sorted.map((_, m) => (m + 1) / (n + 1));

  // 梯形近似积分
  let W_avg = 0.0;
  for (let i = 0; i < n - 1; i++) {
    W_avg += (W_sorted[i] + W_sorted[i + 1]) * (P_list[i + 1] - P_list[i]) / 2;
  }

  const row = table.find(r => r.scheme === scheme_key);
  if (!row) return 0;
  const V_fang = row.V_fangshou;
  return Math.min(W_avg * V_fang * 10, 5000);
}

export interface EconomicResult {
  scheme: string;
  N_bi: number;
  E_avg: number;
  PV_build: number;
  PV_run: number;
  PV_fang: number;
  PV_fire_repeat: number;
  total_PV: number;
  annual_total: number;
  B_fang: number;
  fire_inv: number;
  fire_fuel_full: number;
  fire_op_full: number;
  annual_run: number;
}

export function economic_compare(table: TableRow[], _r0?: number): EconomicResult[] {
  // 方案 I 基准
  const I_row = table.find(row => row.scheme === 'I')!;
  const N_bi_I = I_row.N_bi;
  const E_I = I_row.E_avg;
  const Z_zheng_I = I_row.Z_zheng;

  const results: EconomicResult[] = [];

  for (const row of table) {
    const sk = row.scheme;
    const N_bi = row.N_bi;
    const E_avg = row.E_avg;

    // 年投资(11 年)
    const cf = get_yearly_invest(sk, N_bi, E_avg, N_bi_I, E_I, Z_zheng_I);

    // 水电运行费
    const R = get_yearly_running(sk, N_bi, E_avg);

    // 火电运行费
    const fire_fuel_full = FIRE_FUEL_COST * Math.max(0, E_I - E_avg) * 1e8 / 1e4;
    const fire_inv_total = cf.fire.reduce((a, b) => a + b, 0);
    const fire_op_full = FIRE_OP_FACTOR * fire_inv_total;

    // 防洪效益
    const B_fang = compute_fangshou_benefit(sk, table);

    // 总现金流
    const cashflows: number[] = new Array(11).fill(0.0);
    for (let i = 0; i < 11; i++) {
      cashflows[i] = cf.invest[i] + cf.comp[i] + cf.fire[i] + cf.mine[i];
    }

    // 初始运行费 (第 9-11 年比例 20/70/90)
    const r9 = 0.2 * R.u_hydro;
    const r10 = 0.7 * R.u_hydro;
    const r11 = 0.9 * R.u_hydro;
    const initRun: Record<number, number> = { 9: r9, 10: r10, 11: r11 };
    if (sk !== 'I') {
      initRun[9] += 0.2 * fire_fuel_full;
      initRun[10] += 0.7 * fire_fuel_full;
      initRun[11] += 0.9 * fire_fuel_full;
    }
    for (const yr of [9, 10, 11]) {
      cashflows[yr - 1] += initRun[yr];
    }

    const PV_build = present_value_of_cashflow(cashflows);

    // 50 年等额现值因子
    const pa = (Math.pow(1 + R0, 50) - 1) / (R0 * Math.pow(1 + R0, 50));
    const PV_fang = B_fang * pa * f_to_p(11);
    const annual_run = R.u_hydro + fire_fuel_full + fire_op_full;
    const PV_run = annual_run * pa * f_to_p(11);
    const fire_repeat = cf.fire.reduce((a, b) => a + b, 0);
    const PV_fire_repeat = fire_repeat * f_to_p(11 + 25);
    const total_PV = PV_build - PV_fang + PV_run + PV_fire_repeat;
    const annual_total = total_PV * capital_recovery_factor(R0, 50);

    results.push({
      scheme: sk,
      N_bi, E_avg,
      PV_build, PV_run, PV_fang, PV_fire_repeat,
      total_PV, annual_total,
      B_fang,
      fire_inv: fire_inv_total,
      fire_fuel_full,
      fire_op_full,
      annual_run,
    });
  }

  return results;
}