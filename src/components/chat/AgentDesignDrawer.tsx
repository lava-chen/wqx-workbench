"use client";

/**
 * Agent 设计抽屉 — 右侧滑入面板
 *
 * 风格对齐:
 *  - 衬线标题 (font-display = Georgia/Songti)
 *  - 主色: --accent-color (紫色 #7c3aed)
 *  - 圆角: 24px (--radius-2xl)
 *  - 背景: 浅奶油色 (--bg-canvas) + 渐入
 *  - 卡片: 淡紫底 + 紫色边 (--accent-soft / --accent-color)
 */

import { useEffect, useState } from "react";
import {
  X,
  Database,
  Filter,
  FileText,
  Cpu,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentDesignDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function AgentDesignDrawer({ open, onClose }: AgentDesignDrawerProps) {
  // 关闭时延迟卸载, 让出场动画跑完
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 锁滚动
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      {/* ── Drawer panel ── */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Agent 设计说明"
        onTransitionEnd={() => {
          if (!open) setMounted(false);
        }}
        className={cn(
          "absolute top-0 right-0 h-full w-full sm:w-[460px] md:w-[520px]",
          "flex flex-col shadow-2xl",
          "transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{
          backgroundColor: "var(--bg-canvas)",
          borderTopLeftRadius: "var(--radius-2xl)",
          borderBottomLeftRadius: "var(--radius-2xl)",
        }}
      >
        {/* ── Header ── */}
        <div
          className="shrink-0 px-6 pt-5 pb-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider mb-2"
                style={{
                  backgroundColor: "var(--accent-soft)",
                  color: "var(--accent-color)",
                }}
              >
                <Sparkles className="h-3 w-3" />
                architecture
              </div>
              <h2
                className="font-display text-[22px] leading-tight font-semibold"
                style={{ color: "var(--text)" }}
              >
                Agent 是怎么设计的
              </h2>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--muted)" }}
              >
                上下文装配 · 规则分类 · 提示词工程 · 降级兜底
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors"
              style={{
                backgroundColor: "var(--surface)",
                color: "var(--muted)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  "var(--surface-hover)";
                (e.currentTarget as HTMLElement).style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  "var(--surface)";
                (e.currentTarget as HTMLElement).style.color = "var(--muted)";
              }}
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Body (滚动) ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 总览 */}
          <Section
            icon={<Layers className="h-4 w-4" />}
            eyebrow="总览"
            title="一条问题, 走过 4 道工序"
          >
            <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
              用户提问后, 服务端依次执行:
              <span className="font-mono text-[12px] mx-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--chip)" }}>
                装配
              </span>
              <ArrowRight className="inline h-3 w-3 align-middle" style={{ color: "var(--muted)" }} />
              <span className="font-mono text-[12px] mx-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--chip)" }}>
                分类
              </span>
              <ArrowRight className="inline h-3 w-3 align-middle" style={{ color: "var(--muted)" }} />
              <span className="font-mono text-[12px] mx-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--chip)" }}>
                拼模板
              </span>
              <ArrowRight className="inline h-3 w-3 align-middle" style={{ color: "var(--muted)" }} />
              <span className="font-mono text-[12px] mx-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--chip)" }}>
                调 LLM
              </span>
              .
            </p>
            <p
              className="text-[12px] leading-relaxed mt-2"
              style={{ color: "var(--muted)" }}
            >
              没有外部依赖, 纯字符串函数; 7B 模型也能跑, 无 key 时自动降级到本地兜底.
            </p>
          </Section>

          {/* 1. 上下文 */}
          <Section
            step="01"
            icon={<Database className="h-4 w-4" />}
            eyebrow="上下文装配"
            title="把 23 指标 + 4 方案装进 prompt"
          >
            <ul className="text-sm space-y-1.5" style={{ color: "var(--text)" }}>
              <li>
                <CodeChip>context.ts</CodeChip> 服务端跑一遍水利引擎, 产出
                <CodeChip>4 方案完整结果</CodeChip>
              </li>
              <li>
                <CodeChip>INDICATORS</CodeChip> 23 项定义 + extractor 函数, 渲染时按单位格式化
              </li>
              <li>
                <CodeChip>taskChecklist</CodeChip> 23 项完成度 + evidence + warning
              </li>
              <li>
                按分类追加专题段:
                <CodeChip>防洪</CodeChip> /
                <CodeChip>装机电能</CodeChip> /
                <CodeChip>兴利</CodeChip>
              </li>
            </ul>
            <Hint>总长控制 ~3000 tokens, 适配 Qwen 7B</Hint>
          </Section>

          {/* 2. 分类 */}
          <Section
            step="02"
            icon={<Filter className="h-4 w-4" />}
            eyebrow="问题分类"
            title="零 LLM 调用, 纯关键词规则"
          >
            <p className="text-sm" style={{ color: "var(--text)" }}>
              5 类问题 + 优先级链: <CodeChip>checklist</CodeChip> &gt; <CodeChip>comparison</CodeChip> &gt; <CodeChip>flood</CodeChip> &gt; <CodeChip>indicator</CodeChip> &gt; <CodeChip>recommendation</CodeChip>
            </p>
            <div className="grid grid-cols-1 gap-1.5 mt-3">
              {[
                { k: "checklist", d: "23 项是否完成" },
                { k: "comparison", d: "为什么 II 最优" },
                { k: "flood-explain", d: "防洪专题解释" },
                { k: "indicator-source", d: "指标溯源" },
                { k: "recommendation", d: "答辩前自查" },
              ].map((row) => (
                <div
                  key={row.k}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[12px]"
                  style={{ backgroundColor: "var(--surface)" }}
                >
                  <code style={{ color: "var(--accent-color)" }}>{row.k}</code>
                  <span style={{ color: "var(--muted)" }}>{row.d}</span>
                </div>
              ))}
            </div>
            <Hint>分类结果同时决定: 追加哪段 context + system 里写哪段 focus</Hint>
          </Section>

          {/* 3. 提示词 */}
          <Section
            step="03"
            icon={<FileText className="h-4 w-4" />}
            eyebrow="提示词工程"
            title="system 固定 + user 模板拼接"
          >
            <div className="space-y-2.5 text-sm" style={{ color: "var(--text)" }}>
              <p>
                <b className="font-display">System</b> 注入 4 类边界: 角色 / 知识 / 格式 / 引用,
                全程禁止编造数字.
              </p>
              <p>
                <b className="font-display">User</b> 按顺序拼 5 段:
              </p>
              <ol
                className="text-[12.5px] space-y-1 pl-4 list-decimal"
                style={{ color: "var(--text)" }}
              >
                <li>工程上下文 (参数 / 23 指标 / 经济 / 任务清单)</li>
                <li>按需追加专题段 (flood / energy / xingli)</li>
                <li>最近 3 轮对话 (单条 &gt;600 字截断)</li>
                <li>当前问题 + 来自分类器的 <CodeChip>focus</CodeChip></li>
                <li>强制文末列参考来源</li>
              </ol>
            </div>
            <Hint>temperature 0.2 · max_tokens 1800 · 严控不跑偏</Hint>
          </Section>

          {/* 4. LLM */}
          <Section
            step="04"
            icon={<Cpu className="h-4 w-4" />}
            eyebrow="LLM 适配"
            title="OpenRouter(Qwen) + 双重降级"
          >
            <ul className="text-sm space-y-1.5" style={{ color: "var(--text)" }}>
              <li>
                走 OpenAI 兼容协议, 默认 <CodeChip>qwen-2.5-7b-instruct</CodeChip>
              </li>
              <li>45s timeout + AbortController, 失败不抛</li>
              <li>
                <b>无 key</b> → 走本地兜底, UI 立刻可用
              </li>
              <li>
                <b>调用失败</b> → 兜底 + 错误回显, 不让前端崩
              </li>
            </ul>
          </Section>

          {/* 5. 可追溯 */}
          <Section
            icon={<ShieldCheck className="h-4 w-4" />}
            eyebrow="可追溯"
            title="每个数字都能问到出处"
          >
            <p className="text-sm" style={{ color: "var(--text)" }}>
              每条消息末尾会自动列出
              <CodeChip>参考来源</CodeChip>:
              任务书 pX · 代码 file:func · 证据段落.
            </p>
            <div
              className="mt-3 rounded-lg p-3 text-[12px] font-mono leading-relaxed"
              style={{
                backgroundColor: "var(--surface)",
                color: "var(--text)",
              }}
            >
              <div style={{ color: "var(--muted)" }}>// 引用链示例</div>
              <div>
                <span style={{ color: "var(--accent-color)" }}>公式</span>{" "}
                <span style={{ color: "var(--muted)" }}>→</span>{" "}
                <span style={{ color: "var(--accent-color)" }}>任务书 p9</span>{" "}
                <span style={{ color: "var(--muted)" }}>→</span>{" "}
                <span style={{ color: "var(--accent-color)" }}>firmPower.ts:findNpForScheme</span>
              </div>
            </div>
          </Section>

          {/* 文件索引 */}
          <div
            className="rounded-2xl p-4 text-[12px] leading-relaxed"
            style={{
              backgroundColor: "var(--accent-soft)",
              color: "var(--text)",
            }}
          >
            <div
              className="font-mono text-[10px] uppercase tracking-wider mb-2"
              style={{ color: "var(--accent-color)" }}
            >
              source files
            </div>
            <div className="grid grid-cols-2 gap-y-1 gap-x-3">
              {[
                ["context.ts", "数据装配"],
                ["compute.ts", "服务端引擎"],
                ["classify.ts", "问题分类"],
                ["prompts.ts", "模板拼接"],
                ["llm.ts", "OpenRouter 适配"],
                ["indicators.ts", "23 项定义"],
              ].map(([f, d]) => (
                <div key={f} className="flex items-baseline gap-1.5">
                  <code style={{ color: "var(--accent-color)" }}>{f}</code>
                  <span style={{ color: "var(--muted)" }}>· {d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ── Sub Components ─────────────────────────────────

function Section({
  step,
  icon,
  eyebrow,
  title,
  children,
}: {
  step?: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-4 border"
      style={{
        backgroundColor: "var(--bg-canvas)",
        borderColor: "var(--border)",
      }}
    >
      <header className="flex items-center gap-2 mb-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent-color)" }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="font-mono text-[10px] uppercase tracking-wider"
            style={{ color: "var(--accent-color)" }}
          >
            {eyebrow}
            {step && <span className="ml-2 opacity-60">step {step}</span>}
          </div>
          <h3
            className="font-display text-[15px] font-semibold leading-snug"
            style={{ color: "var(--text)" }}
          >
            {title}
          </h3>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

function CodeChip({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="font-mono text-[11.5px] px-1.5 py-0.5 rounded mx-0.5"
      style={{
        backgroundColor: "var(--accent-soft)",
        color: "var(--accent-color)",
      }}
    >
      {children}
    </code>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11.5px] mt-2.5 italic"
      style={{ color: "var(--muted)" }}
    >
      — {children}
    </p>
  );
}
