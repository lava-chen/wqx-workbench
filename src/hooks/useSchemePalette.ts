"use client";

/**
 * 方案配色 + 动态方案列表
 * ─────────────────────────────────────────────────────────
 * 当用户在 useSchemes 里增删方案 (V/VI/VII/...) 时, 所有图表
 * 都会自动套色, 无需在每个组件里再写一遍 4 方案的硬编码。
 *
 * 调色板参考 D3 Category10 / Tailwind 主色混合, 视觉上对
 * 4~8 方案都能区分清楚, > 8 方案时循环使用对比鲜明的色对。
 */

import { useMemo } from "react";
import { useSchemes } from "./useSchemes";

// 12 色 + 高对比备选 (HSL 等距 + Tailwind 强色)
const PALETTE: readonly string[] = [
  "#1F77B4", // 蓝
  "#D62728", // 红
  "#2CA02C", // 绿
  "#FF7F0E", // 橙
  "#9467BD", // 紫
  "#8C564B", // 棕
  "#E377C2", // 粉
  "#7F7F7F", // 灰
  "#17BECF", // 青
  "#BCBD22", // 橄榄
  "#AEC7E8", // 浅蓝
  "#FFBB78", // 浅橙
];

/** 兜底 (兼容原有 4 方案命名: I/II/III/IV) */
const DEFAULT_FALLBACK: Record<string, string> = {
  I: "#1F77B4",
  II: "#2CA02C",
  III: "#FF7F0E",
  IV: "#D62728",
};

export function getSchemeColor(schemeId: string, index: number): string {
  return PALETTE[index % PALETTE.length] ?? DEFAULT_FALLBACK[schemeId] ?? "#888";
}

/**
 * Hook: 取当前方案列表 + 颜色映射 + 中文标签
 * - schemes       实际方案 id 数组
 * - colorById     id → 色值
 * - labelById     id → "方案 X" 显示名
 * - colorList     与 schemes 等长的色值数组
 */
export function useSchemePalette() {
  const { schemes } = useSchemes();

  return useMemo(() => {
    const ids = schemes.map((s) => s.id);
    const colorById: Record<string, string> = {};
    const labelById: Record<string, string> = {};
    const colorList: string[] = [];
    ids.forEach((id, i) => {
      const c = getSchemeColor(id, i);
      colorById[id] = c;
      labelById[id] = `方案 ${id}`;
      colorList.push(c);
    });
    return { schemes: ids, colorById, labelById, colorList };
  }, [schemes]);
}
