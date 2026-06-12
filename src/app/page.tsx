"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  GitBranch,
  BarChart3,
  Bot,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  Database,
} from "lucide-react";
import { SchemeEditorPage } from "@/components/pages/SchemeEditorPage";
import { CalculationChainPage } from "@/components/pages/CalculationChainPage";
import { ChartsPage } from "@/components/pages/ChartsPage";
import { AgentAuditPage } from "@/components/pages/AgentAuditPage";
import { SensitivityPage } from "@/components/pages/SensitivityPage";
import { DataPage } from "@/components/pages/DataPage";
import { DashboardPage } from "@/components/pages/DashboardPage";
import { ParamsProvider, useParams } from "@/hooks/useParams";

const tabs = [
  { id: "dashboard", label: "观测台", icon: LayoutDashboard },
  { id: "params", label: "参数配置", icon: SlidersHorizontal },
  { id: "overview", label: "方案编辑", icon: Sparkles },
  { id: "calc-chain", label: "计算链路", icon: GitBranch },
  { id: "data", label: "数据档案", icon: Database },
  { id: "charts", label: "交互图表", icon: BarChart3 },
  { id: "agent", label: "Agent 自检", icon: Bot },
];

// ── 顶栏：当前参数只读状态条 ───────────────────────
function CurrentParamsBar() {
  const { params, reset, isModified, defaults } = useParams();

  return (
    <div
      className="border-b"
      style={{
        backgroundColor: "var(--shell-bg)",
        borderColor: "var(--border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 8px -2px rgba(0,0,0,0.04)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} />
          <span
            className="text-[11px] uppercase tracking-wider font-semibold shrink-0"
            style={{ color: "var(--text)" }}
          >
            当前参数
          </span>
          <div className="flex items-center gap-2 text-xs overflow-x-auto">
            <ParamChip
              label="Q安"
              value={params.Q_SAFE}
              unit="m³/s"
              modified={params.Q_SAFE !== defaults.Q_SAFE}
              tooltip="下游安全泄量，影响调洪演算结果"
            />
            <ParamChip
              label="r₀"
              value={params.R0.toFixed(2)}
              modified={params.R0 !== defaults.R0}
              tooltip="经济比较折算率，影响年费用与推荐方案"
            />
            <ParamChip
              label="查看"
              value={params.scheme}
              modified={false}
              tooltip="当前页面聚焦的方案（仅展示用，不参与计算）"
            />
            {Object.entries(params.Z_zheng_offset).some(([, v]) => v !== 0) && (
              <ParamChip
                label="Z正偏移"
                value={Object.entries(params.Z_zheng_offset)
                  .filter(([, v]) => v !== 0)
                  .map(([k, v]) => `${k}:${v > 0 ? "+" : ""}${v}m`)
                  .join(" ")}
                modified={true}
                tooltip="正常蓄水位偏移量（m）"
              />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isModified && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors"
              style={{
                color: "var(--muted)",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--muted)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <RotateCcw className="h-3 w-3" />
              重置默认
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ParamChip({
  label,
  value,
  unit,
  modified,
  tooltip,
}: {
  label: string;
  value: string | number;
  unit?: string;
  modified: boolean;
  tooltip?: string;
}) {
  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono transition-colors cursor-help"
      style={{
        backgroundColor: modified ? "var(--accent-soft)" : "var(--bg-canvas)",
        color: modified ? "var(--accent)" : "var(--text)",
        border: "1px solid " + (modified ? "var(--accent)" : "var(--border)"),
      }}
    >
      <span style={{ color: "var(--muted)" }}>{label}=</span>
      <span className="font-semibold">{value}</span>
      {unit && <span style={{ color: "var(--muted)" }}>{unit}</span>}
    </span>
  );
}

function HomeContent() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="flex flex-col min-h-screen">
      {/* 当前参数状态条 */}
      <CurrentParamsBar />

      {/* Tab Navigation (sticky 在 header 下方) */}
      <div
        className="border-b sticky top-14 z-30"
        style={{ backgroundColor: "var(--bg-canvas)", borderColor: "var(--border)" }}
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-1 h-12 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: isActive ? "var(--accent-soft)" : "transparent",
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    border: "1px solid " + (isActive ? "var(--accent)" : "transparent"),
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Page Content */}
      <main className="flex-1 min-h-0 max-w-7xl mx-auto px-6 py-6 w-full flex flex-col">
        {activeTab === "dashboard" && <DashboardPage onNavigate={setActiveTab} />}
        {activeTab === "params" && <SensitivityPage />}
        {activeTab === "overview" && <SchemeEditorPage />}
        {activeTab === "calc-chain" && <CalculationChainPage />}
        {activeTab === "data" && <DataPage />}
        {activeTab === "charts" && <ChartsPage />}
        {activeTab === "agent" && <AgentAuditPage />}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <ParamsProvider>
      <HomeContent />
    </ParamsProvider>
  );
}
