/**
 * 水库特性曲线与方案参数 (内联数据, 无外部依赖)
 * 来源: 任务书表 2 (Z-V)、表 3 (Z-q 下游)、表 7 (泄洪建筑)、表 8-11 (经济)
 */

import { YEARS, RAW_MONTHLY } from "./runoff";
// 重新导出, 保持向后兼容
export { YEARS, RAW_MONTHLY };

// ============================================================
// 1. 水位-库容曲线 (任务书表 2)
// ============================================================
// 水位-库容曲线 (任务书表 2)
// 高程 m, 容积 亿m3, 容积 m3/s·月
//
// 注意: 用 `let` 而非 `const`, 因为 useDataset 支持用户在 UI 中编辑
// 这些数据并写回 engine. ESM live binding 允许下游 `import { Z_V_TABLE }`
// 在 push/清空操作后看到最新值 (这是数组引用的特性).
export const Z_V_TABLE: [number, number, number][] = [
  [50, 0, 0],
  [60, 0.241, 9.175],
  [70, 1.592, 60.65],
  [80, 4.521, 172.13],
  [90, 9.692, 369.0],
  [100, 18.49, 703.96],
  [110, 33.346, 1269.57],
  [120, 57.349, 2183.43],
  [130, 95.058, 3619.11],
  [140, 151.578, 5770.97],
];

// 插值用的扁平数组 — 每次都从 Z_V_TABLE 重新派生,
// 保证 useDataset 改写后立即生效 (数组很短, 10 行, 性能可忽略)
function zArrays() {
  return {
    Z_ARR: Z_V_TABLE.map(r => r[0]),
    V_YI: Z_V_TABLE.map(r => r[1]),
    V_MSM: Z_V_TABLE.map(r => r[2]),
  };
}

// 线性插值工具
function lerpArr(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  for (let i = 0; i < n - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] + t * (ys[i + 1] - ys[i]);
    }
  }
  return NaN;
}

export function z_to_v(z: number): number {
  const a = zArrays();
  return lerpArr(a.Z_ARR, a.V_YI, z);
}

export function v_to_z(v: number): number {
  const a = zArrays();
  return lerpArr(a.V_YI, a.Z_ARR, v);
}

export function z_to_v_msm(z: number): number {
  const a = zArrays();
  return lerpArr(a.Z_ARR, a.V_MSM, z);
}

export function v_to_msm(v: number): number {
  const z = v_to_z(v);
  return z_to_v_msm(z);
}

// ============================================================
// 2. 下游水位-流量关系 (任务书表 3)
// ============================================================
export const Z_Q_TABLE: [number, number][] = [
  [48.5, 204], [49.0, 350], [49.5, 545], [50.0, 795], [50.5, 1120],
  [51.0, 1490], [51.5, 1900], [52.0, 2350], [52.5, 2820], [53.0, 3320],
  [53.5, 3360], [54.0, 4420], [54.5, 5040], [55.0, 5720], [55.5, 6450],
  [56.0, 7200], [56.5, 7950], [57.0, 8700], [57.5, 9470], [58.0, 10300],
  [59.0, 12000], [60.0, 13700], [61.0, 15600], [62.0, 17500], [63.0, 19300],
  [64.0, 21200], [65.0, 23200], [66.0, 25200], [67.0, 27200], [68.0, 29300],
  [69.0, 31600], [70.0, 33800], [71.0, 36000], [72.0, 38300], [73.0, 40300],
  [74.0, 43400],
];

function zqArrays() {
  return {
    Z: Z_Q_TABLE.map(r => r[0]),
    Q: Z_Q_TABLE.map(r => r[1]),
  };
}

export function q_to_zd(q: number): number {
  const a = zqArrays();
  return lerpArr(a.Q, a.Z, q);
}

export function zd_to_q(zd: number): number {
  const a = zqArrays();
  return lerpArr(a.Z, a.Q, zd);
}

// ============================================================
// 3. 四个方案 (正常蓄水位)
// ============================================================
export interface SchemeConfig {
  Z_zheng: number;
  H_dam_max: number;
}

