/**
 * 三标准调洪演算 (任务书 p13-15)
 * 三种标准:
 *   P=5%   下游防洪
 *   P=0.1% 大坝设计
 *   P=0.01% 大坝校核
 * 起调水位 = 汛限水位(本设计 = 正常蓄水位, V_结合=0)
 * 调洪规则 (5 级):
 *   (1) Q < Q_起泄能力 且 < Q安  ->  q=Q
 *   (2) Q > Q_起泄能力 且 q_自由 < Q安   ->  自由泄流(闸门全开)
 *   (3) q_自由 > Q安                    ->  q = Q安 (下游标准 P=5%)
 *   (4) 大坝标准: q = Q安; 当 V >= Z_防洪高 时 -> 全开
 *
 * 水量平衡: V_{t+1} = V_t + (Q_in_avg - q_out_avg) * dt
 * 算法: 单步法 (任务书 p15 隐式方程近似), 工程精度 < 1%
 */
import {
  discharge_capacity, z_to_v, v_to_z,
  SCHEMES, Q_SAFE, FLOOD_DATA,
} from "./curves";

const DT_FLOOD_SEC = 3 * 3600;   // 3 小时 = 10800 s
const DT_FLOOD_YI = DT_FLOOD_SEC / 1e8;  // m3 -> 亿 m3

export const FLOOD_DOWN_KEY = "P=5% (20年)";
export const FLOOD_DESIGN_KEY = "P=0.1% (1000年)";
export const FLOOD_CHECK_KEY = "P=0.01% (10000年)";

export function load_flood(key: string): number[] {
  return [...FLOOD_DATA[key]];
}

export function load_all_floods(): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const key of Object.keys(FLOOD_DATA)) {
    result[key] = [...FLOOD_DATA[key]];
  }
  return result;
}

export interface FloodRoutingResult {
  V_series: number[];
  Z_series: number[];
  Q_out_series: number[];
  Z_max: number;
  Q_max: number;
}

export function flood_routing(
  scheme_key: string,
  Q_in_series: number[],
  Z_start: number,
  Q_safe: number = Q_SAFE,
  is_dam_std: boolean = false,
  Z_fangshou_high?: number,
): FloodRoutingResult {
  const Q = [...Q_in_series];
  let V_prev = z_to_v(Z_start);
  const V_series: number[] = [V_prev];
  const Z_series: number[] = [Z_start];
  const Q_out_series: number[] = [Q.length > 0 ? Q[0] : 0];
  let Q_prev_out = Q.length > 0 ? Q[0] : 0;

  const V_start = V_prev;
  const V_floor = V_start * 0.95;

  for (let i = 0; i < Q.length; i++) {
    const Qin = Q[i];
    let Q_out: number;
    let V_next: number;

    if (i === 0) {
      Q_out = Qin;
      V_next = V_prev;
    } else {
      // 任务书 p15 隐式方程,单步法
      const Q_avg = (Qin + Q[i - 1]) / 2;
      // 第 1 步: 假设 q_out = Q_prev_out
      let V_1 = V_prev + (Q_avg - Q_prev_out) * DT_FLOOD_YI;
      V_1 = Math.max(V_1, V_floor);
      const Z_up_1 = v_to_z(V_1);
      const q_cap_1 = discharge_capacity(Z_up_1, scheme_key);

      if (Qin <= q_cap_1 && Qin <= Q_safe) {
        // 规则 (2): q = Q, V 不变
        Q_out = Qin;
        V_next = V_prev;
      } else if (q_cap_1 <= Q_safe) {
        // 规则 (3): 自由泄流, V 变化
        Q_out = q_cap_1;
        V_next = V_prev + (Q_avg - (Q_prev_out + Q_out) / 2) * DT_FLOOD_YI;
        V_next = Math.max(V_next, V_floor);
      } else {
        if (is_dam_std && Z_fangshou_high === undefined) {
          // 大坝标准: 全开
          Q_out = q_cap_1;
          V_next = V_prev + (Q_avg - (Q_prev_out + Q_out) / 2) * DT_FLOOD_YI;
          V_next = Math.max(V_next, V_floor);
        } else {
          // 规则 (4): 控泄
          Q_out = Q_safe;
          V_next = V_prev + (Q_avg - (Q_prev_out + Q_out) / 2) * DT_FLOOD_YI;
          V_next = Math.max(V_next, V_floor);
        }
      }
    }

    V_prev = V_next;
    V_series.push(V_next);
    Z_series.push(v_to_z(V_next));
    Q_out_series.push(Q_out);
    Q_prev_out = Q_out;
  }

  const Z_max = Math.max(...Z_series);
  const Q_max = Math.max(...Q_out_series);
  return { V_series, Z_series, Q_out_series, Z_max, Q_max };
}

