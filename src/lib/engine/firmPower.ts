/**
 * 保证出力长系列等出力试算 (任务书 p10)
 * 对每个方案 (V兴 = V(正) - V(死)):
 *   1) 假 N'(初始值)
 *   2) 从 V0 = V兴 + V死 开始, 逐时段顺算
 *      每月时段长 Δt = 一个月 -> 用月入库量(亿 m3)与发电流量(亿 m3/月)做差
 *   3) 供水期末: 若 Vmin < V死, 补水量 = V死 - Vmin, 折算为减少出力;
 *      若 Vmin > V死, 多余水量折算为加大出力
 *   4) 用偏差修正 N', 迭代至 |Vmin - V死| < ε
 *
 * 供电保证率 P=87.5% (按年): 31 年系列中取 31*(1-0.875) ≈ 3.875 破坏年
 * -> 第 4 小的调节流量对应的出力作为 Np
 */

import { SCHEMES, q_to_zd, v_to_z, z_to_v, K, DELTA_H, N_SCALE, DT_TO_YI } from './curves';
import { computeDeadLevel } from './deadLevel';
import { DT_FROM_YI } from './curves';
import { get_new_series } from './runoff';
import { buildYearItems, qpDesign, YearItem } from './multiYear';

// ============================================================
// 类型定义
// ============================================================

export interface MonthRow {
  t: number;
  Q_in: number;
  q: number;
  V_prev: number;
  V_next: number;
  Z_up: number;
  Z_dn: number;
  H: number;
  N_real: number;
  in_supply: boolean;
}

export interface YearFirmIterRecord {
  outer: number;
  N_target: number;
  V_min: number;
  V_dead: number;
  err_V: number;
  months: MonthRow[];
  V_nodes: number[];
}

export interface YearFirmResult {
  N_year: number;
  converged: boolean;
  iterations: number;
  V_min: number;
  V_dead: number;
  history: YearFirmIterRecord[];
}

export interface YearResultItem {
  year: number;
  N_year: number;
  q_year_diff: number;
  control_start_month: number;
  control_end_month: number;
  supply_indices: number[];
  n_supply: number;
  W_supply_msm: number;
  V_xing: number;
  H_used: number;
  converged: boolean;
}

export interface FindNpResult {
  scheme: string;
  Z_dead: number;
  V_xing: number;
  N_p: number;
  qp_design: number;
  fail_years: number;
  iter: number;
  year_results: YearResultItem[];
  N_sorted: number[];
}

// ============================================================
// solve_month_q: 单月发电流量 Newton 迭代
// ============================================================

/**
 * 单月等出力内层迭代: 已知 V_prev, Q_in, N_target, 求 q, V_next
 *
 * 出力公式: N = K * q * H / N_SCALE  (万 kW 单位)
 * N_SCALE = 1e4, 即 N * 1e4 = K * q * H, 所以 N(kW) = K * q * H
 */
export function solveMonthQ(
  V_prev: number,
  Q_in: number,
  N_target: number,
  q_init: number,
  V_dead: number,
  V_max: number,
  maxIter: number = 30,
  eps_N: number = 0.001,
): { q: number; V_next: number; Z_up: number; Z_dn: number; H: number; N_real: number } {
  let q = Math.max(q_init, 1.0);
  let V_next = Math.max(V_dead, Math.min(V_max, V_prev));
  let Z_up = v_to_z(V_next);
  let Z_dn = q_to_zd(q);
  let H = Z_up - Z_dn - DELTA_H;
  let N_real = K * q * H / N_SCALE;

  for (let iter = 0; iter < maxIter; iter++) {
    const V_next_raw = V_prev + (Q_in - q) * DT_TO_YI;
    V_next = Math.max(V_dead, Math.min(V_max, V_next_raw));

    const V_bar = 0.5 * (V_prev + V_next);
    Z_up = v_to_z(V_bar);
    Z_dn = q_to_zd(q);
    H = Z_up - Z_dn - DELTA_H;

    N_real = K * q * H / N_SCALE;
    const dN = N_real - N_target;

    if (Math.abs(dN) < eps_N) {
      return { q, V_next, Z_up, Z_dn, H, N_real };
    }

    q = q - dN * N_SCALE / (K * H);

    if (q <= 0) {
      q = 1.0;
    }
    // q 上限: 避免越界 q_to_zd
    const q_upper = Math.max(N_target / (K * 5.0), Q_in + 1000.0);
    if (q > q_upper) {
      q = q_upper;
    }
  }

  return { q, V_next, Z_up, Z_dn, H, N_real };
}

