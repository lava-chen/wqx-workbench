/**
 * 差积曲线法水量调节模块 (课件算法直译, 仅单年)。
 *
 * 两类任务，程序实现分为两个函数，不要合并：
 * 1. 已知调节流量 q，求单年所需兴利库容 V_兴 与控制供水期
 *    差积曲线最大下降段：
 *        W_t = Σ_{k=1..t} (Q_k - q) Δt
 *        V_兴 = max_{i<j} (W_i - W_j)
 *        控制供水期 = 取得最大落差对应的 (i, j) 区间
 * 2. 已知兴利库容 V_兴，求单年最大可保证均匀调节流量 q_year 与控制供水期
 *    所有可能供水期枚举 + 最严约束：
 *        对任意连续区间 [i, j]:
 *            q_{i:j} = (Σ_{k=i..j} Q_k Δt + V_兴) / ((j-i+1) Δt)
 *        全年所有可能供水期都不能破坏，故 q_year = min_{i≤j} q_{i:j}
 *
 * 单位约定：内部统一使用 (m³/s)·时段。月度计算 dt=1。
 * 与库容曲线 (亿 m³) 交互通过 DT_TO_YI / DT_FROM_YI 换算。
 */

import { DT_TO_YI, DT_FROM_YI } from './curves';

// ============================================================
// 类型定义
// ============================================================

export interface DifferenceCurveResult {
  net: number[];
  W: number[];
}

export interface StorageRequiredResult {
  q: number;
  V_required_msm: number;
  V_required_yi: number;
  control_start_month: number | null;
  control_end_month: number | null;
  control_length: number;
  peak_idx: number | null;
  valley_idx: number | null;
  net: number[];
  W: number[];
}

export interface QYearForStorageResult {
  V_xing_msm: number;
  V_xing_yi: number;
  q_year: number;
  control_start_month: number;
  control_end_month: number;
  control_length: number;
  W_supply_msm: number;
  W_supply_yi: number;
  T_supply: number;
  start_idx: number;
  end_idx: number;
}

// ============================================================
// 内部校验
// ============================================================

function validateSeries(Q: number[], months: number[]): void {
  if (Q.length === 0) {
    throw new Error('Q 不能为空。');
  }
  if (Q.length !== months.length) {
    throw new Error(`Q 与 months 长度不一致: ${Q.length} !== ${months.length}。`);
  }
}

// ============================================================
// 差积曲线基础
// ============================================================

/**
 * 差积曲线 W_t = Σ_{k=1..t} (Q_k - q) Δt。
 *
 * 物理意义：从起算时刻到 t 时刻，累计 (来水 - 需水) × 时长 的水量盈亏。
 * Q ≥ q 时 W 上升，Q < q 时 W 下降。
 */
export function differenceCurve(
  Q: number[],
  q: number,
  dt: number = 1.0,
): DifferenceCurveResult {
  validateSeries(Q, Q.map((_, i) => i)); // only check length, months placeholder
  const n = Q.length;
  const net: number[] = new Array(n);
  const W: number[] = new Array(n + 1);
  W[0] = 0.0;

  for (let t = 0; t < n; t++) {
    net[t] = (Q[t] - q) * dt;
    W[t + 1] = W[t] + net[t];
  }

  return { net, W };
}

// ============================================================
// 单年 q -> V (差积曲线最大下降段)
// ============================================================

/**
 * 已知调节流量 q，求单年所需兴利库容与控制供水期。
 *
 * 算法：差积曲线最大下降段。
 *     V_兴 = max_{i<j} (W_i - W_j)
 * 控制供水期 = months[peak_idx : valley_idx]。
 */
export function storageRequiredForQYear(
  Q: number[],
  months: number[],
  q: number,
  dt: number = 1.0,
): StorageRequiredResult {
  validateSeries(Q, months);

  const dc = differenceCurve(Q, q, dt);
  const W = dc.W;

  let bestV = 0.0;
  let peakIdx: number | null = null;
  let valleyIdx: number | null = null;

  for (let i = 0; i < W.length; i++) {
    for (let j = i + 1; j < W.length; j++) {
      const drawdown = W[i] - W[j];
      if (drawdown > bestV) {
        bestV = drawdown;
        peakIdx = i;
        valleyIdx = j;
      }
    }
  }

  if (peakIdx === null || valleyIdx === null) {
    return {
      q,
      V_required_msm: 0.0,
      V_required_yi: 0.0,
      control_start_month: null,
      control_end_month: null,
      control_length: 0,
      peak_idx: null,
      valley_idx: null,
      net: dc.net,
      W: dc.W,
    };
  }

  const controlMonths = months.slice(peakIdx, valleyIdx);

  return {
    q,
    V_required_msm: bestV,
    V_required_yi: bestV * DT_TO_YI,
    control_start_month: controlMonths[0],
    control_end_month: controlMonths[controlMonths.length - 1],
    control_length: controlMonths.length,
    peak_idx: peakIdx,
    valley_idx: valleyIdx,
    net: dc.net,
    W: dc.W,
  };
}

// ============================================================
// 单年 V -> q (所有可能供水期枚举 + 最严约束)
// ============================================================

/**
 * 已知兴利库容 V_兴，求单年最大可保证均匀调节流量与控制供水期。
 *
 * 算法：枚举所有连续供水区间 [i, j]，对每个区间
 *     q_{i:j} = (Σ_{k=i..j} Q_k Δt + V_兴) / ((j-i+1) Δt)
 * 全年所有可能供水期都不能破坏，故 q_year = min_{i≤j} q_{i:j}。
 */
export function qYearForStorage(
  Q: number[],
  months: number[],
  V_xing_msm: number,
  dt: number = 1.0,
): QYearForStorageResult {
  validateSeries(Q, months);

  let bestQ = Infinity;
  let bestRecord: Omit<QYearForStorageResult, 'V_xing_msm' | 'V_xing_yi'> | null = null;

  for (let i = 0; i < Q.length; i++) {
    let cumQ = 0.0;
    for (let j = i; j < Q.length; j++) {
      cumQ += Q[j];
      const T_supply = (j - i + 1) * dt;
      const W_supply = cumQ * dt;
      const qLimit = (W_supply + V_xing_msm) / T_supply;
      if (qLimit < bestQ) {
        bestQ = qLimit;
        bestRecord = {
          q_year: qLimit,
          control_start_month: months[i],
          control_end_month: months[j],
          control_length: j - i + 1,
          W_supply_msm: W_supply,
          W_supply_yi: W_supply * DT_TO_YI,
          T_supply,
          start_idx: i,
          end_idx: j,
        };
      }
    }
  }

  return {
    V_xing_msm,
    V_xing_yi: V_xing_msm * DT_TO_YI,
    ...bestRecord!,
  };
}

/**
 * qYearForStorage 的亿 m³ 包装，V_xing 单位为亿 m³。
 */
export function qYearForStorageYi(
  Q: number[],
  months: number[],
  V_xing_yi: number,
  dt: number = 1.0,
): QYearForStorageResult {
  const V_xing_msm = V_xing_yi * DT_FROM_YI;
  return qYearForStorage(Q, months, V_xing_msm, dt);
}