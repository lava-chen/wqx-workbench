"use client";

/**
 * 方案编辑 Hook
 * ─────────────────────────────────────────────────────────
 * 1. 初始从引擎常量 (SCHEMES / SPILLWAY / ECON / RUN_FACTOR / RESERVE) 抽取默认 4 方案
 * 2. 加载到内存后写入 localStorage, 之后每次变更自动保存
 * 3. 编辑 / 新增 / 删除 时, 同步变更到引擎常量 (in-place mutation),
 *    这样 useAllResults 等下游会读到新数据并自动重算
 * 4. 提供 version 计数器, 让 useMemo 依赖项感知变更
 */

import { useCallback, useEffect, useState } from "react";
import {
  SCHEMES,
  SPILLWAY,
  ECON,
  RUN_FACTOR,
  RESERVE,
  FENGTAN_LOSS,
  HYDRAULIC_BUILD,
  MECH,
  HOUSE_TRAFFIC,
  COMPENSATION,
  INVEST_RATIO,
} from "@/lib/engine";

const STORAGE_KEY = "wqx.schemes.v1";

const DEFAULT_IDS = ["I", "II", "III", "IV"];

/**
 * 引擎原始数据快照: 在模块加载时一次性保存原始的 I/II/III/IV 数据,
 * 每次 applyToEngine 时先复位这些键, 再应用当前用户数据。
 * 这样保证删除方案后, 引擎不会残留"幽灵"键。
 */
const ENGINE_SNAPSHOT = {
  SCHEMES: Object.fromEntries(
    DEFAULT_IDS.map((id) => [id, { ...(SCHEMES[id] ?? { Z_zheng: 0, H_dam_max: 0 }) }])
  ),
  SPILLWAY: Object.fromEntries(
    DEFAULT_IDS.map((id) => [id, { ...(SPILLWAY[id] ?? {}) }])
  ),
  ECON: Object.fromEntries(
    DEFAULT_IDS.map((id) => [id, { ...(ECON[id] ?? {}) }])
  ),
  RUN_FACTOR: Object.fromEntries(
    DEFAULT_IDS.map((id) => [id, RUN_FACTOR[id]])
  ),
  RESERVE: Object.fromEntries(
    DEFAULT_IDS.map((id) => [id, RESERVE[id]])
  ),
  HYDRAULIC_BUILD: Object.fromEntries(
    DEFAULT_IDS.map((id) => [id, { ...(HYDRAULIC_BUILD[id] ?? {}) }])
  ),
  MECH: Object.fromEntries(
    DEFAULT_IDS.map((id) => [id, { ...(MECH[id] ?? {}) }])
  ),
  HOUSE_TRAFFIC: Object.fromEntries(
    DEFAULT_IDS.map((id) => [id, { ...(HOUSE_TRAFFIC[id] ?? {}) }])
  ),
  COMPENSATION: Object.fromEntries(
    DEFAULT_IDS.map((id) => [id, { ...(COMPENSATION[id] ?? {}) }])
  ),
  FENGTAN_LOSS: Object.fromEntries(
    DEFAULT_IDS.map((id) => [id, { ...(FENGTAN_LOSS[id] ?? { N: 0, E: 0 }) }])
  ),
  INVEST_RATIO: Object.fromEntries(
    DEFAULT_IDS.map((id) => [id, [...(INVEST_RATIO[id] ?? [])]])
  ),
};

/**
 * 用户可编辑的方案字段 (核心 + 经济 ~15 个)
 */
export interface SchemeData {
  id: string;
  // 水工核心
  Z_zheng: number;
  H_dam_max: number;
  // 装机
  install_cap: number; // 万 kW
  reserve: number; // 万 kW
  // 投资 (万元)
  dam_invest: number;
  mech_invest: number;
  temp_invest: number;
  comp_invest: number;
  // 泄洪
  spill_n: number;
  spill_b: number;
  spill_crest: number;
  spill_h: number;
  // 运行
  run_factor: number; // %
  // 备注 (可选, 仅展示)
  note?: string;
}

function defaultsFromEngine(): SchemeData[] {
  return DEFAULT_IDS.map((id) => extractFromEngine(id));
}

function extractFromEngine(id: string): SchemeData {
  return {
    id,
    Z_zheng: SCHEMES[id]?.Z_zheng ?? 100,
    H_dam_max: SCHEMES[id]?.H_dam_max ?? 80,
    install_cap: ECON[id]?.install_cap ?? 100,
    reserve: RESERVE[id] ?? 20,
    run_factor: RUN_FACTOR[id] ?? 2.0,
    dam_invest: ECON[id]?.dam_invest ?? 40000,
    mech_invest: ECON[id]?.mech_invest ?? 20000,
    temp_invest: ECON[id]?.temp_invest ?? 50000,
    comp_invest: ECON[id]?.comp_invest ?? 40000,
    spill_n: SPILLWAY[id]?.spill_n ?? 10,
    spill_b: SPILLWAY[id]?.spill_b ?? 15,
    spill_crest: SPILLWAY[id]?.spill_crest ?? 90,
    spill_h: SPILLWAY[id]?.spill_h ?? 12,
  };
}

