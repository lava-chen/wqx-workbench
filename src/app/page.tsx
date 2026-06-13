"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  GitBranch,
  BarChart3,
  Bot,
  SlidersHorizontal,
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
import { ParamsProvider } from "@/hooks/useParams";
import { DatasetProvider } from "@/hooks/useDataset";

const tabs = [
  { id: "dashboard", label: "观测台", icon: LayoutDashboard },
  { id: "overview", label: "方案编辑", icon: Sparkles },
  { id: "calc-chain", label: "计算链路", icon: GitBranch },
  { id: "data", label: "数据档案", icon: Database },
  { id: "charts", label: "交互图表", icon: BarChart3 },
  { id: "agent", label: "Agent 自检", icon: Bot },
  { id: "params", label: "参数敏感度", icon: SlidersHorizontal },
];

function HomeContent() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const isAgentTab = activeTab === "agent";

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {/* Tab Navigation */}
      <div
        className="shrink-0 border-b"
        style={{ backgroundColor: "var(--bg-canvas)", borderColor: "var(--border)" }}
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-1 h-12 overflow-x-auto shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="shrink-0 flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
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
      <main
        className={cn(
          "flex-1 min-h-0 max-w-7xl mx-auto px-6 w-full flex flex-col",
          isAgentTab ? "py-4 overflow-hidden" : "py-6 overflow-y-auto",
        )}
      >
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
    <DatasetProvider>
      <ParamsProvider>
        <HomeContent />
      </ParamsProvider>
    </DatasetProvider>
  );
}
