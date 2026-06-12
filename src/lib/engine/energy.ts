/**
 * 重复容量与多年平均电能 (任务书 p12-13)
 * 调度规则 (本模块采用完整版):
 *   (1) 时段初水位在防破坏线内 -> N = Np
 *   (2) 汛期时段初水位在加大出力区 -> 按 [V防破, V汛] 三等分选 N
 *   (3) 供水期时段初水位在防破坏线之上 -> 末水位向"下月防破坏线"靠
 *   (4) 满装机发电且水位超 Z_汛 才允许弃水
 *
 * API:
 *   simulate_long_series(scheme_key, Z_dead, N_p, N_Y, n_years)
 *   find_repeat_capacity(scheme_key, Z_dead, N_p, N_bi)
 */
import {
  z_to_v, v_to_z, q_to_zd, SCHEMES,
  H_ECON, FENGTAN_LOSS,
  K, DELTA_H, DT_TO_YI, MONTH_HOURS,
  get_new_series,
} from "./curves";
import { compute_fangpo_line } from "./dispatch";

function _solve_q_iter(
  V_prev: number,
  Q_in: number,
  N_target: number,
  V_dead: number,
  V_zheng: number,
  max_iter: number = 25,
  eps_N: number = 0.05,
): { q_used: number; V_next: number; Z_up: number; H: number; N_real: number } {
  const V_zheng_eff = Math.max(V_zheng, V_prev);
  // 粗估 H 启动
  const Z_up_est = v_to_z((V_prev + V_zheng_eff) / 2);
  const Z_dn_est = q_to_zd(Math.min(Q_in, 2000));
  const H_est = Math.max(Z_up_est - Z_dn_est - DELTA_H, 5.0);
  let q_try = Math.max((N_target * 1e4) / (K * H_est), 50.0);

  let q_used = q_try;
  let V_next = V_prev;
  let Z_up = Z_up_est;
  let H = H_est;
  let N_real = 0.0;

  for (let iter = 0; iter < max_iter; iter++) {
    const V_next_ideal = V_prev + (Q_in - q_try) * DT_TO_YI;
    if (V_next_ideal > V_zheng_eff) {
      V_next = V_zheng_eff;
      q_used = Math.max(Q_in - (V_next - V_prev) / DT_TO_YI, 0.0);
    } else if (V_next_ideal < V_dead) {
      V_next = V_dead;
      q_used = Math.max(Q_in - (V_next - V_prev) / DT_TO_YI, 0.0);
    } else {
      V_next = V_next_ideal;
      q_used = q_try;
    }
    const V_bar = (V_prev + V_next) / 2;
    Z_up = v_to_z(V_bar);
    const Z_dn = q_to_zd(Math.max(q_used, 0.1));
    H = Z_up - Z_dn - DELTA_H;
    N_real = K * q_used * H / 1e4;
    if (Math.abs(N_real - N_target) < eps_N) break;
    const denom = K * Math.max(Z_up - Z_dn - DELTA_H, 0.1);
    q_try = q_try + (N_target - N_real) * 1e4 / denom;
    q_try = Math.max(q_try, 0.0);
  }
  return { q_used, V_next, Z_up, H, N_real };
}

