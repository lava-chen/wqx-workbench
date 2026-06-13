"use client";

/**
 * 任务书原始数据集 (Dataset)
 * ─────────────────────────────────────────────────────────
 * 把"任务书给定的标量 + 径流 + 曲线 + 洪水"从 engine 常量抽出来,
 * 变成可在 UI 编辑、可导入 JSON、可导出、可持久化的运行时数据。
 *
 * 设计要点 (与 useSchemes 一致的"就地写回"模式):
 *  1. 模块加载时, 一次性给 engine 常量拍快照 (原始值)
 *  2. 用户编辑/导入后, 先把可改键复位到快照, 再应用新值
 *  3. engine 的 in-place mutation 是这里最省事的"全局变量写回"方式
 *  4. version 计数器在每次变更后 +1, 让 useAllResults 的 useMemo 感知重算
 *
 * 与 useParams 的关系:
 *   useParams 是"用户即时微调 (Q安 / r₀ / 蓄水位偏移)",
 *   useDataset 是"任务书原始数据集 (工程基线 + 自定义变更)";
 *   两者独立. useParams 走 state, 不会落库到 engine,
 *   useDataset 走 localStorage + 写回 engine, 是工程基线层.
 *
 * 与 useSchemes 的关系:
 *   useSchemes 接管 SCHEMES / SPILLWAY / ECON / RUN_FACTOR / RESERVE
 *   / HYDRAULIC_BUILD / MECH / HOUSE_TRAFFIC / COMPENSATION / FENGTAN_LOSS
 *   / INVEST_RATIO (方案级, 默认 4 个, 用户可增删)
 *   useDataset 不动这些; 两者并行, 各自管理自己的可改键.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Q_SAFE, R0, T_BUILD, T_RUN, T_FIRE, T_LIFE, H_ECON,
  P_FLOOD_DOWN, P_DESIGN, P_CHECK, P_GEN,
  IRRIG_Q, LOCK_Q, SED_YEAR, WIND_V, WIND_D,
  SAFETY_1, SAFETY_2,
  FIRE_KWH_COST, MINE_KWH_COST, FIRE_FUEL_COST,
  FIRE_OP_FACTOR, FIRE_SCALE_CAP, FIRE_SCALE_E,
  Z_V_TABLE, Z_Q_TABLE, FLOOD_DATA,
} from "@/lib/engine";
import { YEARS, RAW_MONTHLY } from "@/lib/engine";

// ============================================================
// 类型: 单个标量的元数据 (供 DataPage UI 渲染 input 时取 min/max/hint)
// ============================================================

export interface ScalarField {
  key: ScalarKey;
  label: string;
  unit: string;
  step: number;
  min?: number;
  max?: number;
  hint?: string;
  group: "频率" | "时段" | "经济" | "水文" | "风浪" | "火电";
}

// 可编辑的标量键 (在 hooks 写回 engine 时穷举)
export type ScalarKey =
  | "Q_SAFE" | "R0"
  | "T_BUILD" | "T_RUN" | "T_FIRE" | "T_LIFE" | "H_ECON"
  | "P_FLOOD_DOWN" | "P_DESIGN" | "P_CHECK" | "P_GEN"
  | "IRRIG_Q" | "LOCK_Q" | "SED_YEAR"
  | "WIND_V" | "WIND_D"
  | "SAFETY_1" | "SAFETY_2"
  | "FIRE_KWH_COST" | "MINE_KWH_COST" | "FIRE_FUEL_COST"
  | "FIRE_OP_FACTOR" | "FIRE_SCALE_CAP" | "FIRE_SCALE_E";

// ============================================================
// 标量默认值 (与 engine 当前值同步; 模块加载时拍快照)
// ============================================================

const DEFAULT_SCALARS: Record<ScalarKey, number> = {
  Q_SAFE, R0,
  T_BUILD, T_RUN, T_FIRE, T_LIFE, H_ECON,
  P_FLOOD_DOWN, P_DESIGN, P_CHECK, P_GEN,
  IRRIG_Q, LOCK_Q, SED_YEAR,
  WIND_V, WIND_D,
  SAFETY_1, SAFETY_2,
  FIRE_KWH_COST, MINE_KWH_COST, FIRE_FUEL_COST,
  FIRE_OP_FACTOR, FIRE_SCALE_CAP, FIRE_SCALE_E,
};

// 拍快照 (冻结) — 后续复位 / JSON 导出 / 重置 都从这取
const SCALAR_SNAPSHOT: Readonly<Record<ScalarKey, number>> =
  Object.freeze({ ...DEFAULT_SCALARS });

// 二维数据快照
const Z_V_SNAPSHOT = Z_V_TABLE.map((row) => [row[0], row[1], row[2]] as [number, number, number]);
const Z_Q_SNAPSHOT = Z_Q_TABLE.map((row) => [row[0], row[1]] as [number, number]);
const FLOOD_SNAPSHOT: Record<string, number[]> = Object.fromEntries(
  Object.keys(FLOOD_DATA).map((k) => [k, [...FLOOD_DATA[k]]])
);
const YEARS_SNAPSHOT: number[] = [...YEARS];
const RAW_MONTHLY_SNAPSHOT: number[][] = RAW_MONTHLY.map((row) => [...row]);

// 洪水的三个 key, 序列长度不同 (20年最短, 10000年最长)
const FLOOD_KEYS = Object.keys(FLOOD_SNAPSHOT) as (keyof typeof FLOOD_SNAPSHOT)[];

// ============================================================
// 标量字段元数据 (供 DataPage 渲染 input)
// ============================================================

export const SCALAR_FIELDS: ScalarField[] = [
  // 频率
  { key: "P_FLOOD_DOWN", label: "下游防洪频率 P防", unit: "—", step: 0.01, min: 0, max: 1, group: "频率", hint: "P=5% (20年)" },
  { key: "P_DESIGN",     label: "设计频率 P设",       unit: "—", step: 0.001, min: 0, max: 1, group: "频率", hint: "P=0.1% (1000年)" },
  { key: "P_CHECK",      label: "校核频率 P校",       unit: "—", step: 0.0001, min: 0, max: 1, group: "频率", hint: "P=0.01% (10000年)" },
  { key: "P_GEN",        label: "兴利保证率 P生",     unit: "—", step: 0.01, min: 0, max: 1, group: "频率", hint: "P=87.5%" },
  // 时段
  { key: "T_BUILD",      label: "施工年限 T建",       unit: "年", step: 1, min: 1, max: 30, group: "时段" },
  { key: "T_RUN",        label: "运行年限 T运",       unit: "年", step: 1, min: 10, max: 100, group: "时段" },
  { key: "T_FIRE",       label: "火电重复年限 T替",   unit: "年", step: 1, min: 5, max: 50, group: "时段" },
  { key: "T_LIFE",       label: "工程寿命 T",         unit: "年", step: 1, min: 20, max: 100, group: "时段" },
  { key: "H_ECON",       label: "经济利用小时",       unit: "h", step: 100, min: 1000, max: 6000, group: "时段" },
  // 经济
  { key: "R0",              label: "经济折算率 r₀",       unit: "—",   step: 0.01, min: 0, max: 0.3, group: "经济" },
  { key: "FIRE_KWH_COST",   label: "火电单位千瓦投资",    unit: "元/kW", step: 50,  min: 100, max: 5000, group: "经济" },
  { key: "FIRE_FUEL_COST",  label: "火电燃料费",          unit: "元/度", step: 0.005, min: 0, max: 1, group: "经济" },
  { key: "MINE_KWH_COST",   label: "煤矿吨煤投资",        unit: "元/度", step: 0.01, min: 0, max: 1, group: "经济" },
  { key: "FIRE_OP_FACTOR",  label: "火电运行费率",        unit: "—",   step: 0.01, min: 0, max: 0.3, group: "经济" },
  { key: "FIRE_SCALE_CAP",  label: "火电规模系数 (容量)", unit: "—",   step: 0.05, min: 0.5, max: 2, group: "经济" },
  { key: "FIRE_SCALE_E",    label: "火电规模系数 (电量)", unit: "—",   step: 0.05, min: 0.5, max: 2, group: "经济" },
  // 水文
  { key: "Q_SAFE",   label: "下游安全泄量 Q安",   unit: "m³/s", step: 500, min: 1000, max: 50000, group: "水文", hint: "影响调洪演算" },
  { key: "IRRIG_Q",  label: "灌溉用水",           unit: "m³/s", step: 5, min: 0, max: 200, group: "水文", hint: "5~9 月扣除" },
  { key: "LOCK_Q",   label: "船闸用水",           unit: "m³/s", step: 1, min: 0, max: 100, group: "水文", hint: "全年扣除" },
  { key: "SED_YEAR", label: "年输沙量",           unit: "万m³/年", step: 10, min: 0, max: 10000, group: "水文" },
  // 风浪
  { key: "WIND_V",   label: "风速 W",             unit: "m/s", step: 1, min: 0, max: 50, group: "风浪", hint: "坝顶高程" },
  { key: "WIND_D",   label: "吹程 D",             unit: "km",   step: 1, min: 0, max: 100, group: "风浪", hint: "波浪计算" },
  { key: "SAFETY_1", label: "安全加高 (设计)",    unit: "m",    step: 0.1, min: 0, max: 5, group: "风浪" },
  { key: "SAFETY_2", label: "安全加高 (校核)",    unit: "m",    step: 0.1, min: 0, max: 5, group: "风浪" },
];

export const SCALAR_FIELDS_BY_KEY: Record<ScalarKey, ScalarField> =
  Object.fromEntries(SCALAR_FIELDS.map((f) => [f.key, f])) as any;

// ============================================================
// 持久化
// ============================================================

const STORAGE_KEY = "wqx.dataset.v1";

interface DatasetSnapshot {
  scalars: Record<ScalarKey, number>;
  years: number[];
  raw_monthly: number[][];
  zv: [number, number, number][];
  zq: [number, number][];
  floods: Record<string, number[]>;
}

function snapshotFromEngine(): DatasetSnapshot {
  return {
    scalars: { ...SCALAR_SNAPSHOT },
    years: [...YEARS_SNAPSHOT],
    raw_monthly: RAW_MONTHLY_SNAPSHOT.map((r) => [...r]),
    zv: Z_V_SNAPSHOT.map((r) => [r[0], r[1], r[2]]),
    zq: Z_Q_SNAPSHOT.map((r) => [r[0], r[1]]),
    floods: Object.fromEntries(
      FLOOD_KEYS.map((k) => [k, [...FLOOD_SNAPSHOT[k]]])
    ),
  };
}

function loadFromStorage(): DatasetSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    // 兜底: 任何标量缺失就用快照补
    const snap = snapshotFromEngine();
    return {
      scalars: { ...snap.scalars, ...(parsed.scalars ?? {}) },
      years: Array.isArray(parsed.years) ? parsed.years : snap.years,
      raw_monthly: Array.isArray(parsed.raw_monthly) ? parsed.raw_monthly : snap.raw_monthly,
      zv: Array.isArray(parsed.zv) ? parsed.zv : snap.zv,
      zq: Array.isArray(parsed.zq) ? parsed.zq : snap.zq,
      floods:
        parsed.floods && typeof parsed.floods === "object"
          ? { ...snap.floods, ...parsed.floods }
          : snap.floods,
    };
  } catch {
    return null;
  }
}

function saveToStorage(snap: DatasetSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* quota exceeded / private mode */
  }
}