export const SCHEMES: Record<string, SchemeConfig> = {
  I: { Z_zheng: 120, H_dam_max: 104 },
  II: { Z_zheng: 115, H_dam_max: 94.5 },
  III: { Z_zheng: 108, H_dam_max: 87.5 },
  IV: { Z_zheng: 100, H_dam_max: 78.5 },
};

// ============================================================
// 4. 泄洪建筑 (任务书表 7)
// ============================================================
export interface SpillwayConfig {
  spill_n: number;
  spill_crest: number;
  spill_b: number;
  spill_h: number;
  mid_n: number;
  mid_sill: number;
  mid_b: number;
  mid_h: number;
}

export const SPILLWAY: Record<string, SpillwayConfig> = {
  I: { spill_n: 10, spill_crest: 108, spill_b: 15, spill_h: 12, mid_n: 1, mid_sill: 82, mid_b: 13, mid_h: 8 },
  II: { spill_n: 12, spill_crest: 101, spill_b: 15, spill_h: 14, mid_n: 1, mid_sill: 82, mid_b: 13, mid_h: 8 },
  III: { spill_n: 12, spill_crest: 94, spill_b: 15, spill_h: 14, mid_n: 1, mid_sill: 82, mid_b: 13, mid_h: 8 },
  IV: { spill_n: 14, spill_crest: 84, spill_b: 15, spill_h: 16, mid_n: 0, mid_sill: 0, mid_b: 0, mid_h: 0 },
};

export function discharge_capacity(z: number, scheme: string = "I"): number {
  const s = SPILLWAY[scheme];
  let q = 0;
  // 溢洪坝: Q = 1.77 * n * B * H^(3/2)
  const H = z - s.spill_crest;
  if (H > 0 && s.spill_n > 0) {
    q += 1.77 * s.spill_n * s.spill_b * Math.pow(H, 1.5);
  }
  // 中孔: Q = n * ω * μ * sqrt(2gH), μ = 0.99 - 0.53 * a/H
  if (s.mid_n > 0) {
    const H2 = z - s.mid_sill;
    if (H2 > 0) {
      const omega = s.mid_b * s.mid_h;
      let mu = 0.99 - 0.53 * s.mid_h / H2;
      mu = Math.max(mu, 0.3);
      q += s.mid_n * omega * mu * Math.sqrt(2 * 9.81 * H2);
    }
  }
  return q;
}

// ============================================================
// 5. 经济数据 (任务书表 8-11)
// ============================================================
export interface EconConfig {
  dam_invest: number;
  mech_invest: number;
  temp_invest: number;
  comp_invest: number;
  install_cap: number;
}

export const ECON: Record<string, EconConfig> = {
  I: { dam_invest: 61850, mech_invest: 28805, temp_invest: 71333, comp_invest: 80000, install_cap: 175 },
  II: { dam_invest: 56356, mech_invest: 27981, temp_invest: 65816, comp_invest: 57093, install_cap: 150 },
  III: { dam_invest: 53817, mech_invest: 25808, temp_invest: 62854, comp_invest: 38547, install_cap: 110 },
  IV: { dam_invest: 21019, mech_invest: 18190, temp_invest: 56028, comp_invest: 24989, install_cap: 92 },
};

export const HYDRAULIC_BUILD: Record<string, { cost: number; overhaul: number }> = {
  I: { cost: 55221, overhaul: 352.6 },
  II: { cost: 49459, overhaul: 319.0 },
  III: { cost: 47222, overhaul: 306.7 },
  IV: { cost: 41621, overhaul: 283.3 },
};

export const HOUSE_TRAFFIC: Record<string, { cost: number; overhaul: number }> = {
  I: { cost: 1771, overhaul: 17.7 },
  II: { cost: 1749, overhaul: 17.5 },
  III: { cost: 1737, overhaul: 17.4 },
  IV: { cost: 1702, overhaul: 17.1 },
};

