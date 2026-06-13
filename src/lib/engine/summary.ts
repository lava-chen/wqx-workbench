/**
 * 汇总所有方案的水利指标 (任务书 p8 表 1)
 * 本模块是"纯组装": 不调任何上游计算函数, 只接受上游 dict 做汇总.
 */
import {
  SCHEMES,
  z_to_v, v_to_z,
  WIND_V, WIND_D, SAFETY_1, SAFETY_2,
  RESERVE, SHIP_BASE,
  get_ANNUAL_RUNOFF_YI,
} from "./curves";
import { compute_fangpo_line } from "./dispatch";

export interface WaterDeps {
  Z_dead: number;
  Np: number;
  N_bi: number;
  N_chong: number;
  N_Y: number;
  E_avg: number;
  Q_dump_avg?: number;
}

export interface FloodDeps {
  Z_fangshou_high: number;
  Z_design: number;
  Q_design_max: number;
  Z_check: number;
  Q_check_max: number;
}

export interface TableRow {
  scheme: string;
  Z_zheng: number;
  Z_dead: number;
  Z_xun: number;
  Z_fangshou: number;
  Z_design: number;
  Z_check: number;
  Z_dam: number;
  Z_dam1: number;
  Z_dam2: number;
  delta_h_design: number;
  delta_h_check: number;
  V_total: number;
  V_xing: number;
  V_fangshou: number;
  V_jiehe: number;
  Q_design_max: number;
  Q_check_max: number;
  Np: number;
  N_ji_feng: number;
  N_ji_ji: number;
  N_ji: number;
  N_bei: number;
  N_bi: number;
  N_chong: number;
  N_y: number;
  E_avg: number;
  coef_xing: number;
  coef_tiao: number;
  eta: number;
  Q_dump_avg: number;
}

export function wind_wave_height(V_wind: number, D: number): number {
  return 0.0208 * Math.pow(V_wind, 1.25) * Math.pow(D, 1 / 3);
}

export function calc_installed(
  N_p: number,
  scheme_key: string,
): { N_p: number; N_ji_ji: number; N_feng: number; N_ji_feng: number; N_ji: number; N_bei: number; N_bi: number } {
  const N_ji_ji = SHIP_BASE;
  const N_feng = Math.max(0, N_p - SHIP_BASE);
  const N_ji_feng = 3.08 * N_feng + 7;
  const N_ji = N_ji_feng + N_ji_ji;
  const N_bei = RESERVE[scheme_key] || 15;
  const N_bi = N_ji + N_bei;
  return { N_p, N_ji_ji, N_feng, N_ji_feng, N_ji, N_bei, N_bi };
}

export function build_table(water_deps: Record<string, WaterDeps>, flood_deps: Record<string, FloodDeps>): TableRow[] {
  const table: TableRow[] = [];

  // 以调用方传入的 water_deps 键集为权威源, 跳过任何上游未提供完整依赖的方案。
  // 这避免 SCHEMES 字典与动态方案列表不一致时 (新增/删除方案) 出现 undefined.Z_dead。
  for (const sk of Object.keys(water_deps)) {
    if (!SCHEMES[sk]) continue;
    const wd = water_deps[sk];
    const fd = flood_deps[sk];
    if (!wd || !fd) continue;

    const Z_zheng = SCHEMES[sk].Z_zheng;
    const V_zheng = z_to_v(Z_zheng);
    const Z_dead = wd.Z_dead;
    const V_dead = z_to_v(Z_dead);
    const V_xing = V_zheng - V_dead;

    // 防洪限制水位: 此处由调用方传入 (不再内调 dispatch)
    const { Z_env } = compute_fangpo_line(sk, Z_dead, wd.Np, 30);
    let Z_xun = Z_dead;
    for (const idx of [3, 4]) {
      const value = Z_env[idx];
      if (!isNaN(value)) {
        Z_xun = value;
        break;
      }
    }
    const Z_fangshou = fd.Z_fangshou_high;
    const Z_design = fd.Z_design;
    const Z_check = fd.Z_check;
    const V_fangshou_capacity = Math.max(0.0, z_to_v(Z_fangshou) - V_zheng);
    const V_jiehe = Math.max(0.0, V_zheng - z_to_v(Z_xun));

    // 坝顶高程
    const delta_h_design = wind_wave_height(WIND_V, WIND_D);
    const delta_h_check = wind_wave_height(WIND_V * 0.8, WIND_D);
    const Z_dam1 = Z_design + delta_h_design + SAFETY_1;
    const Z_dam2 = Z_check + delta_h_check + SAFETY_2;
    const Z_dam = Math.max(Z_dam1, Z_dam2);

    // 装机
    const Np = wd.Np;
    const inst = calc_installed(Np, sk);
    const N_bi = wd.N_bi;
    const N_chong = wd.N_chong;
    const N_y = wd.N_Y;
    const E_avg = wd.E_avg;

    // 径流利用系数 η = (Q0 - Q弃) / Q0
    const Q_dump_avg = wd.Q_dump_avg || 0.0;
    const Q0 = get_ANNUAL_RUNOFF_YI() / (30.4 * 86400 / 1e8 * 12);  // 亿m3/年 -> m3/s
    let eta: number;
    if (Q0 > 0 && Q_dump_avg > 0) {
      eta = (Q0 - Q_dump_avg) / Q0;
    } else if (Q0 > 0) {
      eta = 0.999;
    } else {
      eta = 0.0;
    }
    eta = Math.round(eta * 10000) / 10000;

    // 库容系数
    const ANNUAL_RUNOFF_YI = get_ANNUAL_RUNOFF_YI();
    const coef_xing = ANNUAL_RUNOFF_YI > 0 ? V_xing / ANNUAL_RUNOFF_YI : 0.0;
    const coef_tiao = coef_xing;

    table.push({
      scheme: sk,
      Z_zheng, Z_dead, Z_xun,
      Z_fangshou, Z_design, Z_check,
      Z_dam, Z_dam1, Z_dam2,
      delta_h_design, delta_h_check,
      V_total: z_to_v(Z_check),
      V_xing,
      V_fangshou: V_fangshou_capacity,
      V_jiehe,
      Q_design_max: fd.Q_design_max,
      Q_check_max: fd.Q_check_max,
      Np,
      N_ji_feng: inst.N_ji_feng,
      N_ji_ji: inst.N_ji_ji,
      N_ji: inst.N_ji,
      N_bei: inst.N_bei,
      N_bi,
      N_chong,
      N_y,
      E_avg,
      coef_xing,
      coef_tiao,
      eta,
      Q_dump_avg,
    });
  }
  return table;
}