// ============================================================
// 写回 engine (in-place mutation)
// ─────────────────────────────────────────────────────────
// 设计约束: Next.js 16 + Turbopack 把 `export const X = 1` 编译为 ESM
// live binding (只读 getter), 外部模块无法用 `X = 2` 覆盖.
//
// 但有两类引用可以从外部修改:
//   (1) 对象引用 `const OBJ = { ... }`  → 改属性 OBJ.k = v
//   (2) 数组引用 `const ARR = [...]`    → 改元素或 length=0 + push
//
// useSchemes 走的是 (1) (改 Record 子对象的属性),
// useDataset 之前想走的"标量整体替换"是 (1)(2) 都不适用的第 3 类 —
// **因此目前** 标量仅在内存中维护 (useDataset.data.scalars),
// 不同步回 engine 常量. 这意味着改了 Q_SAFE 等标量后, 下游
// 计算页 (观测台、对比、调洪图) 暂不会重算; DataPage 自己能
// 实时显示. 这是已知的"阶段 1+2"边界 — 完整接入需要改造
// useAllResults / flood / economic / summary 等多个文件改从
// useDataset 读, 超出本次范围. 后续可作为阶段 3 推进.
//
// 二维数据 (YEARS / RAW_MONTHLY / Z_V_TABLE / Z_Q_TABLE / FLOOD_DATA)
// 走的是 (1)(2) — 数组引用, in-place 改 length + push 可行.
// ============================================================

