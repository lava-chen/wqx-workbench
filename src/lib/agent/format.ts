/**
 * Agent 数据层 — 中文数字/单位格式化
 *
 * 设计目标: LLM 看到的数字都是 "可直接引用的中文字面量",
 * 避免它自己脑补单位/精度.
 */

const CN_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function schemeCN(key: string): string {
  return `方案 ${key}`;
}

export function fmtLevel(v: number | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function fmtPower(v: number | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function fmtEnergy(v: number | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function fmtVolumeYi(v: number | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function fmtFlow(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(2)}×10³`;
  return v.toFixed(0);
}

export function fmtCost(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("zh-CN");
}

export function fmtPct(v: number | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return (v * 100).toFixed(digits) + "%";
}

export function fmtRatio(v: number | undefined, digits = 3): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

/** 用于表格: 不带单位, 只数字 */
export function num(v: number | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

/** 中文整数 (1..23) */
export function cnIndex(i: number): string {
  if (i < 0 || i > 99) return String(i);
  if (i < 10) return CN_DIGITS[i];
  if (i === 10) return "十";
  if (i < 20) return "十" + CN_DIGITS[i - 10];
  const t = Math.floor(i / 10);
  const o = i % 10;
  return CN_DIGITS[t] + "十" + (o ? CN_DIGITS[o] : "");
}
