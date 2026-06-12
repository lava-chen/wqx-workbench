/**
 * 死水位计算 (任务书 p8 第三节二)
 * 对每个方案:
 *   Z1 = v_to_z(50 年泥沙淤积量)   由 669万方/年 × 50 = 3.345 亿 m3
 *   Z2 = 82.00 m (综合利用)
 *   Z3 = Z正 - 0.35 * (Z正 - Z下), Z下 由最小发电流量 q_min 查下游 Z-q 曲线
 *   Z死 = max(Z1, Z2, Z3)
 */

import { SCHEMES, q_to_zd, v_to_z, z_to_v, NEW_SEDIMENT_50 } from './curves';
import { buildYearItems, qpDesign, YearItem } from './multiYear';

export interface IterRecord {
  iter: number;
  q_assume: number;
  Z_down: number;
  Z1_sediment: number;
  Z2_util: number;
  Z3_drawdown: number;
  Z_dead: number;
  V_xing: number;
  qp: number;
  error: number;
}

export interface DeadLevelResult {
  scheme: string;
  converged: boolean;
  iterations: number;
  Z_zheng: number;
  Z_dead: number;
  V_xing: number;
  q: number;
  Z1_sediment: number;
  Z2_util: number;
  Z3_drawdown: number;
  Z_down: number;
  history?: IterRecord[];
}

/**
 * 迭代计算死水位。
 *
 * @param schemeKey - 方案编号："I", "II", "III", "IV"
 * @param qInit - 初始假定发电流量 (m3/s)，只是迭代初值
 * @param P - 发电设计保证率，默认 0.875
 * @param eps - 收敛精度 (m3/s)，任务书要求 eps < 1 m3/s
 * @param maxIter - 最大迭代次数
 * @param returnHistory - 是否返回迭代日志
 */
export function computeDeadLevel(
  schemeKey: string,
  qInit: number = 800.0,
  P: number = 0.875,
  eps: number = 1.0,
  maxIter: number = 30,
  returnHistory: boolean = true,
): DeadLevelResult {
  const Z_zheng = SCHEMES[schemeKey].Z_zheng;

  // 泥沙淤积死水位
  const Z1 = v_to_z(NEW_SEDIMENT_50 / 1e8);

  // 综合利用最低水位
  const Z2 = 82.0;

  let q = qInit;
  const history: IterRecord[] = [];
  const yearItems: YearItem[] = buildYearItems(); // 提到循环外，避免每轮重读数据

  for (let it = 1; it <= maxIter; it++) {
    // 由假定 q 查下游水位
    const Z_down = q_to_zd(q);

    // 消落深度不大于最大水头的 35%
    const Z3 = Z_zheng - 0.35 * (Z_zheng - Z_down);

    // 本轮死水位
    const Z_dead = Math.max(Z1, Z2, Z3);

    // 本轮兴利库容
    const V_xing = z_to_v(Z_zheng) - z_to_v(Z_dead);

    // 据本轮兴利库容，长系列反求设计调节流量 qp
    const qpSel = qpDesign(yearItems, V_xing, P);
    const qp = qpSel.design_value;

    const err = Math.abs(q - qp);

    const record: IterRecord = {
      iter: it,
      q_assume: q,
      Z_down,
      Z1_sediment: Z1,
      Z2_util: Z2,
      Z3_drawdown: Z3,
      Z_dead,
      V_xing,
      qp,
      error: err,
    };
    history.push(record);

    if (err < eps) {
      const result: DeadLevelResult = {
        scheme: schemeKey,
        converged: true,
        iterations: it,
        Z_zheng,
        Z_dead,
        V_xing,
        q: qp,
        Z1_sediment: Z1,
        Z2_util: Z2,
        Z3_drawdown: Z3,
        Z_down,
      };
      if (returnHistory) {
        result.history = history;
      }
      return result;
    }

    // 不收敛，用 qp 作为下一轮假定流量
    q = qp;
  }

  // maxIter 仍未收敛，抛异常
  const lastQ = q;
  const lastErr = history.length > 0 ? history[history.length - 1].error : 0;
  throw new Error(
    `computeDeadLevel 方案 ${schemeKey} ${maxIter} 次迭代未收敛, ` +
    `末次误差 ${lastErr.toFixed(2)} m³/s >= eps=${eps}. 检查 V_兴 计算与差积曲线模块.`
  );
}