"use client";

/**
 * 方案编辑器
 * ─────────────────────────────────────────────────────────
 * 取代原 OverviewPage: 把 4 张只读卡片变成可编辑表单,
 * 支持新增/删除/重置, 数据保存到 localStorage (经 useSchemes Hook).
 *
 * 编辑后 useAllResults 会自动用新参数重算, 所以本页底部
 * 还保留"水利指标对比表"以便实时校验编辑结果.
 */

import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Database,
  Star,
  ChevronDown,
  ChevronUp,
  Building2,
  Droplets,
  Ruler,
  Zap,
  Sigma,
  AlertCircle,
  Check,
  Download,
  Upload,
} from "lucide-react";
import { useSchemes, type SchemeData } from "@/hooks/useSchemes";
import { useAllResults } from "@/hooks/useAllResults";
import { useParams } from "@/hooks/useParams";
import { cn } from "@/lib/utils";
import {
  wind_wave_height,
  WIND_V,
  WIND_D,
  SAFETY_1,
  SAFETY_2,
} from "@/lib/engine";

// ============================================================
// 字段定义 (统一的标签/单位/取值范围, 供卡片和对比表共用)
// ============================================================

interface FieldDef {
  key: keyof SchemeData;
  label: string;
  unit: string;
  step: number;
  min?: number;
  max?: number;
  hint?: string;
  group: "core" | "install" | "spill" | "invest" | "run";
}

const FIELDS: FieldDef[] = [
  // 水工核心
  { key: "Z_zheng",     label: "正常蓄水位 Z正",   unit: "m",     step: 0.5,  min: 80,  max: 140, group: "core",    hint: "影响库容、保证出力、调洪" },
  { key: "H_dam_max",   label: "最大坝高 H坝",     unit: "m",     step: 0.5,  min: 50,  max: 130, group: "core",    hint: "影响坝体投资" },
  // 装机
  { key: "install_cap", label: "装机容量 N装",      unit: "万kW",  step: 5,    min: 30,  max: 250, group: "install", hint: "机组选型总容量" },
  { key: "reserve",     label: "备用容量",          unit: "万kW",  step: 5,    min: 0,   max: 50,  group: "install", hint: "事故/检修备用" },
  // 泄洪
  { key: "spill_n",     label: "溢流坝孔数",        unit: "孔",    step: 1,    min: 0,   max: 30,  group: "spill",   hint: "表孔泄洪" },
  { key: "spill_b",     label: "单孔宽 B",          unit: "m",     step: 0.5,  min: 5,   max: 25,  group: "spill" },
  { key: "spill_crest", label: "溢流坝顶高程",      unit: "m",     step: 0.5,  min: 60,  max: 130, group: "spill" },
  { key: "spill_h",     label: "溢流坝孔高",        unit: "m",     step: 0.5,  min: 5,   max: 20,  group: "spill" },
  // 投资
  { key: "dam_invest",  label: "大坝投资",          unit: "万元",  step: 1000, min: 10000,         group: "invest" },
  { key: "mech_invest", label: "机电投资",          unit: "万元",  step: 500,  min: 5000,          group: "invest" },
  { key: "temp_invest", label: "临时工程",          unit: "万元",  step: 1000, min: 20000,         group: "invest" },
  { key: "comp_invest", label: "补偿投资",          unit: "万元",  step: 1000, min: 10000,         group: "invest" },
  // 运行
  { key: "run_factor",  label: "运行费率",          unit: "%",     step: 0.1,  min: 0.5, max: 5,   group: "run" },
];

const GROUPS = [
  { id: "core",    label: "水工核心", icon: Ruler,    cols: 2 },
  { id: "install", label: "装机",     icon: Zap,      cols: 2 },
  { id: "spill",   label: "泄洪建筑", icon: Building2, cols: 4 },
  { id: "invest",  label: "投资",     icon: Sigma,    cols: 4 },
  { id: "run",     label: "运行",     icon: Droplets,  cols: 2 },
] as const;

// ============================================================
// 工具
// ============================================================