function applyScalarsToEngine(_s: Record<ScalarKey, number>): void {
  // 当前 no-op — 见上方说明.
}

function applyRunoffToEngine(years: number[], raw: number[][]): void {
  (YEARS as any).length = 0;
  (YEARS as any).push(...years);
  (RAW_MONTHLY as any).length = 0;
  for (const row of raw) (RAW_MONTHLY as any).push([...row]);
}

function applyZvToEngine(zv: [number, number, number][]): void {
  (Z_V_TABLE as any).length = 0;
  for (const row of zv) (Z_V_TABLE as any).push([row[0], row[1], row[2]]);
}

function applyZqToEngine(zq: [number, number][]): void {
  (Z_Q_TABLE as any).length = 0;
  for (const row of zq) (Z_Q_TABLE as any).push([row[0], row[1]]);
}

function applyFloodsToEngine(floods: Record<string, number[]>): void {
  for (const k of Object.keys(FLOOD_DATA)) delete (FLOOD_DATA as any)[k];
  for (const k of Object.keys(floods)) {
    (FLOOD_DATA as any)[k] = [...floods[k]];
  }
}

function applyAllToEngine(snap: DatasetSnapshot): void {
  applyScalarsToEngine(snap.scalars);
  applyRunoffToEngine(snap.years, snap.raw_monthly);
  applyZvToEngine(snap.zv);
  applyZqToEngine(snap.zq);
  applyFloodsToEngine(snap.floods);
}