function loadFromStorage(): SchemeData[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    // 兜底: 任何字段缺失就用引擎默认值补
    return parsed.map((s: any) => {
      const base = extractFromEngine(s.id ?? "I");
      return { ...base, ...s, id: s.id ?? base.id };
    });
  } catch {
    return null;
  }
}

function saveToStorage(schemes: SchemeData[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schemes));
  } catch {
    /* quota exceeded / private mode */
  }
}

/**
 * 同步数据到引擎常量 (in-place mutation)
 * 步骤:
 *   1. 先把 I/II/III/IV 全部恢复 ENGINE_SNAPSHOT 原始值 (clean slate)
 *   2. 删除上一次残留的自定义键 (V, VI, ...)
 *   3. 对当前每个用户方案: 编辑已有方案直接改属性, 新增方案则写入新条目
 */
function applyToEngine(schemes: SchemeData[]): void {
  // 1) 复位 4 个原始方案
  for (const id of DEFAULT_IDS) {
    const sOrig = ENGINE_SNAPSHOT.SCHEMES[id];
    (SCHEMES as Record<string, any>)[id] = { ...sOrig };
    (SPILLWAY as Record<string, any>)[id] = { ...ENGINE_SNAPSHOT.SPILLWAY[id] };
    (ECON as Record<string, any>)[id] = { ...ENGINE_SNAPSHOT.ECON[id] };
    (RUN_FACTOR as Record<string, any>)[id] = ENGINE_SNAPSHOT.RUN_FACTOR[id];
    (RESERVE as Record<string, any>)[id] = ENGINE_SNAPSHOT.RESERVE[id];
    (HYDRAULIC_BUILD as Record<string, any>)[id] = { ...ENGINE_SNAPSHOT.HYDRAULIC_BUILD[id] };
    (MECH as Record<string, any>)[id] = { ...ENGINE_SNAPSHOT.MECH[id] };
    (HOUSE_TRAFFIC as Record<string, any>)[id] = { ...ENGINE_SNAPSHOT.HOUSE_TRAFFIC[id] };
    (COMPENSATION as Record<string, any>)[id] = { ...ENGINE_SNAPSHOT.COMPENSATION[id] };
    (FENGTAN_LOSS as Record<string, any>)[id] = { ...ENGINE_SNAPSHOT.FENGTAN_LOSS[id] };
    (INVEST_RATIO as Record<string, any>)[id] = [...ENGINE_SNAPSHOT.INVEST_RATIO[id]];
  }

  // 2) 删除用户已移除的自定义键
  const keep = new Set(schemes.map((s) => s.id));
  for (const key of Object.keys(SCHEMES)) {
    if (!DEFAULT_IDS.includes(key) && !keep.has(key)) {
      delete (SCHEMES as Record<string, any>)[key];
      delete (SPILLWAY as Record<string, any>)[key];
      delete (ECON as Record<string, any>)[key];
      delete (RUN_FACTOR as Record<string, any>)[key];
      delete (RESERVE as Record<string, any>)[key];
      delete (HYDRAULIC_BUILD as Record<string, any>)[key];
      delete (MECH as Record<string, any>)[key];
      delete (HOUSE_TRAFFIC as Record<string, any>)[key];
      delete (COMPENSATION as Record<string, any>)[key];
      delete (FENGTAN_LOSS as Record<string, any>)[key];
      delete (INVEST_RATIO as Record<string, any>)[key];
    }
  }

  // 3) 应用用户方案
  for (const s of schemes) {
    // SCHEMES
    if (!SCHEMES[s.id]) {
      (SCHEMES as Record<string, any>)[s.id] = { Z_zheng: 0, H_dam_max: 0 };
    }
    SCHEMES[s.id].Z_zheng = s.Z_zheng;
    SCHEMES[s.id].H_dam_max = s.H_dam_max;

    // SPILLWAY
    if (!SPILLWAY[s.id]) {
      (SPILLWAY as Record<string, any>)[s.id] = {
        spill_n: s.spill_n,
        spill_b: s.spill_b,
        spill_crest: s.spill_crest,
        spill_h: s.spill_h,
        mid_n: 0,
        mid_sill: 0,
        mid_b: 0,
        mid_h: 0,
      };
    } else {
      SPILLWAY[s.id].spill_n = s.spill_n;
      SPILLWAY[s.id].spill_b = s.spill_b;
      SPILLWAY[s.id].spill_crest = s.spill_crest;
      SPILLWAY[s.id].spill_h = s.spill_h;
    }

    // ECON
    if (!ECON[s.id]) {
      (ECON as Record<string, any>)[s.id] = {
        dam_invest: s.dam_invest,
        mech_invest: s.mech_invest,
        temp_invest: s.temp_invest,
        comp_invest: s.comp_invest,
        install_cap: s.install_cap,
      };
    } else {
      ECON[s.id].dam_invest = s.dam_invest;
      ECON[s.id].mech_invest = s.mech_invest;
      ECON[s.id].temp_invest = s.temp_invest;
      ECON[s.id].comp_invest = s.comp_invest;
      ECON[s.id].install_cap = s.install_cap;
    }

    // RUN_FACTOR / RESERVE
    (RUN_FACTOR as Record<string, any>)[s.id] = s.run_factor;
    (RESERVE as Record<string, any>)[s.id] = s.reserve;

    // 其它常量 (用户不直接编辑, 但新增方案时需要从模板补齐)
    if (!HYDRAULIC_BUILD[s.id]) {
      (HYDRAULIC_BUILD as Record<string, any>)[s.id] = { ...ENGINE_SNAPSHOT.HYDRAULIC_BUILD["I"] };
    }
    if (!MECH[s.id]) {
      (MECH as Record<string, any>)[s.id] = {
        ...ENGINE_SNAPSHOT.MECH["I"],
        install: s.install_cap,
      };
    } else {
      MECH[s.id].install = s.install_cap;
    }
    if (!HOUSE_TRAFFIC[s.id]) {
      (HOUSE_TRAFFIC as Record<string, any>)[s.id] = { ...ENGINE_SNAPSHOT.HOUSE_TRAFFIC["I"] };
    }
    if (!COMPENSATION[s.id]) {
      (COMPENSATION as Record<string, any>)[s.id] = {
        ...ENGINE_SNAPSHOT.COMPENSATION["I"],
        value: s.comp_invest,
      };
    } else {
      COMPENSATION[s.id].value = s.comp_invest;
    }
    if (!FENGTAN_LOSS[s.id]) {
      (FENGTAN_LOSS as Record<string, any>)[s.id] = { ...ENGINE_SNAPSHOT.FENGTAN_LOSS["I"] };
    }
    if (!INVEST_RATIO[s.id]) {
      (INVEST_RATIO as Record<string, any>)[s.id] = [...ENGINE_SNAPSHOT.INVEST_RATIO["I"]];
    }
  }
}

