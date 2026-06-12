"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { Q_SAFE as ENGINE_Q_SAFE, R0 as ENGINE_R0 } from "@/lib/engine";

// ── Types ───────────────────────────────────────────────

export interface Params {
  Q_SAFE: number;
  R0: number;
  scheme: string;
  Z_zheng_offset: Record<string, number>; // ±3m per scheme
}

const DEFAULTS: Params = {
  Q_SAFE: ENGINE_Q_SAFE,
  R0: ENGINE_R0,
  scheme: "II",
  Z_zheng_offset: { I: 0, II: 0, III: 0, IV: 0 },
};

interface ParamsContextType {
  params: Params;
  setQSAFE: (v: number) => void;
  setR0: (v: number) => void;
  setScheme: (v: string) => void;
  setZOffset: (sk: string, v: number) => void;
  reset: () => void;
  isModified: boolean;
  defaults: Params;
}

// ── Context ─────────────────────────────────────────────

const ParamsContext = createContext<ParamsContextType | null>(null);

// ── Provider ────────────────────────────────────────────

export function ParamsProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useState<Params>({ ...DEFAULTS });

  const setQSAFE = useCallback(
    (v: number) => setParams((p) => ({ ...p, Q_SAFE: v })),
    [],
  );
  const setR0 = useCallback(
    (v: number) => setParams((p) => ({ ...p, R0: v })),
    [],
  );
  const setScheme = useCallback(
    (v: string) => setParams((p) => ({ ...p, scheme: v })),
    [],
  );
  const setZOffset = useCallback(
    (sk: string, v: number) =>
      setParams((p) => ({
        ...p,
        Z_zheng_offset: { ...p.Z_zheng_offset, [sk]: v },
      })),
    [],
  );
  const reset = useCallback(() => setParams({ ...DEFAULTS }), []);

  const isModified =
    params.Q_SAFE !== DEFAULTS.Q_SAFE ||
    params.R0 !== DEFAULTS.R0 ||
    params.scheme !== DEFAULTS.scheme ||
    Object.values(params.Z_zheng_offset).some((v) => v !== 0);

  const value: ParamsContextType = {
    params,
    setQSAFE,
    setR0,
    setScheme,
    setZOffset,
    reset,
    isModified,
    defaults: DEFAULTS,
  };

  return (
    <ParamsContext.Provider value={value}>{children}</ParamsContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────

export function useParams(): ParamsContextType {
  const ctx = useContext(ParamsContext);
  if (!ctx) {
    // When used outside ParamsProvider, return default/read-only state
    return {
      params: { ...DEFAULTS },
      setQSAFE: () => {},
      setR0: () => {},
      setScheme: () => {},
      setZOffset: () => {},
      reset: () => {},
      isModified: false,
      defaults: DEFAULTS,
    };
  }
  return ctx;
}