// ============================================================
// JSON 导入校验
// ============================================================

export class DatasetImportError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "DatasetImportError";
  }
}

function validateAndNormalize(raw: unknown): DatasetSnapshot {
  if (!raw || typeof raw !== "object") {
    throw new DatasetImportError("JSON 根必须是对象");
  }
  const obj = raw as any;
  const snap = snapshotFromEngine();

  // scalars
  if (obj.scalars != null) {
    if (typeof obj.scalars !== "object") {
      throw new DatasetImportError("scalars 必须是对象");
    }
    for (const k of Object.keys(obj.scalars)) {
      if (!(k in snap.scalars)) continue; // 未知键忽略
      const v = obj.scalars[k];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        throw new DatasetImportError(`scalars.${k} 必须是有限数字`);
      }
    }
    snap.scalars = { ...snap.scalars, ...obj.scalars };
  }

  // years
  if (obj.years != null) {
    if (!Array.isArray(obj.years)) throw new DatasetImportError("years 必须是数组");
    if (!obj.years.every((y: any) => typeof y === "number")) {
      throw new DatasetImportError("years 数组元素必须是数字");
    }
    snap.years = obj.years;
  }

  // raw_monthly: [years.length][12] 数字矩阵
  if (obj.raw_monthly != null) {
    if (!Array.isArray(obj.raw_monthly)) {
      throw new DatasetImportError("raw_monthly 必须是二维数组");
    }
    for (let i = 0; i < obj.raw_monthly.length; i++) {
      const row = obj.raw_monthly[i];
      if (!Array.isArray(row) || row.length !== 12) {
        throw new DatasetImportError(
          `raw_monthly[${i}] 必须是长度为 12 的数组`,
        );
      }
      for (let k = 0; k < 12; k++) {
        if (typeof row[k] !== "number" || !Number.isFinite(row[k])) {
          throw new DatasetImportError(
            `raw_monthly[${i}][${k}] 必须是有限数字`,
          );
        }
      }
    }
    snap.raw_monthly = obj.raw_monthly.map((r: number[]) => [...r]);
  }

  // years / raw_monthly 一致性
  if (snap.years.length !== snap.raw_monthly.length) {
    throw new DatasetImportError(
      `years 长度 (${snap.years.length}) 与 raw_monthly 行数 (${snap.raw_monthly.length}) 不一致`,
    );
  }

  // zv: [Z, V亿m3, V m3/s·月]
  if (obj.zv != null) {
    if (!Array.isArray(obj.zv)) throw new DatasetImportError("zv 必须是二维数组");
    for (let i = 0; i < obj.zv.length; i++) {
      const r = obj.zv[i];
      if (!Array.isArray(r) || r.length !== 3) {
        throw new DatasetImportError(`zv[${i}] 必须是 [Z, V, MSM] 长度 3`);
      }
      for (let k = 0; k < 3; k++) {
        if (typeof r[k] !== "number" || !Number.isFinite(r[k])) {
          throw new DatasetImportError(`zv[${i}][${k}] 必须是有限数字`);
        }
      }
    }
    snap.zv = obj.zv.map((r: number[]) => [r[0], r[1], r[2]]);
  }

  // zq: [Q, Z]
  if (obj.zq != null) {
    if (!Array.isArray(obj.zq)) throw new DatasetImportError("zq 必须是二维数组");
    for (let i = 0; i < obj.zq.length; i++) {
      const r = obj.zq[i];
      if (!Array.isArray(r) || r.length !== 2) {
        throw new DatasetImportError(`zq[${i}] 必须是 [Q, Z] 长度 2`);
      }
      for (let k = 0; k < 2; k++) {
        if (typeof r[k] !== "number" || !Number.isFinite(r[k])) {
          throw new DatasetImportError(`zq[${i}][${k}] 必须是有限数字`);
        }
      }
    }
    snap.zq = obj.zq.map((r: number[]) => [r[0], r[1]]);
  }

  // floods: { key: number[] }
  if (obj.floods != null) {
    if (typeof obj.floods !== "object" || Array.isArray(obj.floods)) {
      throw new DatasetImportError("floods 必须是 { key: number[] } 对象");
    }
    for (const k of Object.keys(obj.floods)) {
      const v = obj.floods[k];
      if (!Array.isArray(v)) {
        throw new DatasetImportError(`floods.${k} 必须是数组`);
      }
      for (let i = 0; i < v.length; i++) {
        if (typeof v[i] !== "number" || !Number.isFinite(v[i])) {
          throw new DatasetImportError(`floods.${k}[${i}] 必须是有限数字`);
        }
      }
    }
    snap.floods = { ...snap.floods, ...obj.floods };
  }

  return snap;
}