// ============================================================
// solve_year_firm_power: 单年等出力试算
// ============================================================

/**
 * 单年等出力试算, 只在"供水期"月做顺算, 汛期库容视为不变。
 *
 * @param schemeKey - 方案编号
 * @param Q_supply - 12 个月的入库流量 (m3/s), 下标对应 MONTH_ORDER
 * @param V_xing - 兴利库容, 亿 m3
 * @param N_init - 初始假定出力 (kW)
 * @param q_init - 初始假定发电流量 (m3/s)
 * @param supply_indices - 供水期在 12 月序列中的下标集合
 * @param max_outer - 外层最大迭代
 * @param max_inner - 内层最大迭代
 * @param eps_N - 出力收敛精度
 * @param eps_V - 库容收敛精度
 */
export function solveYearFirmPower(
  schemeKey: string,
  Q_supply: number[],
  V_xing: number,
  N_init: number,
  q_init: number = 800.0,
  supply_indices: number[] | null = null,
  max_outer: number = 80,
  max_inner: number = 30,
  eps_N: number = 0.001,
  eps_V: number = 0.001,
): YearFirmResult {
  const Z_dead = computeDeadLevel(schemeKey).Z_dead;
  const V_dead = z_to_v(Z_dead);
  const V_start = V_dead + V_xing;
  const V_max = V_start;

  let N_target = N_init;
  const history: YearFirmIterRecord[] = [];

  let supplySet: Set<number>;
  if (supply_indices === null) {
    supplySet = new Set(Q_supply.map((_, i) => i));
  } else {
    supplySet = new Set(supply_indices.map((i) => Math.floor(i)));
  }

  let V_min = 0;
  let err_V = 0;

  for (let outer = 0; outer < max_outer; outer++) {
    const V_nodes: number[] = [V_start];
    const monthRows: MonthRow[] = [];
    let q_last = q_init;

    for (let t = 0; t < Q_supply.length; t++) {
      const Q_in = Q_supply[t];
      const V_prev = V_nodes[V_nodes.length - 1];

      let q: number, V_next: number, Z_up: number, Z_dn: number, H: number, N_real: number;

      if (supplySet.has(t)) {
        const result = solveMonthQ(
          V_prev, Q_in, N_target, q_last, V_dead, V_max, max_inner, eps_N,
        );
        q = result.q;
        V_next = result.V_next;
        Z_up = result.Z_up;
        Z_dn = result.Z_dn;
        H = result.H;
        N_real = result.N_real;
        q_last = q;
      } else {
        // 汛期: 不参与等出力试算, 库容本月不变化
        q = q_last;
        V_next = V_prev;
        Z_up = v_to_z(V_prev);
        Z_dn = q_to_zd(q);
        H = Z_up - Z_dn - DELTA_H;
        N_real = K * q * H / N_SCALE;
      }

      V_nodes.push(V_next);

      monthRows.push({
        t,
        Q_in,
        q,
        V_prev,
        V_next,
        Z_up,
        Z_dn,
        H,
        N_real,
        in_supply: supplySet.has(t),
      });
    }

    V_min = Math.min(...V_nodes);
    err_V = V_min - V_dead;

    history.push({
      outer: outer + 1,
      N_target,
      V_min,
      V_dead,
      err_V,
      months: monthRows,
      V_nodes,
    });

    if (outer >= 1 && Math.abs(err_V) < eps_V) {
      return {
        N_year: N_target,
        converged: true,
        iterations: outer + 1,
        V_min,
        V_dead,
        history,
      };
    }

    const T_supply = Math.max(supplySet.size, 1);

    const Z_up_avg = v_to_z(V_dead + 0.5 * V_xing);
    let W_supply = 0;
    for (const t of supplySet) {
      W_supply += Q_supply[t] * DT_TO_YI;
    }
    const q_avg = (W_supply + V_xing) / (T_supply * DT_TO_YI);
    const Z_dn_avg = q_to_zd(q_avg);
    const H_avg = Z_up_avg - Z_dn_avg;

    const delta_q = err_V / (T_supply * DT_TO_YI);
    const delta_N = K * delta_q * H_avg / N_SCALE;

    N_target = Math.max(0.0, N_target + delta_N);
  }

  return {
    N_year: N_target,
    converged: false,
    iterations: max_outer,
    V_min,
    V_dead,
    history,
  };
}

