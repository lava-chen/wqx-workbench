/**
 * 装机容量与必需容量计算 (任务书 p10 第四节)
 * N工基 = 10 万 kW (航运基荷)
 * N峰 = Np - 10 (万 kW)
 * N工峰 = 3.08 * N峰 + 7  (万 kW)
 * N工  = N工峰 + N工基   (工作容量, 万 kW)
 * N必  = N工 + N备       (N备: 30/25/20/15)
 */

import { RESERVE, SHIP_BASE } from './curves';

export interface InstalledResult {
  N_p: number;
  N_ji_ji: number;
  N_feng: number;
  N_ji_feng: number;
  N_ji: number;
  N_bei: number;
  N_bi: number;
}

/**
 * 计算装机容量与必需容量。
 *
 * @param N_p - 保证出力 (万 kW)
 * @param schemeKey - 方案编号 "I" / "II" / "III" / "IV"
 */
export function calcInstalled(N_p: number, schemeKey: string): InstalledResult {
  const N_ji_ji = SHIP_BASE; // 航运基荷 10 万 kW
  const N_feng = Math.max(0, N_p - SHIP_BASE); // 峰荷部分
  const N_ji_feng = 3.08 * N_feng + 7; // 峰荷工作容量
  const N_ji = N_ji_feng + N_ji_ji;
  const N_bei = RESERVE[schemeKey];
  const N_bi = N_ji + N_bei;

  return {
    N_p,
    N_ji_ji,
    N_feng,
    N_ji_feng,
    N_ji,
    N_bei,
    N_bi,
  };
}