function fmt(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d);
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}
function fmtLevel(v: number): string {
  return v.toFixed(2);
}
function fmtPower(v: number): string {
  return Math.round(v).toLocaleString();
}
function fmtEnergy(v: number): string {
  return v.toFixed(2);
}
function fmtCost(v: number): string {
  return Math.round(v).toLocaleString();
}
function fmtCell(v: number | undefined, digits: number): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (digits === 0) return Math.round(v).toLocaleString();
  return v.toFixed(digits);
}

function computeZDam(Z_design: number, Z_check: number): number {
  const dh_design = wind_wave_height(WIND_V, WIND_D);
  const dh_check = wind_wave_height(WIND_V * 0.8, WIND_D);
  return Math.max(Z_design + dh_design + SAFETY_1, Z_check + dh_check + SAFETY_2);
}

// ============================================================
// 单个方案的编辑卡片
// ============================================================

function SchemeCard({
  data,
  index,
  total,
  computed,
  onChange,
  onRemove,
  canRemove,
  isExpanded,
  onToggleExpand,
}: {
  data: SchemeData;
  index: number;
  total: number;
  computed?: {
    Z_dead: number;
    Np_wan: number;
    N_Y: number;
    E_avg: number;
    Z_design: number;
    Z_check: number;
    annualCost?: number;
  };
  onChange: (patch: Partial<SchemeData>) => void;
  onRemove: () => void;
  canRemove: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: "var(--bg-canvas)",
        border: "1px solid var(--border)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      {/* Header strip */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 border-b"
        style={{
          borderColor: "var(--border)",
          background: "linear-gradient(180deg, var(--surface) 0%, transparent 100%)",
        }}
      >
        <div
          className="flex items-center justify-center h-9 w-9 rounded-md font-display font-semibold text-base"
          style={{
            backgroundColor: "var(--accent-color)",
            color: "white",
          }}
        >
          {data.id}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="font-display text-lg font-semibold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              方案 {data.id}
            </span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{
                backgroundColor: "var(--surface)",
                color: "var(--muted)",
                border: "1px solid var(--border)",
              }}
            >
              #{(index + 1).toString().padStart(2, "0")} / {total.toString().padStart(2, "0")}
            </span>
            {data.note && (
              <span
                className="text-xs italic truncate"
                style={{ color: "var(--muted)" }}
                title={data.note}
              >
                {data.note}
              </span>
            )}
          </div>
          <div
            className="text-[11px] font-mono mt-0.5"
            style={{ color: "var(--muted)" }}
          >
            Z正 = <span style={{ color: "var(--text)" }}>{fmtLevel(data.Z_zheng)}</span> m
            {" · "}
            装机 = <span style={{ color: "var(--text)" }}>{fmtInt(data.install_cap)}</span> 万kW
            {" · "}
            投资 = <span style={{ color: "var(--text)" }}>{fmtInt(
              data.dam_invest + data.mech_invest + data.temp_invest + data.comp_invest
            )}</span> 万元
          </div>
        </div>

        {/* 实时计算结果摘要 */}
        {computed && (
          <div className="hidden lg:flex items-center gap-4 px-3 py-1.5 rounded-md text-[11px] font-mono"
            style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent-color)" }}>
            <span title="保证出力">
              Np <b className="text-sm ml-1">{fmtPower(computed.Np_wan)}</b>
            </span>
            <span title="多年平均电能">
              E <b className="text-sm ml-1">{fmtEnergy(computed.E_avg)}</b>
            </span>
            {computed.annualCost != null && (
              <span title="年费用">
                AC <b className="text-sm ml-1">{fmtCost(computed.annualCost)}</b>
              </span>
            )}
          </div>
        )}

        <button
          onClick={onToggleExpand}
          className="p-1.5 rounded-md transition-colors"
          style={{ color: "var(--muted)" }}
          title={isExpanded ? "折叠" : "展开"}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {canRemove && (
          <button
            onClick={onRemove}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--error-soft)]"
            style={{ color: "var(--error)" }}
            title="删除方案"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="p-5 space-y-5">
          {GROUPS.map((g) => {
            const gFields = FIELDS.filter((f) => f.group === g.id);
            const Icon = g.icon;
            return (
              <div key={g.id}>
                <div
                  className="flex items-center gap-1.5 mb-2.5 text-[10px] font-mono uppercase tracking-widest"
                  style={{ color: "var(--muted)" }}
                >
                  <Icon className="h-3 w-3" />
                  {g.label}
                </div>
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))` }}
                >
                  {gFields.map((f) => (
                    <NumberInput
                      key={f.key}
                      field={f}
                      value={data[f.key] as number}
                      onChange={(v) => onChange({ [f.key]: v } as Partial<SchemeData>)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* 备注 */}
          <div>
            <div
              className="text-[10px] font-mono uppercase tracking-widest mb-1.5"
              style={{ color: "var(--muted)" }}
            >
              备注
            </div>
            <input
              type="text"
              value={data.note ?? ""}
              onChange={(e) => onChange({ note: e.target.value })}
              placeholder="例如: 推荐方案 / 消纳方案 V..."
              className="w-full px-3 py-1.5 text-sm rounded-md outline-none focus:ring-1"
              style={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
          </div>

          {/* 实时计算结果 (展开时完整显示) */}
          {computed && (
            <div
              className="mt-2 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
              style={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <ComputedStat label="死水位" value={fmtLevel(computed.Z_dead)} unit="m" />
              <ComputedStat label="保证出力" value={fmtPower(computed.Np_wan)} unit="万kW" />
              <ComputedStat label="装机" value={fmtPower(computed.N_Y)} unit="万kW" />
              <ComputedStat label="多年电能" value={fmtEnergy(computed.E_avg)} unit="亿度" />
              <ComputedStat label="设计/校核" value={`${fmtLevel(computed.Z_design)}/${fmtLevel(computed.Z_check)}`} unit="m" />
              <ComputedStat
                label="年费用"
                value={computed.annualCost != null ? fmtCost(computed.annualCost) : "—"}
                unit="万元"
                highlight
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 数字输入框
function NumberInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-[11px] font-medium"
          style={{ color: "var(--text)" }}
        >
          {field.label}
        </span>
        {field.hint && (
          <span
            className="text-[10px] truncate ml-2"
            style={{ color: "var(--muted)" }}
            title={field.hint}
          >
            {field.hint}
          </span>
        )}
      </div>
      <div
        className="flex items-stretch rounded-md overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <input
          type="number"
          value={value}
          step={field.step}
          min={field.min}
          max={field.max}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
          className="flex-1 min-w-0 px-2.5 py-1.5 text-sm font-mono tabular-nums outline-none focus:bg-[var(--accent-soft)] transition-colors"
          style={{
            backgroundColor: "transparent",
            color: "var(--text)",
          }}
        />
        <span
          className="px-2 flex items-center text-[11px] font-mono shrink-0"
          style={{
            backgroundColor: "var(--surface)",
            color: "var(--muted)",
            borderLeft: "1px solid var(--border)",
          }}
        >
          {field.unit}
        </span>
      </div>
    </label>
  );
}

function ComputedStat({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-widest font-mono"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span
          className="font-mono tabular-nums text-lg font-semibold"
          style={{ color: highlight ? "var(--accent-color)" : "var(--text)" }}
        >
          {value}
        </span>
        <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export function SchemeEditorPage() {
  const { schemes, version, isHydrated, updateScheme, addScheme, removeScheme, reset } =
    useSchemes();
  const { waterResults, floodResults, table, econ } = useAllResults();
  const { params, isModified, defaults } = useParams();

  // 全部展开 (新版) 还是只展开第一项 (旧版)
  const [expandedSet, setExpandedSet] = useState<Set<string>>(
    () => new Set(schemes.map((s) => s.id))
  );

  function toggleExpand(id: string) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 关联每个方案的实时计算结果
  const computedByScheme = useMemo(() => {
    const map: Record<string, any> = {};
    for (const sk of schemes.map((s) => s.id)) {
      const w = waterResults[sk];
      const f = floodResults[sk];
      const e = (econ as any[])?.find((r: any) => r.scheme === sk);
      const z_check = f?.Z_check ?? 0;
      const z_design = f?.Z_design ?? 0;
      map[sk] = {
        Z_dead: w?.Z_dead ?? 0,
        Np_wan: w?.Np_wan ?? 0,
        N_Y: w?.N_Y ?? 0,
        E_avg: w?.E_avg ?? 0,
        Z_design: z_design,
        Z_check: z_check,
        Z_dam: z_check > 0 || z_design > 0 ? computeZDam(z_design, z_check) : undefined,
        annualCost: e?.annual_total,
      };
    }
    return map;
  }, [waterResults, floodResults, econ, schemes, version]);

  // 导出 / 导入
  function handleExport() {
    const blob = new Blob([JSON.stringify(schemes, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wqx-schemes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length > 0) {
          if (window.confirm(`将覆盖当前 ${schemes.length} 个方案, 导入 ${data.length} 个方案, 是否继续?`)) {
            // 通过 reset + addScheme 模拟, 但 useSchemes 不提供 setAll
            // 简化处理: 直接保存到 localStorage 然后刷新
            window.localStorage.setItem("wqx.schemes.v1", JSON.stringify(data));
            window.location.reload();
          }
        }
      } catch (err) {
        window.alert("JSON 解析失败: " + (err as Error).message);
      }
    };
    input.click();
  }

  // 加载未完成时显示骨架
  if (!isHydrated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-transparent"
          style={{ borderTopColor: "var(--accent-color)" }}
        />
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          正在加载本地方案...
        </p>
      </div>
    );
  }

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="space-y-8">
      {/* 页头 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div
            className="text-[10px] font-mono uppercase tracking-widest mb-1"
            style={{ color: "var(--accent-color)" }}
          >
            SCHEME EDITOR / 方案编辑
          </div>
          <h1
            className="font-display text-3xl font-semibold tracking-tight"
            style={{ color: "var(--text)" }}
          >
            方案配置工作台
          </h1>
          <p
            className="text-sm mt-1.5 max-w-2xl"
            style={{ color: "var(--muted)" }}
          >
            编辑下方方案参数后, <span style={{ color: "var(--accent-color)" }}>方案总览、计算链路、调洪演算、经济比较</span> 等所有页面都会自动用新数据重算。
            数据保存在浏览器 <code style={{ color: "var(--accent-color)" }}>localStorage</code> 中。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleImport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
            style={{
              backgroundColor: "var(--bg-canvas)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            <Upload className="h-3.5 w-3.5" />
            导入 JSON
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
            style={{
              backgroundColor: "var(--bg-canvas)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            <Download className="h-3.5 w-3.5" />
            导出
          </button>
          <button
            onClick={() => {
              if (window.confirm(`确认重置为引擎默认 4 方案? 当前 ${schemes.length} 个自定义方案将丢失。`)) {
                reset();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
            style={{
              backgroundColor: "var(--bg-canvas)",
              color: "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重置默认
          </button>
          <button
            onClick={addScheme}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:opacity-90"
            style={{
              backgroundColor: "var(--accent-color)",
              color: "white",
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            添加方案
          </button>
        </div>
      </div>

      {/* 提示条 */}
      <div
        className="flex items-start gap-3 rounded-lg p-3.5"
        style={{
          backgroundColor: "var(--success-soft)",
          border: "1px solid var(--success)",
        }}
      >
        <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--success)" }} />
        <div className="text-sm" style={{ color: "var(--text)" }}>
          <b>已自动保存</b> · 共 <b>{schemes.length}</b> 个方案
          （默认 I/II/III/IV，可继续添加）· 上次编辑即写 localStorage
        </div>
      </div>

      {/* 方案卡片列表 */}
      <div className="space-y-4">
        {schemes.map((s, i) => (
          <SchemeCard
            key={s.id}
            data={s}
            index={i}
            total={schemes.length}
            computed={computedByScheme[s.id]}
            onChange={(patch) => updateScheme(s.id, patch)}
            onRemove={() => {
              if (window.confirm(`确认删除方案 ${s.id}?`)) {
                removeScheme(s.id);
              }
            }}
            canRemove={schemes.length > 1}
            isExpanded={expandedSet.has(s.id)}
            onToggleExpand={() => toggleExpand(s.id)}
          />
        ))}

        {schemes.length === 0 && (
          <div
            className="rounded-xl p-10 text-center"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px dashed var(--border)",
            }}
          >
            <Database className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--muted)" }} />
            <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
              方案列表已清空, 点击下方按钮重新添加。
            </p>
            <button
              onClick={addScheme}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md"
              style={{ backgroundColor: "var(--accent-color)", color: "white" }}
            >
              <Plus className="h-4 w-4" /> 添加第一个方案
            </button>
          </div>
        )}
      </div>

      {/* ============================================================
          对比表 (经 useAllResults 重算, 反映编辑结果)
          ============================================================ */}
      {table && (table as any[]).length > 0 && (
        <ComparisonTable
          schemes={schemes.map((s) => s.id)}
          table={table as any[]}
          computedByScheme={computedByScheme}
          isModified={isModified}
          params={params}
          defaults={defaults}
        />
      )}
    </div>
  );
}

// ============================================================
// 水利指标对比表 (改造自原 OverviewPage, 适配动态方案数量)
// ============================================================

function ComparisonTable({
  schemes,
  table,
  computedByScheme,
  isModified,
  params,
  defaults,
}: {
  schemes: string[];
  table: any[];
  computedByScheme: Record<string, any>;
  isModified: boolean;
  params: any;
  defaults: any;
}) {
  const INDICATORS = [
    { key: "Z_zheng",    name: "正常蓄水位",   unit: "m",    digits: 2 },
    { key: "Z_dead",     name: "死水位",       unit: "m",    digits: 2 },
    { key: "Z_fangshou", name: "防洪高水位",   unit: "m",    digits: 2 },
    { key: "Z_design",   name: "设计洪水位",   unit: "m",    digits: 2 },
    { key: "Z_check",    name: "校核洪水位",   unit: "m",    digits: 2 },
    { key: "Z_dam",      name: "坝顶高程",     unit: "m",    digits: 2 },
    { key: "V_xing",     name: "兴利库容",     unit: "亿m³", digits: 2 },
    { key: "V_fangshou", name: "防洪库容",     unit: "亿m³", digits: 2 },
    { key: "Np",         name: "保证出力",     unit: "万kW", scale: 1 / 1e4, digits: 0 },
    { key: "N_y",        name: "装机容量",     unit: "万kW", scale: 1 / 1e4, digits: 0 },
    { key: "E_avg",      name: "多年平均电能", unit: "亿度", digits: 2 },
  ];

  // 找出年费用最低作为推荐
  const econRows = useMemo(() => {
    const acs: { id: string; ac: number }[] = [];
    for (const sk of schemes) {
      const c = computedByScheme[sk];
      if (c?.annualCost != null) acs.push({ id: sk, ac: c.annualCost });
    }
    acs.sort((a, b) => a.ac - b.ac);
    const recommended = acs[0]?.id;
    return { recommended };
  }, [schemes, computedByScheme]);

  const affectedIndicators = useMemo<Set<string>>(() => {
    const affected = new Set<string>();
    const zChanged = Object.values(params.Z_zheng_offset).some((v: any) => v !== 0);
    const qChanged = params.Q_SAFE !== defaults.Q_SAFE;
    const rChanged = params.R0 !== defaults.R0;
    for (const def of INDICATORS) {
      if (qChanged || zChanged) {
        if (["Z_fangshou", "Z_design", "Z_check", "Z_dam"].includes(def.name)) {
          affected.add(def.name);
        }
      }
    }
    if (rChanged) affected.add("年费用");
    return affected;
  }, [params, defaults]);

  return (
    <section>
      <div className="mb-5 flex items-baseline justify-between">
        <h2
          className="font-display text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          水利指标对比表
        </h2>
        <span
          className="text-[11px] font-mono uppercase tracking-widest"
          style={{ color: "var(--muted)" }}
        >
          {schemes.length} 方案实时对比 · 单位见列尾
        </span>
      </div>

      {isModified && (
        <div
          className="mb-3 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm"
          style={{
            backgroundColor: "var(--accent-soft)",
            border: "1px solid var(--accent-color)",
            color: "var(--accent-color)",
          }}
        >
          <AlertCircle className="h-4 w-4" />
          当前参数已修改, 下方受影响的指标以紫底标注
        </div>
      )}

      <div
        className="overflow-hidden rounded-xl shadow-sm"
        style={{
          border: "1px solid var(--border)",
          backgroundColor: "var(--bg-canvas)",
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th
                  className="sticky left-0 z-10 min-w-[180px] px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    color: "var(--muted)",
                  }}
                >
                  指标
                </th>
                {schemes.map((sk) => {
                  const isRec = sk === econRows.recommended;
                  return (
                    <th
                      key={sk}
                      className="min-w-[112px] px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide"
                      style={
                        isRec
                          ? { backgroundColor: "var(--accent-soft)", color: "var(--accent-color)" }
                          : { backgroundColor: "var(--bg-canvas)", color: "var(--muted)" }
                      }
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        方案 {sk}
                        {isRec && <Star className="h-3 w-3" style={{ fill: "var(--accent-color)", color: "var(--accent-color)" }} />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {INDICATORS.map((def, idx) => {
                const isAffected = affectedIndicators.has(def.name);
                const isOdd = idx % 2 === 1;
                return (
                  <tr
                    key={def.name}
                    style={{
                      borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                      backgroundColor: isAffected
                        ? "var(--accent-soft)"
                        : isOdd
                          ? "var(--surface)"
                          : "transparent",
                    }}
                  >
                    <td
                      className="sticky left-0 z-10 px-5 py-2.5"
                      style={{
                        backgroundColor: "inherit",
                        color: "var(--text)",
                      }}
                    >
                      <span>{def.name}</span>
                      {def.unit && (
                        <span className="ml-1.5 text-xs font-mono" style={{ color: "var(--muted)" }}>
                          ({def.unit})
                        </span>
                      )}
                    </td>
                    {schemes.map((sk) => {
                      const isRec = sk === econRows.recommended;
                      const row = table.find((r) => r.scheme === sk);
                      let val = row?.[def.key];
                      if (val == null && def.key === "Z_dam") {
                        val = computedByScheme[sk]?.Z_dam;
                      }
                      if (def.scale && typeof val === "number") val = val * def.scale;
                      return (
                        <td
                          key={sk}
                          className="px-5 py-2.5 text-right font-mono tabular-nums"
                          style={{
                            color: isRec ? "var(--accent-color)" : "var(--text)",
                            fontWeight: isRec ? 600 : 400,
                          }}
                        >
                          {fmtCell(val, def.digits)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr style={{ borderTop: "2px solid var(--border)" }}>
                <td
                  className="sticky left-0 z-10 px-5 py-2.5 font-semibold"
                  style={{ backgroundColor: "var(--bg-canvas)", color: "var(--text)" }}
                >
                  年费用
                  <span className="ml-1.5 text-xs font-mono" style={{ color: "var(--muted)" }}>(万元/年)</span>
                </td>
                {schemes.map((sk) => {
                  const c = computedByScheme[sk];
                  const isRec = sk === econRows.recommended;
                  return (
                    <td
                      key={sk}
                      className="px-5 py-2.5 text-right font-mono tabular-nums"
                      style={{
                        color: isRec ? "var(--accent-color)" : "var(--text)",
                        fontWeight: isRec ? 600 : 400,
                      }}
                    >
                      {c?.annualCost != null ? fmtCell(c.annualCost, 0) : "—"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
