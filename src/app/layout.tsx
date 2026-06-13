import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { ThemeProvider } from "./theme-provider";
import { ThemeToggle } from "@/components/ThemeToggle";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "五强溪水电站 | 水利计算可复核决策工作台",
  description: "基于 TypeScript 计算内核与 Agent 自检的课程设计辅助系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full font-display flex flex-col">
        <ThemeProvider>
          {/* Professional Brand Header */}
          <header className="border-b border-[var(--border)] bg-[var(--bg-canvas)]/85 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
              {/* Brand */}
              <div className="flex items-center gap-3">
                <div className="h-7 w-1 bg-[var(--accent-color)] rounded-full" />
                <div className="flex flex-col leading-none">
                  <span className="font-brand text-[19px] tracking-tight text-[var(--text)]">
                    五强溪水电站
                  </span>
                  <span className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted)]">
                    Wuqiangxi Hydropower · Course Design
                  </span>
                </div>
              </div>

              {/* Right cluster: workbench label + theme toggle */}
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-[var(--accent-color)] bg-[var(--accent-soft)] border border-[var(--accent-color)]/20 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-color)]" />
                  水利计算可复核决策工作台
                </span>
                <a
                  href="https://github.com/lava-chen/wqx-workbench"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub 仓库"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] btn-press"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <ThemeToggle />
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 flex flex-col">{children}</main>

          {/* Minimal Footer */}
          <footer className="border-t border-[var(--border)] py-3 text-center text-xs text-[var(--muted)]">
            五强溪水电站课程设计 · 水利计算可复核决策工作台 · {new Date().getFullYear()}
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