export const MECH: Record<string, { install: number; cost: number; overhaul: number }> = {
  I: { install: 175, cost: 28805, overhaul: 489.7 },
  II: { install: 150, cost: 27981, overhaul: 477.0 },
  III: { install: 110, cost: 25808, overhaul: 441.0 },
  IV: { install: 92, cost: 21019, overhaul: 355.9 },
};

export const COMPENSATION: Record<string, { value: number; deduct: number }> = {
  I: { value: 80000, deduct: 1328.0 },
  II: { value: 57093, deduct: 974.7 },
  III: { value: 38547, deduct: 647.6 },
  IV: { value: 24989, deduct: 442.3 },
};

export const RUN_FACTOR: Record<string, number> = { I: 2.0, II: 2.0, III: 2.2, IV: 2.3 };
export const RESERVE: Record<string, number> = { I: 30, II: 25, III: 20, IV: 15 };

export interface FengtanLoss {
  N: number;
  E: number;
}

export const FENGTAN_LOSS: Record<string, FengtanLoss> = {
  I: { N: 0.284, E: 0.228 },
  II: { N: 0.02, E: 0.0 },
  III: { N: 0.0, E: 0.0 },
  IV: { N: 0.0, E: 0.0 },
};

// 投资分年比例 (11 年施工期)
export const INVEST_RATIO: Record<string, number[]> = {
  I: [0.127, 0.120, 0.081, 0.108, 0.070, 0.113, 0.145, 0.115, 0.097, 0.021, 0.003 - 0.204],
  II: [0.0, 0.125, 0.118, 0.085, 0.144, 0.054, 0.121, 0.133, 0.144, 0.053, 0.023 - 0.206],
  III: [0.0, 0.128, 0.118, 0.091, 0.130, 0.072, 0.124, 0.121, 0.107, 0.055, 0.054 - 0.209],
  IV: [0.0, 0.131, 0.125, 0.096, 0.136, 0.073, 0.133, 0.148, 0.102, 0.045, 0.011 - 0.220],
};

export const COMP_RATIO_I = [0.125, 0.125, 0.167, 0.163, 0.163, 0.129, 0.128];
export const COMP_RATIO_II = [0.05, 0.10, 0.20, 0.25, 0.20, 0.20];
export const FIRE_INV_RATIO = [0, 0, 0.55, 0.40, 0.03, 0.02];
export const MINE_INV_RATIO = [0.16, 0.34, 0.35, 0.10, 0.05, 0];

// 折算率与寿命
// 注意: 用 `let` 而非 `const` — useDataset 在用户编辑"关键参数"卡片后
// 会直接对这些变量赋值, 进而让所有 `import { R0 }` 的下游模块看到新值
// (ESM live binding 对 `let` 导出是支持的).
export let R0 = 0.10;
export let T_BUILD = 11;
export let T_RUN = 50;
export let T_FIRE = 25;

// 替代指标
export let FIRE_KWH_COST = 750;  // 元/千瓦
export let MINE_KWH_COST = 0.07; // 元/度
export let FIRE_FUEL_COST = 0.02; // 元/度
export let FIRE_OP_FACTOR = 0.08;
export let FIRE_SCALE_CAP = 1.1;
export let FIRE_SCALE_E = 1.05;

// 经济利用小时
export let H_ECON = 2500;

// 设计参数
export let P_FLOOD_DOWN = 0.05;
export let P_DESIGN = 0.001;
export let P_CHECK = 0.0001;
export let Q_SAFE = 20000;
export let P_GEN = 0.875;
export let T_LIFE = 50;
export let SED_YEAR = 669e4;
export let IRRIG_Q = 35;
export let LOCK_Q = 10;
export const SHIP_BASE = 10;
export const NEW_SEDIMENT_50 = SED_YEAR * T_LIFE;
export let WIND_V = 12;
export let WIND_D = 15;
export let SAFETY_1 = 0.7;
export let SAFETY_2 = 0.5;