export function simulate_long_series(
  scheme_key: string,
  Z_dead: number,
  N_p: number,
  N_Y: number,
  n_years: number = 31,
): [number, number, number] {
  const { Q_series } = get_new_series();
  const Z_zheng = SCHEMES[scheme_key].Z_zheng;
  const V_zheng = z_to_v(Z_zheng);
  const V_dead = z_to_v(Z_dead);

  // 防破坏线
  const fangpo = compute_fangpo_line(scheme_key, Z_dead, N_p, n_years);
  const months = fangpo.months;
  const V_fangpo = fangpo.V_env;
  // 汛限: 7 月底/8 月初的防破坏水位
  const idx_jul = months.indexOf(7) !== -1 ? months.indexOf(7) : 3;
  const V_flood = V_fangpo[idx_jul];

  const month_to_idx: Record<number, number> = {};
  for (let i = 0; i < months.length; i++) {
    month_to_idx[months[i]] = i;
  }

  let total_E = 0.0;
  let Q_dump_total = 0.0;
  let n_year_used = 0;

  for (let yi = 0; yi < n_years - 1; yi++) {
    // 5 月初(汛初)V = V_兴 (满蓄)
    let V_prev = V_zheng;
    let E_year = 0.0;
    let Q_dump_year = 0.0;

    for (let step = 0; step < 12; step++) {
      const m = months[step];
      // 取 Q_in: 水文年列序 4..3
      let Q_in: number;
      if (m >= 4) {
        Q_in = Q_series[yi][month_to_idx[m]];
      } else {
        if (yi + 1 >= Q_series.length) {
          Q_in = Q_series[yi][month_to_idx[m]];
        } else {
          Q_in = Q_series[yi + 1][month_to_idx[m]];
        }
      }
      const is_flood = [5, 6, 7, 8, 9].includes(m);
      const V_fangpo_this = !isNaN(V_fangpo[step]) ? V_fangpo[step] : V_dead;

      // ---- 决策 N_target ----
      let N_target = N_p;
      if (is_flood && V_prev > V_fangpo_this) {
        // 汛期 V 在防破坏线之上 -> 加大出力
        if (V_prev >= V_flood - 1e-6) {
          N_target = N_p;
        } else {
          const frac = (V_prev - V_fangpo_this) / Math.max(V_flood - V_fangpo_this, 1e-6);
          if (frac <= 1.0 / 3) {
            N_target = N_p + (N_Y - N_p) / 3.0;
          } else if (frac <= 2.0 / 3) {
            N_target = N_p + 2.0 * (N_Y - N_p) / 3.0;
          } else {
            N_target = N_Y;
          }
          N_target = Math.min(N_target, N_Y);
        }
      } else if (!is_flood && V_prev > V_fangpo_this) {
        // 供水期 V 在防破坏线之上 -> 让 V_next 向"下月防破坏线"靠
        const next_step = (step + 1) % 12;
        let V_target_next = !isNaN(V_fangpo[next_step]) ? V_fangpo[next_step] : V_fangpo_this;
        V_target_next = Math.max(Math.min(V_target_next, V_zheng), V_dead);
        let q_est = Q_in - (V_target_next - V_prev) / DT_TO_YI;
        q_est = Math.max(q_est, 0.0);
        const V_bar = (V_prev + V_target_next) / 2;
        const Z_up = v_to_z(V_bar);
        const Z_dn = q_to_zd(Math.max(q_est, 0.1));
        const H = Z_up - Z_dn - DELTA_H;
        N_target = K * q_est * H / 1e4;
        N_target = Math.min(N_target, N_Y);
      }

      const { q_used, V_next, Z_up, H, N_real } = _solve_q_iter(
        V_prev, Q_in, N_target, V_dead, V_zheng);

      // 弃水: 只有当 V 顶到 V_正 (满蓄) 时才弃
      let Q_dump = 0.0;
      if (V_next >= V_zheng - 1e-6 && V_prev >= V_zheng - 1e-6) {
        const q_max_at_v = Math.max(N_target * 1e4 / (K * Math.max(H, 1.0)), 1.0);
        Q_dump = Math.max(Q_in - q_max_at_v, 0);
      }

      const E_month = N_real * MONTH_HOURS; // 万 kW * 月小时数 = 万 kWh
      E_year += E_month / 1e4; // 亿 kWh
      Q_dump_year += Q_dump * DT_TO_YI;
      V_prev = V_next;
    }
    total_E += E_year;
    Q_dump_total += Q_dump_year;
    n_year_used++;
  }

  const E_avg = total_E / n_year_used;
  const Q_dump_avg = Q_dump_total / n_year_used / 1e8 * 1e3; // 亿 m3/年 -> m3/s
  return [E_avg, Q_dump_avg, E_avg];
}

export function find_repeat_capacity(
  scheme_key: string,
  Z_dead: number,
  N_p: number,
  N_bi: number,
): {
  N_bi: number; N_chong: number; N_Y: number;
  E_avg: number; E_avg_raw: number; E_fengtan_loss: number;
  candidates: number[]; E_list: number[]; h_uses: number[];
  Q_dump_avg: number;
} {
  const candidates = [0, 10, 20, 30, 40, 50, 60, 70].map(d => N_bi + d);
  const E_list: number[] = [];
  const Q_dump_list: number[] = [];

  for (const N_Y of candidates) {
    const [E, Qd] = simulate_long_series(scheme_key, Z_dead, N_p, N_Y);
    E_list.push(E);
    Q_dump_list.push(Qd);
  }

  const h_uses: number[] = [];
  for (let i = 1; i < candidates.length; i++) {
    h_uses.push((E_list[i] - E_list[i - 1]) / (candidates[i] - candidates[i - 1]) * 1e4);
  }

  // 选 N_chong: 取最后一个 h_i >= H_ECON 对应的 (i+1) 档
  let N_chong = 0;
  for (let i = 0; i < h_uses.length; i++) {
    if (h_uses[i] >= H_ECON) {
      N_chong = candidates[i + 1] - N_bi;
    } else {
      break;
    }
  }

  const N_Y_final = N_bi + N_chong;
  const idx_final = candidates.indexOf(N_Y_final);
  const E_final = E_list[idx_final];

  const fengtan = FENGTAN_LOSS[scheme_key] || { N: 0, E: 0 };
  const E_fengtan_loss = fengtan.E;
  const E_final_minus_fengtan = E_final - E_fengtan_loss;

  return {
    N_bi, N_chong, N_Y: N_Y_final,
    E_avg: E_final_minus_fengtan,
    E_avg_raw: E_final,
    E_fengtan_loss,
    candidates, E_list, h_uses,
    Q_dump_avg: Q_dump_list[idx_final],
  };
}