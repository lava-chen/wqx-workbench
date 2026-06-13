/**
 * 水利计算引擎 — 统一导出
 * 全部 TypeScript 实现，零 Python 依赖，浏览器端直接运行
 * 注意：引擎内部使用 snake_case 命名（与 Python 源码一致），此处统一重新导出
 */

// 基础数据与插值 (curves.ts)
export {
  Z_V_TABLE, Z_Q_TABLE,
  z_to_v, v_to_z, z_to_v_msm, v_to_msm,
  q_to_zd, zd_to_q,
  SCHEMES, SPILLWAY, discharge_capacity,
  ECON, HYDRAULIC_BUILD, HOUSE_TRAFFIC, MECH, COMPENSATION,
  RUN_FACTOR, RESERVE, FENGTAN_LOSS,
  INVEST_RATIO, COMP_RATIO_I, COMP_RATIO_II,
  FIRE_INV_RATIO, MINE_INV_RATIO,
  R0, T_BUILD, T_RUN, T_FIRE,
  FIRE_KWH_COST, MINE_KWH_COST, FIRE_FUEL_COST,
  FIRE_OP_FACTOR, FIRE_SCALE_CAP, FIRE_SCALE_E,
  H_ECON, P_FLOOD_DOWN, P_DESIGN, P_CHECK, Q_SAFE, P_GEN,
  T_LIFE, SED_YEAR, IRRIG_Q, LOCK_Q, SHIP_BASE,
  NEW_SEDIMENT_50, WIND_V, WIND_D, SAFETY_1, SAFETY_2,
  K, DELTA_H, N_SCALE, DT_MONTH_SEC, DT_TO_YI, DT_FROM_YI, MONTH_HOURS,
  MONTH_ORDER, IRRIG_MONTHS,
  FLOOD_DATA,
  setFloods,
  setZvTable, setZqTable,
  get_new_series, get_Q_AVG_MS, get_ANNUAL_RUNOFF_YI,
  q_year_for_storage_yi, build_year_items, qp_records_for_each_year,
  setScalars,
} from './curves';
export type { SchemeConfig, SpillwayConfig, EconConfig, FengtanLoss, QpRecord, YearItem } from './curves';

// 径流 (runoff.ts)
export { YEARS, RAW_MONTHLY, load_runoff, get_new_series as getNewSeries, setRunoff } from './runoff';

// 差积曲线 (diffCurve.ts)
export { differenceCurve, storageRequiredForQYear, qYearForStorage } from './diffCurve';
export type { DifferenceCurveResult, StorageRequiredResult, QYearForStorageResult } from './diffCurve';

// 经验频率 (frequencyFit.ts)
export { empiricalFrequency, selectByGuarantee } from './frequencyFit';

// 多年循环 (multiYear.ts)
export { buildYearItems as buildYearItems2, qpRecordsForEachYear, qpDesign } from './multiYear';

// 死水位 (deadLevel.ts)
export { computeDeadLevel } from './deadLevel';
export type { IterRecord, DeadLevelResult } from './deadLevel';

// 保证出力 (firmPower.ts)
export { solveMonthQ, solveYearFirmPower, findNpForScheme } from './firmPower';
export type { MonthRow } from './firmPower';

// 装机容量 (installed.ts)
export { calcInstalled } from './installed';
export type { InstalledResult } from './installed';

// 调度图 (dispatch.ts)
export { backstep_one_month, backtrace_year, backtrace_year_full, compute_fangpo_line } from './dispatch';
export type { MonthStorage, FangpoResult } from './dispatch';

// 电能 (energy.ts)
export { simulate_long_series, find_repeat_capacity } from './energy';
// RepeatCapacityResult type not exported from energy.ts

// 调洪 (flood.ts)
export { load_flood, load_all_floods, flood_routing, check_water_balance, compute_fangshou_high, route_for_scheme, run_for_schemes } from './flood';
// FloodResult, SchemeFloodResult types not exported from flood.ts

// 汇总 (summary.ts)
export { wind_wave_height, build_table } from './summary';
export type { WaterDeps, FloodDeps } from './summary';

// 经济 (economic.ts)
export { get_yearly_invest, get_yearly_running, present_value_of_cashflow, annuity, compute_fangshou_benefit, economic_compare } from './economic';
export type { EconomicResult } from './economic';