/**
 * 批量赋值入口 (供 useDataset 写回使用)
 * ─────────────────────────────────────────────────────────
 * 在 ESM 模式下, 外部模块无法直接对 `let` 导出做赋值 (TypeScript
 * "Cannot assign to import" + 运行时 ESM live binding 也不支持).
 * 这里提供单一函数, 在本模块内部完成赋值, 外部只需调用 setScalars().
 * 然后所有 `import { Q_SAFE }` 的下游会通过 ESM live binding 看到新值.
 */
export function setScalars(s: {
  Q_SAFE?: number;
  R0?: number;
  T_BUILD?: number;
  T_RUN?: number;
  T_FIRE?: number;
  T_LIFE?: number;
  H_ECON?: number;
  P_FLOOD_DOWN?: number;
  P_DESIGN?: number;
  P_CHECK?: number;
  P_GEN?: number;
  IRRIG_Q?: number;
  LOCK_Q?: number;
  SED_YEAR?: number;
  WIND_V?: number;
  WIND_D?: number;
  SAFETY_1?: number;
  SAFETY_2?: number;
  FIRE_KWH_COST?: number;
  MINE_KWH_COST?: number;
  FIRE_FUEL_COST?: number;
  FIRE_OP_FACTOR?: number;
  FIRE_SCALE_CAP?: number;
  FIRE_SCALE_E?: number;
}): void {
  if (s.Q_SAFE !== undefined) Q_SAFE = s.Q_SAFE;
  if (s.R0 !== undefined) R0 = s.R0;
  if (s.T_BUILD !== undefined) T_BUILD = s.T_BUILD;
  if (s.T_RUN !== undefined) T_RUN = s.T_RUN;
  if (s.T_FIRE !== undefined) T_FIRE = s.T_FIRE;
  if (s.T_LIFE !== undefined) T_LIFE = s.T_LIFE;
  if (s.H_ECON !== undefined) H_ECON = s.H_ECON;
  if (s.P_FLOOD_DOWN !== undefined) P_FLOOD_DOWN = s.P_FLOOD_DOWN;
  if (s.P_DESIGN !== undefined) P_DESIGN = s.P_DESIGN;
  if (s.P_CHECK !== undefined) P_CHECK = s.P_CHECK;
  if (s.P_GEN !== undefined) P_GEN = s.P_GEN;
  if (s.IRRIG_Q !== undefined) IRRIG_Q = s.IRRIG_Q;
  if (s.LOCK_Q !== undefined) LOCK_Q = s.LOCK_Q;
  if (s.SED_YEAR !== undefined) SED_YEAR = s.SED_YEAR;
  if (s.WIND_V !== undefined) WIND_V = s.WIND_V;
  if (s.WIND_D !== undefined) WIND_D = s.WIND_D;
  if (s.SAFETY_1 !== undefined) SAFETY_1 = s.SAFETY_1;
  if (s.SAFETY_2 !== undefined) SAFETY_2 = s.SAFETY_2;
  if (s.FIRE_KWH_COST !== undefined) FIRE_KWH_COST = s.FIRE_KWH_COST;
  if (s.MINE_KWH_COST !== undefined) MINE_KWH_COST = s.MINE_KWH_COST;
  if (s.FIRE_FUEL_COST !== undefined) FIRE_FUEL_COST = s.FIRE_FUEL_COST;
  if (s.FIRE_OP_FACTOR !== undefined) FIRE_OP_FACTOR = s.FIRE_OP_FACTOR;
  if (s.FIRE_SCALE_CAP !== undefined) FIRE_SCALE_CAP = s.FIRE_SCALE_CAP;
  if (s.FIRE_SCALE_E !== undefined) FIRE_SCALE_E = s.FIRE_SCALE_E;
}

// ============================================================
// 6. 出力计算与单位换算常量
// ============================================================
export const K = 8.5;             // 出力系数
export const DELTA_H = 1.0;       // 水头损失 m
export const N_SCALE = 1e4;       // 出力换算: N(W) = K*q*H / N_SCALE 得万 kW
export const DT_MONTH_SEC = 30.4 * 86400;  // 月秒数
export const DT_TO_YI = DT_MONTH_SEC / 1e8;  // m3 -> 亿 m3
export const DT_FROM_YI = 1.0 / DT_TO_YI;    // 亿 m3 -> m3·s·单位
export const MONTH_HOURS = 30.4 * 24;        // 月小时数

