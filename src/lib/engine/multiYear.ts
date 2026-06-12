/**
 * 多年循环样板: 把 (years, monthly) 序列转成 year_items 列表，
 * 然后逐年调 diffCurve.qYearForStorageYi 收集 records，
 * 最后走 frequencyFit.selectByGuarantee 选 P 处的设计值。
 */

import { qYearForStorageYi, QYearForStorageResult } from './diffCurve';
import { selectByGuarantee } from './frequencyFit';
import { MONTH_ORDER, get_new_series } from './runoff';

export interface YearItem {
  year: number;
  Q: number[];
  months: number[];
}

/** 从 runoff 新序列构造 diffCurve 期望的 year_items */
export function buildYearItems(): YearItem[] {
  const { years, new_q } = get_new_series();
  const months = [...MONTH_ORDER];
  return years.map((y: number, i: number) => ({
    year: y,
    Q: [...new_q[i]],
    months,
  }));
}

export interface QpRecord extends QYearForStorageResult {
  year: number;
}

/** 对每个水文年调一次 qYearForStorageYi，返回 records 列表 */
export function qpRecordsForEachYear(
  yearItems: YearItem[],
  V_xing_yi: number,
): QpRecord[] {
  return yearItems.map((it) => ({
    year: it.year,
    ...qYearForStorageYi(it.Q, it.months, V_xing_yi),
  }));
}

export interface QpDesignResult {
  P: number;
  n_years: number;
  n_fail: number;
  design_value: number;
  design_record: QpRecord;
  records_sorted: QpRecord[];
  design_index: number;
}

/** 单次调用: 多年 V -> 设计 qp */
export function qpDesign(
  yearItems: YearItem[],
  V_xing_yi: number,
  P: number,
): QpDesignResult {
  const records = qpRecordsForEachYear(yearItems, V_xing_yi);
  return selectByGuarantee(records, 'q_year', P, 'small') as QpDesignResult;
}