// ============================================================
// Context
// ============================================================

interface DatasetContextType {
  /** 当前数据集 (与 engine 同步) */
  data: DatasetSnapshot;
  /** version 计数器, 每次变更 +1; consumer 把它纳入 useMemo 依赖 */
  version: number;
  /** 是否已从 localStorage hydrate 完成 */
  isHydrated: boolean;
  /** 当前值与默认值是否有差异 */
  isModified: boolean;
  /** 编辑单个标量 */
  setScalar: (key: ScalarKey, v: number) => void;
  /** 替换径流 31×12 矩阵 (years 同时改) */
  setRunoff: (years: number[], raw: number[][]) => void;
  /** 替换 Z-V 曲线 (长度 3 的元组数组) */
  setZv: (rows: [number, number, number][]) => void;
  /** 替换 Z-Q 曲线 (长度 2 的元组数组) */
  setZq: (rows: [number, number][]) => void;
  /** 替换单场洪水 (key in FLOOD_KEYS) */
  setFlood: (key: string, series: number[]) => void;
  /** 从 JSON 字符串加载 (会做 schema 校验) */
  importJson: (jsonText: string) => void;
  /** 序列化为 JSON 字符串 (供下载 / 复制) */
  exportJson: () => string;
  /** 复位到任务书默认值 */
  reset: () => void;
}

const DatasetContext = createContext<DatasetContextType | null>(null);