// ============================================================
// 7. 径流数据 — 月份序与原始序列 (内联 DATA.DAT)
// ============================================================
export const MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
export const IRRIG_MONTHS = new Set([5, 6, 7, 8, 9]);

// 原始径流序列: 31 个水文年 (1950-1980), 每月流量 m3/s
// 列序对应 MONTH_ORDER: [4,5,6,7,8,9,10,11,12,1,2,3] 月
const RAW_RUNOFF: number[][] = [
  [1050, 2370, 5620, 7910, 3810, 4200, 3610, 2410, 1180, 1120, 791, 894],
  [1950, 3840, 6640, 3650, 4530, 3320, 1680, 1290, 1040, 1170, 916, 861],
  [1730, 4940, 5040, 7940, 4670, 3570, 2870, 3270, 2000, 1730, 1190, 1090],
  [2570, 3930, 9800, 6530, 3260, 8690, 5360, 2530, 1810, 1530, 1090, 1290],
  [1720, 4640, 3720, 5970, 7010, 6080, 2780, 1170, 742, 717, 697, 592],
  [1350, 5830, 4330, 4190, 5730, 3910, 3840, 3970, 2000, 1370, 1070, 1120],
  [1020, 2220, 2490, 1580, 2360, 2740, 1080, 1070, 906, 768, 644, 611],
  [1150, 3030, 2510, 4300, 2590, 6100, 5950, 3310, 1030, 795, 737, 615],
  [1420, 2930, 2200, 850, 2020, 2300, 4840, 2690, 1160, 1000, 791, 822],
  [1150, 2490, 8330, 2860, 3500, 1920, 1320, 949, 1010, 979, 776, 683],
  [1060, 4050, 3490, 3800, 1430, 4870, 2890, 1030, 946, 791, 663, 747],
  [1160, 1720, 2490, 1830, 1610, 5490, 1760, 2600, 1370, 920, 775, 916],
  [1780, 2420, 5990, 4090, 2290, 3280, 3460, 1840, 1710, 1180, 873, 928],
  [1900, 6050, 2000, 2400, 2790, 3040, 7120, 2360, 1610, 1240, 989, 1030],
  [1030, 2360, 2150, 4230, 3410, 2890, 1980, 1260, 1020, 1190, 777, 826],
  [767, 2200, 7310, 2770, 2590, 2300, 1130, 851, 795, 694, 597, 577],
  [810, 2010, 3380, 2600, 4830, 5960, 3770, 5040, 2440, 1550, 1060, 1020],
  [949, 1950, 1150, 1680, 3360, 3810, 3310, 3280, 2060, 1970, 1490, 1440],
  [809, 4960, 5510, 4540, 4400, 6880, 2900, 3910, 2240, 1310, 958, 1050],
  [1580, 2660, 2520, 6390, 4300, 5040, 3180, 2560, 1430, 1270, 976, 965],
  [1480, 1280, 1930, 4550, 4080, 3360, 3360, 4800, 3990, 1870, 1260, 1220],
  [1830, 2240, 2110, 4680, 3900, 3740, 5590, 4150, 4320, 3350, 1710, 1790],
  [1760, 3340, 2240, 630, 2860, 1160, 3680, 1120, 1010, 1000, 801, 1000],
  [1440, 2180, 5890, 5190, 9100, 6120, 4320, 3140, 1890, 1480, 1140, 1200],
  [938, 1420, 2280, 4280, 2260, 1740, 2440, 1490, 1080, 877, 721, 808],
  [968, 1720, 2950, 3440, 1740, 1320, 871, 662, 687, 638, 541, 613],
  [1460, 1270, 1440, 1020, 2270, 918, 450, 470, 524, 470, 477, 471],
  [886, 1610, 1170, 1590, 3520, 1470, 1110, 875, 737, 717, 569, 590],
  [1180, 3130, 2770, 3760, 3910, 2070, 1750, 1290, 993, 903, 717, 752],
  [1390, 1710, 3120, 2260, 3160, 3240, 2880, 2690, 2050, 1550, 1210, 1190],
  [1420, 4010, 6460, 6400, 3750, 1670, 2490, 895, 661, 735, 630, 635],
];