/**
 * 生成下一个未占用的方案 ID: V, VI, VII, ...
 */
function nextSchemeId(schemes: SchemeData[]): string {
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const used = new Set(schemes.map((s) => s.id));
  for (const r of roman) {
    if (!used.has(r)) return r;
  }
  return `S${schemes.length + 1}`;
}

// ============================================================
// Hook
// ============================================================

export function useSchemes() {
  const [schemes, setSchemes] = useState<SchemeData[]>(() => defaultsFromEngine());
  const [version, setVersion] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);

  // 客户端挂载后加载 localStorage
  useEffect(() => {
    const loaded = loadFromStorage();
    if (loaded) {
      setSchemes(loaded);
    }
    setIsHydrated(true);
  }, []);

  // 变更时同步到 localStorage + 引擎
  useEffect(() => {
    if (!isHydrated) return;
    saveToStorage(schemes);
    applyToEngine(schemes);
    setVersion((v) => v + 1);
  }, [schemes, isHydrated]);

  const updateScheme = useCallback(
    (id: string, patch: Partial<SchemeData>) => {
      setSchemes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
    },
    []
  );

  const addScheme = useCallback(() => {
    setSchemes((prev) => {
      const id = nextSchemeId(prev);
      // 以最后一个方案为模板, 蓄水位降低 5m 作为区分
      const last = prev[prev.length - 1] ?? extractFromEngine("I");
      const fresh: SchemeData = {
        ...last,
        id,
        Z_zheng: Math.max(80, last.Z_zheng - 5),
        H_dam_max: Math.max(60, last.H_dam_max - 5),
        note: "新方案",
      };
      return [...prev, fresh];
    });
  }, []);

  const removeScheme = useCallback((id: string) => {
    setSchemes((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const reset = useCallback(() => {
    setSchemes(defaultsFromEngine());
  }, []);

  return {
    schemes,
    version,
    isHydrated,
    updateScheme,
    addScheme,
    removeScheme,
    reset,
  };
}
