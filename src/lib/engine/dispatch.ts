/**
 * 水电站调度图绘制 (任务书 p10-12)
 *   (1) 防破坏线: P=87.5% 范围内各年逆时序等出力试算,蓄水过程线外包
 *   (2) 防洪限制水位: 取 7 月底/8 月初防破坏线坐标
 *   (3) 加大出力辅助线: Z_it = Z_t + (Z_汛 - Z_t) * i/4, i=1,2,3
 */
import {
  z_to_v, v_to_z, q_to_zd, SCHEMES,
  K, DELTA_H, DT_TO_YI,
  MONTH_ORDER,
  get_new_series,
  build_year_items, qp_records_for_each_year,
} from "./curves";

export interface MonthStorage {
  V_next: number;
  V_prev: number;
  Z_up: number;
  q: number;
  N: number;
  Q_in: number;
}

export interface FangpoResult {
  months: number[];
  V_env: number[];
  Z_env: number[];
  all_curves: Record<number, Record<number, number>>;
  supply_used: Record<number, [number, number, number]>;
}

export function backstep_one_month(
  V_next: number,
  Q_in_new: number,
  Z_dead: number,
  Z_zheng: number,
  N_target: number,
  q_try: number,
  max_iter: number = 30,
  eps: number = 0.001,
): { q_try: number; V_prev: number; Z_up: number; H: number; N_real: number } {
  const V_dead_val = z_to_v(Z_dead);
  const V_zheng_val = z_to_v(Z_zheng);

  let V_prev = V_next - (Q_in_new - q_try) * DT_TO_YI;
  V_prev = Math.max(V_prev, V_dead_val);
  V_prev = Math.min(V_prev, V_zheng_val);

  let V_bar = (V_prev + V_next) / 2;
  let Z_up = v_to_z(V_bar);
  let Z_dn = q_to_zd(q_try);
  let H = Z_up - Z_dn - DELTA_H;
  let N_real = K * q_try * H / 1e4;

  for (let iter = 0; iter < max_iter; iter++) {
    const dN = N_target - N_real;
    if (Math.abs(dN) < eps) break;
    const denom = K * (Z_up - Z_dn - DELTA_H);
    if (Math.abs(denom) < 1e-3) break;
    q_try = q_try + dN * 1e4 / denom;
    if (q_try < 0) q_try = 10;
    V_prev = V_next - (Q_in_new - q_try) * DT_TO_YI;
    V_prev = Math.max(V_prev, V_dead_val);
    V_prev = Math.min(V_prev, V_zheng_val);
    V_bar = (V_prev + V_next) / 2;
    Z_up = v_to_z(V_bar);
    Z_dn = q_to_zd(q_try);
    H = Z_up - Z_dn - DELTA_H;
    N_real = K * q_try * H / 1e4;
  }
  return { q_try, V_prev, Z_up, H, N_real };
}

export function backtrace_year(
  Q_series: number[][],
  year_idx: number,
  Z_dead: number,
  Z_zheng: number,
  N_target: number,
  idx_supply?: [number, number],
): Record<number, MonthStorage> {
  const V_dead_val = z_to_v(Z_dead);
  const V_zheng_val = z_to_v(Z_zheng);
  const start_idx = idx_supply ? idx_supply[0] : 6;
  const end_idx = idx_supply ? idx_supply[1] : 11;

  const storage: Record<number, MonthStorage> = {};
  let V_next = V_dead_val;
  let q_try = 300;

  for (let idx = end_idx; idx >= start_idx; idx--) {
    const Q_in = Q_series[year_idx][idx];
    const m = MONTH_ORDER[idx];
    const result = backstep_one_month(V_next, Q_in, Z_dead, Z_zheng, N_target, q_try);
    q_try = result.q_try;
    storage[m] = {
      V_next, V_prev: result.V_prev,
      Z_up: result.Z_up, q: result.q_try,
      N: result.N_real, Q_in,
    };
    V_next = result.V_prev;
  }
  return storage;
}

export function backtrace_year_full(
  Q_series: number[][],
  year_idx: number,
  Z_dead: number,
  Z_zheng: number,
  N_target: number,
  idx_supply?: [number, number],
): Record<number, MonthStorage> {
  const end_idx = idx_supply ? idx_supply[1] : 0;
  const V_dead_val = z_to_v(Z_dead);
  const V_zheng_val = z_to_v(Z_zheng);

  const rev_indices: number[] = [];
  for (let i = 0; i < 12; i++) {
    rev_indices.push(((end_idx - i) % 12 + 12) % 12);
  }

  const storage: Record<number, MonthStorage> = {};
  let V_next = V_dead_val;
  let q_try = 300;

  for (const idx of rev_indices) {
    const Q_in = Q_series[year_idx][idx];
    const m = MONTH_ORDER[idx];
    const result = backstep_one_month(V_next, Q_in, Z_dead, Z_zheng, N_target, q_try);
    q_try = result.q_try;
    let V_prev = result.V_prev;
    // 汛期 (5,6,7,8,9月) 严格 clamp 到 V_正
    if ([5, 6, 7, 8, 9].includes(m)) {
      V_prev = Math.min(V_prev, V_zheng_val);
    }
    storage[m] = {
      V_next, V_prev,
      Z_up: result.Z_up, q: result.q_try,
      N: result.N_real, Q_in,
    };
    V_next = V_prev;
  }
  return storage;
}

export function compute_fangpo_line(
  scheme_key: string,
  Z_dead: number,
  N_target: number,
  n_years: number = 30,
): FangpoResult {
  const { Q_series } = get_new_series();
  const Z_zheng = SCHEMES[scheme_key].Z_zheng;
  const V_xing_yi = z_to_v(Z_zheng) - z_to_v(Z_dead);
  const months_in_year = [...MONTH_ORDER];
  const all_curves: Record<number, Record<number, number>> = {};
  const supply_used: Record<number, [number, number, number]> = {};

  const year_items = build_year_items().slice(0, n_years - 1);
  const qp_records = qp_records_for_each_year(year_items, V_xing_yi);

  for (let i = 0; i < qp_records.length; i++) {
    const rec = qp_records[i];
    const si = rec.start_idx;
    const ei = rec.end_idx;
    const st = backtrace_year_full(Q_series, i, Z_dead, Z_zheng, N_target, [si, ei]);
    if (!st) continue;
    all_curves[i] = {};
    for (const m of Object.keys(st)) {
      const mNum = parseInt(m);
      all_curves[i][mNum] = v_to_z(st[mNum].V_prev);
    }
    supply_used[i] = [rec.control_start_month, rec.control_end_month, rec.control_length];
  }

  const Z_env: number[] = [];
  for (const m of months_in_year) {
    const vals: number[] = [];
    for (const i of Object.keys(all_curves)) {
      const idx = parseInt(i);
      if (m in all_curves[idx]) {
        vals.push(all_curves[idx][m]);
      }
    }
    Z_env.push(vals.length > 0 ? Math.max(...vals) : NaN);
  }

  // 4 月兜底: 供水期末物理上就是 V死
  if (isNaN(Z_env[0])) {
    Z_env[0] = Z_dead;
  }
  const V_env = Z_env.map(z => isNaN(z) ? NaN : z_to_v(z));
  if (isNaN(V_env[0])) {
    V_env[0] = z_to_v(Z_dead);
  }

  return { months: months_in_year, V_env, Z_env, all_curves, supply_used };
}