export function get_new_series(): { years: number[]; Q_series: number[][] } {
  const years: number[] = [];
  const Q_series: number[][] = [];
  // 第 24 行 (索引 23) 文件缺(数据质量),用前一年数据插补
  for (let i = 0; i < RAW_RUNOFF.length; i++) {
    years.push(1950 + i);
    const row = [...RAW_RUNOFF[i]];
    for (let k = 0; k < 12; k++) {
      const m = MONTH_ORDER[k];
      const deduct = LOCK_Q + (IRRIG_MONTHS.has(m) ? IRRIG_Q : 0);
      row[k] -= deduct;
    }
    Q_series.push(row);
  }
  return { years, Q_series };
}

// 多年平均流量 (缓存) — 缓存键与 YEARS.length 绑定, 径流改写后自动失效
let _Q_AVG_MS: number | null = null;
let _Q_AVG_KEY = -1;
export function get_Q_AVG_MS(): number {
  // YEARS 长度变化 (用户改写径流) → 重新计算
  if (_Q_AVG_MS === null || _Q_AVG_KEY !== YEARS.length) {
    const { Q_series } = get_new_series();
    let sum = 0;
    let count = 0;
    for (const row of Q_series) {
      for (const v of row) { sum += v; count++; }
    }
    _Q_AVG_MS = sum / count;
    _Q_AVG_KEY = YEARS.length;
  }
  return _Q_AVG_MS;
}

export function get_ANNUAL_RUNOFF_YI(): number {
  return get_Q_AVG_MS() * 30.4 * 86400 / 1e8 * 12;
}

// ============================================================
// 8. 差积曲线 — 已知 V_兴 求单年最大可保证均匀调节流量 q_year
// ============================================================
export interface QpRecord {
  year: number;
  q_year: number;
  control_start_month: number;
  control_end_month: number;
  control_length: number;
  start_idx: number;
  end_idx: number;
  W_supply_msm: number;
}

export function q_year_for_storage_yi(
  Q: number[],
  months: number[],
  V_xing_yi: number,
): QpRecord {
  const V_xing_msm = V_xing_yi * DT_FROM_YI;
  let best_q = Infinity;
  let best: QpRecord = {
    year: 0, q_year: 0, control_start_month: 0, control_end_month: 0,
    control_length: 0, start_idx: 0, end_idx: 0, W_supply_msm: 0,
  };

  for (let i = 0; i < Q.length; i++) {
    let cumQ = 0;
    for (let j = i; j < Q.length; j++) {
      cumQ += Q[j];
      const T_supply = (j - i + 1);
      const W_supply = cumQ;
      const q_limit = (W_supply + V_xing_msm) / T_supply;
      if (q_limit < best_q) {
        best_q = q_limit;
        best = {
          year: 0,
          q_year: q_limit,
          control_start_month: months[i],
          control_end_month: months[j],
          control_length: j - i + 1,
          start_idx: i,
          end_idx: j,
          W_supply_msm: W_supply,
        };
      }
    }
  }
  return best;
}

// ============================================================
// 9. 多年循环 — build_year_items + qp_records_for_each_year
// ============================================================
export interface YearItem {
  year: number;
  Q: number[];
  months: number[];
}

export function build_year_items(): YearItem[] {
  const { years, Q_series } = get_new_series();
  return years.map((y, i) => ({ year: y, Q: [...Q_series[i]], months: [...MONTH_ORDER] }));
}

export function qp_records_for_each_year(
  year_items: YearItem[],
  V_xing_yi: number,
): QpRecord[] {
  return year_items.map((it) => ({
    ...q_year_for_storage_yi(it.Q, it.months, V_xing_yi),
  }));
}