// ============================================================
// Provider
// ============================================================

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DatasetSnapshot>(() => snapshotFromEngine());
  const [version, setVersion] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);

  // 客户端挂载后从 localStorage 加载
  useEffect(() => {
    const loaded = loadFromStorage();
    if (loaded) {
      setData(loaded);
      applyAllToEngine(loaded);
      setVersion((v) => v + 1);
    }
    setIsHydrated(true);
  }, []);

  // 变更时同步到 localStorage + engine + version
  useEffect(() => {
    if (!isHydrated) return;
    saveToStorage(data);
    applyAllToEngine(data);
    setVersion((v) => v + 1);
  }, [data, isHydrated]);

  // ── 标量编辑 ──
  const setScalar = useCallback((key: ScalarKey, v: number) => {
    setData((prev) => ({
      ...prev,
      scalars: { ...prev.scalars, [key]: v },
    }));
  }, []);

  // ── 二维替换 ──
  const setRunoff = useCallback((years: number[], raw: number[][]) => {
    if (years.length !== raw.length) {
      throw new Error("years 与 raw_monthly 行数必须一致");
    }
    setData((prev) => ({
      ...prev,
      years: [...years],
      raw_monthly: raw.map((r) => [...r]),
    }));
  }, []);

  const setZv = useCallback((rows: [number, number, number][]) => {
    setData((prev) => ({ ...prev, zv: rows.map((r) => [r[0], r[1], r[2]]) }));
  }, []);

  const setZq = useCallback((rows: [number, number][]) => {
    setData((prev) => ({ ...prev, zq: rows.map((r) => [r[0], r[1]]) }));
  }, []);

  const setFlood = useCallback((key: string, series: number[]) => {
    setData((prev) => ({
      ...prev,
      floods: { ...prev.floods, [key]: [...series] },
    }));
  }, []);

  // ── JSON ──
  const importJson = useCallback((jsonText: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e: any) {
      throw new DatasetImportError(`JSON 解析失败: ${e?.message ?? e}`);
    }
    const snap = validateAndNormalize(parsed);
    setData(snap);
  }, []);

  const exportJson = useCallback(() => {
    return JSON.stringify(data, null, 2);
  }, [data]);

  // ── 复位 ──
  const reset = useCallback(() => {
    setData(snapshotFromEngine());
  }, []);

  // ── isModified ──
  const isModified = useMemo(() => {
    const snap = snapshotFromEngine();
    for (const k of Object.keys(snap.scalars) as ScalarKey[]) {
      if (data.scalars[k] !== snap.scalars[k]) return true;
    }
    if (data.years.join(",") !== snap.years.join(",")) return true;
    if (data.raw_monthly.length !== snap.raw_monthly.length) return true;
    for (let i = 0; i < data.raw_monthly.length; i++) {
      for (let k = 0; k < 12; k++) {
        if (data.raw_monthly[i][k] !== snap.raw_monthly[i][k]) return true;
      }
    }
    if (data.zv.length !== snap.zv.length) return true;
    for (let i = 0; i < data.zv.length; i++) {
      if (
        data.zv[i][0] !== snap.zv[i][0] ||
        data.zv[i][1] !== snap.zv[i][1] ||
        data.zv[i][2] !== snap.zv[i][2]
      ) {
        return true;
      }
    }
    if (data.zq.length !== snap.zq.length) return true;
    for (let i = 0; i < data.zq.length; i++) {
      if (data.zq[i][0] !== snap.zq[i][0] || data.zq[i][1] !== snap.zq[i][1]) {
        return true;
      }
    }
    for (const k of Object.keys(snap.floods)) {
      const a = data.floods[k] ?? [];
      const b = snap.floods[k] ?? [];
      if (a.length !== b.length) return true;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return true;
      }
    }
    return false;
  }, [data]);

  const value: DatasetContextType = {
    data,
    version,
    isHydrated,
    isModified,
    setScalar,
    setRunoff,
    setZv,
    setZq,
    setFlood,
    importJson,
    exportJson,
    reset,
  };

  return (
    <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>
  );
}

// ============================================================
// Hook
// ============================================================

export function useDataset(): DatasetContextType {
  const ctx = useContext(DatasetContext);
  if (!ctx) {
    return {
      data: snapshotFromEngine(),
      version: 0,
      isHydrated: false,
      isModified: false,
      setScalar: () => {},
      setRunoff: () => {},
      setZv: () => {},
      setZq: () => {},
      setFlood: () => {},
      importJson: () => {},
      exportJson: () => JSON.stringify(snapshotFromEngine(), null, 2),
      reset: () => {},
    };
  }
  return ctx;
}

// ============================================================
// 文件下载辅助 (浏览器端)
// ============================================================

export function downloadJson(filename: string, jsonText: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
