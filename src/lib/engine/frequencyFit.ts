/**
 * 经验频率/保证率选择模块。
 *
 * 对应课件"实际年法": 设有 n 年资料、设计保证率 P，计算允许破坏年数
 * n_fail = round(n(1-P))，剔除不利方向的前 n_fail 年，取剩余序列第一个
 * (沿排序方向最小的不破坏值) 为设计值。
 *
 * - adverse="small": 值越小越不利，如可保证调节流量 q_year、保证出力 N_p
 * - adverse="large": 值越大越不利，如所需兴利库容 V_required、洪峰流量
 */

export type Adverse = 'small' | 'large';

export interface SelectByGuaranteeResult<T = Record<string, any>> {
  P: number;
  n_years: number;
  n_fail: number;
  design_value: number;
  design_record: T;
  records_sorted: T[];
  design_index: number;
}

/** Weibull 经验频率 P_m = m / (n + 1), m 取 1..n (从大到小排) */
export function empiricalFrequency(n: number, m: number): number {
  if (n <= 0) throw new Error('n 必须为正整数。');
  if (m < 1 || m > n) throw new Error(`m 应在 1..${n}, 实际为 ${m}。`);
  return m / (n + 1);
}

/**
 * 按设计保证率 P 从 records 中选出设计记录。
 *
 * 流程:
 *     n_fail = round(n(1-P))      // 允许破坏年数
 *     按 adverse 方向排序
 *     取排序后第 n_fail 个 (零基) 为设计记录
 *     即"剔除 n_fail 个不利年后，剩余序列里第一个"
 */
export function selectByGuarantee<T extends Record<string, any>>(
  records: T[],
  valueKey: string,
  P: number,
  adverse: Adverse,
): SelectByGuaranteeResult<T> {
  const n = records.length;
  if (n === 0) throw new Error('records 不能为空。');
  if (P <= 0 || P > 1) throw new Error(`P 应在 (0, 1], 实际为 ${P}。`);
  if (adverse !== 'small' && adverse !== 'large') {
    throw new Error(`adverse 应为 'small' 或 'large', 实际为 '${adverse}'。`);
  }

  const n_fail = Math.round(n * (1.0 - P));
  const idx = Math.min(Math.max(n_fail, 0), n - 1);

  const sortedRecords = [...records].sort((a, b) => {
    const va = a[valueKey] as number;
    const vb = b[valueKey] as number;
    return adverse === 'small' ? va - vb : vb - va;
  });

  const design = sortedRecords[idx];

  return {
    P,
    n_years: n,
    n_fail,
    design_value: design[valueKey] as number,
    design_record: design,
    records_sorted: sortedRecords,
    design_index: idx,
  };
}