// ============================================================
// 10. 洪水过程线数据 (内联, 替代 FLOOD_FILES 文件读取)
// ============================================================
// P=5% (20年一遇)
const FLOOD_20Y: number[] = [
  1430, 1580, 1840, 2140, 2570, 3160, 3900, 5300, 7600, 11000, 15000, 19200,
  21500, 21700, 21000, 19500, 18000, 16400, 14900, 13500, 12200, 11200, 10200,
  9500, 8900, 8400, 7900, 7450, 7050, 6700, 6400, 6100, 5800, 5550, 5300,
  5050, 4820, 4620, 4420, 4250, 4080, 3930, 3780, 3650, 3520, 3400, 3280,
  3170, 3070, 2970, 2880, 2790, 2700, 2620, 2550, 2480, 2410, 2350, 2290,
  2240, 2190, 2140, 2100, 2060, 2020, 1980, 1940, 1910, 1880, 1850, 1820,
  1790, 1760, 1740, 1710, 1690, 1670, 1650, 1630, 1610, 1590, 1580];
// P=0.1% (1000年一遇)
const FLOOD_1000Y: number[] = [
  1600, 1800, 2150, 2520, 3020, 3810, 4850, 6600, 9900, 14500, 20500, 25300,
  28200, 28600, 27500, 25500, 23500, 21500, 19600, 17800, 16200, 14800, 13600,
  12500, 11600, 10900, 10200, 9650, 9150, 8700, 8300, 7950, 7600, 7300, 7000,
  6750, 6500, 6250, 6050, 5850, 5650, 5450, 5300, 5150, 5000, 4850, 4720,
  4580, 4450, 4350, 4250, 4150, 4050, 3950, 3850, 3750, 3650, 3550, 3450,
  3350, 3250, 3150, 3050, 2950, 2860, 2780, 2700, 2620, 2550, 2480, 2410,
  2350, 2290, 2240, 2190, 2140, 2100, 2070, 2040, 2010, 1980, 1950];
// P=0.01% (10000年一遇)
const FLOOD_10000Y: number[] = [
  1720, 1940, 2300, 2750, 3350, 4260, 5450, 7550, 12200, 17500, 24800, 31500,
  35000, 36000, 35500, 34000, 31800, 29500, 27000, 24500, 22200, 20200, 18400,
  16800, 15400, 14300, 13300, 12400, 11700, 11100, 10500, 10000, 9550, 9150,
  8800, 8450, 8150, 7850, 7600, 7350, 7100, 6900, 6700, 6500, 6300, 6150,
  6000, 5850, 5700, 5580, 5450, 5350, 5250, 5150, 5050, 4950, 4850, 4750,
  4650, 4550, 4450, 4350, 4250, 4150, 4050, 3960, 3870, 3780, 3690, 3600,
  3520, 3440, 3360, 3290, 3220, 3150, 3080, 3020, 2980, 2930, 2890, 2850, 2810];

export const FLOOD_DATA: Record<string, number[]> = {
  "P=5% (20年)": FLOOD_20Y,
  "P=0.1% (1000年)": FLOOD_1000Y,
  "P=0.01% (10000年)": FLOOD_10000Y,
};

/**
 * 批量写回 FLOOD_DATA (供 useDataset 编辑洪水过程后调用)
 * 与 setScalars / setRunoff 同样的设计: 在本模块内完成赋值.
 */
export function setFloods(floods: Record<string, number[]>): void {
  for (const k of Object.keys(FLOOD_DATA)) delete FLOOD_DATA[k];
  for (const k of Object.keys(floods)) {
    FLOOD_DATA[k] = [...floods[k]];
  }
}

/**
 * 写回 Z-V 曲线 (水位-库容关系)
 */
export function setZvTable(rows: [number, number, number][]): void {
  Z_V_TABLE.length = 0;
  for (const row of rows) Z_V_TABLE.push([row[0], row[1], row[2]]);
}

/**
 * 写回 Z-Q 曲线 (下游水位-流量关系)
 */
export function setZqTable(rows: [number, number][]): void {
  Z_Q_TABLE.length = 0;
  for (const row of rows) Z_Q_TABLE.push([row[0], row[1]]);
}