// ============================================================
// find_Np_for_scheme: 长系列等出力试算
// ============================================================

/**
 * 长系列等出力试算, 求某方案的设计保证出力 Np。
 *
 * @param schemeKey - 方案编号 "I" / "II" / "III" / "IV"
 * @param q_init - 单年迭代的初始发电流量初值 (m3/s)
 * @param N_init - 单年迭代的初始出力 (万 kW)。null 时按 0.6 * 装机粗估
 * @param max_outer - 透传给 solveYearFirmPower
 * @param max_inner - 透传给 solveYearFirmPower
 * @param eps_N - 透传给 solveYearFirmPower
 * @param eps_V - 透传给 solveYearFirmPower
 * @param failYears - 允许破坏年数。P=87.5%, 31 年对应 failYears=4
 */
export function findNpForScheme(
  schemeKey: string,
  q_init: number = 800.0,
  N_init: number | null = null,
  max_outer: number = 30,
  max_inner: number = 30,
  eps_N: number = 0.001,
  eps_V: number = 0.001,
  failYears: number = 4,
): FindNpResult {
  const Z_dead = computeDeadLevel(schemeKey).Z_dead;
  const Z_zheng = SCHEMES[schemeKey].Z_zheng;
  const V_dead = z_to_v(Z_dead);
  const V_zheng = z_to_v(Z_zheng);
  const V_xing = V_zheng - V_dead;

  const { years, new_q } = get_new_series();
  const n_years = years.length;
  const P = 1 - failYears / n_years;

  // 多年 V -> q: 走 multiYear.qpDesign
  const yearItems: YearItem[] = buildYearItems();
  const qp_sel = qpDesign(yearItems, V_xing, P);
  const qp_records = qp_sel.records_sorted;
  const qp_year_list = qp_records.map((r) => r.q_year);
  const qp_design_val = qp_sel.design_value;

  // 平均净水头
  const H_used = Math.max(
    v_to_z(V_dead + 0.5 * V_xing) - q_to_zd(qp_design_val) - DELTA_H,
    1.0,
  );

  const yearToIdx = new Map<number, number>();
  years.forEach((y: number, i: number) => yearToIdx.set(y, i));

  const year_results: YearResultItem[] = [];

  for (const rec of qp_records) {
    const qp_year_i = rec.q_year;
    const si = rec.start_idx;
    const ei = rec.end_idx;
    const supply_indices: number[] = [];
    for (let k = si; k <= ei; k++) {
      supply_indices.push(k);
    }
    const n_supply = supply_indices.length;
    const i = yearToIdx.get(rec.year)!;
    let W_supply_msm = 0;
    for (const k of supply_indices) {
      W_supply_msm += new_q[i][k];
    }

    // 该年独立初值: q_year_i 对应的中点净水头下的出力
    let H_init = v_to_z(V_dead + 0.5 * V_xing) - q_to_zd(qp_year_i) - DELTA_H;
    H_init = Math.max(H_init, 1.0);
    const N_init_i = K * qp_year_i * H_init / N_SCALE * 1e4; // kW

    const year_run = solveYearFirmPower(
      schemeKey,
      [...new_q[i]],
      V_xing,
      N_init_i,
      qp_year_i,
      supply_indices,
      max_outer,
      max_inner,
      eps_N,
      eps_V,
    );
    const N_year = year_run.N_year;

    year_results.push({
      year: rec.year,
      N_year,
      q_year_diff: qp_year_i,
      control_start_month: rec.control_start_month,
      control_end_month: rec.control_end_month,
      supply_indices,
      n_supply,
      W_supply_msm,
      V_xing,
      H_used: H_init,
      converged: year_run.converged,
    });
  }

  // N_year 升序, 第 failYears 个 (零基) 即为 Np
  const N_sorted = year_results.map((yr) => yr.N_year).sort((a, b) => a - b);
  const idx = Math.min(Math.max(failYears - 1, 0), N_sorted.length - 1);
  const N_p = N_sorted[idx];

  return {
    scheme: schemeKey,
    Z_dead,
    V_xing,
    N_p,
    qp_design: qp_design_val,
    fail_years: failYears,
    iter: idx + 1,
    year_results,
    N_sorted,
  };
}