export function check_water_balance(
  Q_in_series: number[],
  V_series: number[],
  Q_out_series: number[],
  dt_yi: number = DT_FLOOD_YI,
): number {
  const n = Math.min(V_series.length - 1, Q_in_series.length);
  if (n < 2) return 0.0;
  const errs: number[] = [];
  for (let i = 1; i < n; i++) {
    const Q_avg = (Q_in_series[i - 1] + Q_in_series[i]) / 2;
    const q_avg = (Q_out_series[i] + Q_out_series[i + 1]) / 2;
    const dV_actual = V_series[i + 1] - V_series[i];
    const dV_formula = (Q_avg - q_avg) * dt_yi;
    errs.push(Math.abs(dV_actual - dV_formula));
  }
  return errs.length > 0 ? Math.max(...errs) : 0.0;
}

export function compute_fangshou_high(
  scheme_key: string,
  Q_in_P5: number[],
  Z_start: number,
  Q_safe: number = Q_SAFE,
): { Z_max: number; result: FloodRoutingResult } {
  const r = flood_routing(scheme_key, Q_in_P5, Z_start, Q_safe, false, undefined);
  return { Z_max: r.Z_max, result: r };
}

export interface SchemeFloodResult {
  scheme: string;
  Z_start: number;
  Z_fangshou_high: number;
  Z_design: number;
  Q_design_max: number;
  Z_check: number;
  Q_check_max: number;
  r5: FloodRoutingResult;
  r1: FloodRoutingResult;
  r01: FloodRoutingResult;
}

export function route_for_scheme(
  scheme_key: string,
  Q_in: Record<string, number[]>,
  Q_safe: number = Q_SAFE,
): SchemeFloodResult {
  const Z_start = SCHEMES[scheme_key].Z_zheng;
  const { Z_max: Z_fangshou, result: r5 } = compute_fangshou_high(
    scheme_key, Q_in[FLOOD_DOWN_KEY], Z_start, Q_safe);
  const r1 = flood_routing(scheme_key, Q_in[FLOOD_DESIGN_KEY], Z_start, Q_safe, true, undefined);
  const r01 = flood_routing(scheme_key, Q_in[FLOOD_CHECK_KEY], Z_start, Q_safe, true, undefined);

  return {
    scheme: scheme_key,
    Z_start,
    Z_fangshou_high: Z_fangshou,
    Z_design: r1.Z_max,
    Q_design_max: r1.Q_max,
    Z_check: r01.Z_max,
    Q_check_max: r01.Q_max,
    r5, r1, r01,
  };
}

export function run_for_schemes(
  schemes?: string[],
  Q_safe: number = Q_SAFE,
): Record<string, SchemeFloodResult> {
  const scheme_list = schemes || Object.keys(SCHEMES);
  const Q_in = load_all_floods();
  const results: Record<string, SchemeFloodResult> = {};
  for (const sk of scheme_list) {
    results[sk] = route_for_scheme(sk, Q_in, Q_safe);
  }
  return results;
}