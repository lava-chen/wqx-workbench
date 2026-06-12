"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Loader2, AlertCircle, FileText, Trash2, Copy, Check, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { AgentDesignDrawer } from "@/components/chat/AgentDesignDrawer";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  sources?: { file: string; section: string }[];
  timestamp: number;
}

// ── Constants ───────────────────────────────────────────

const PRESET_QUESTIONS = [
  "任务书要求的23项水利指标是否全部完成？",
  "方案 II 为什么最优？",
  "防洪限制水位为什么等于正常蓄水位？",
  "某个指标是从哪个数据、哪个公式来的？",
  "当前报告还有哪些可能被老师质疑的地方？",
];

const API_URL =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_AGENT_API_URL
    ? process.env.NEXT_PUBLIC_AGENT_API_URL
    : "/api/agent";

const STORAGE_KEY = "wqx:agent:messages:v1";
const STORAGE_MAX = 200; // 最多保留 200 条

// ── Helpers ─────────────────────────────────────────────

let msgCounter = 0;
function nextId(): string {
  msgCounter += 1;
  return `msg-${Date.now()}-${msgCounter}`;
}

/** 从 localStorage 安全读取 (SSR-safe, JSON 失败返 null) */
function loadMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 裁剪到 max, 避免历史太久撑爆存储
    return parsed.slice(-STORAGE_MAX) as Message[];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = messages.slice(-STORAGE_MAX);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* 配额满 / 隐私模式, 静默 */
  }
}

/** 把对话序列化成 Markdown (用于复制导出) */
function formatMessagesAsMarkdown(messages: Message[]): string {
  const lines: string[] = [];
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const userCount = messages.filter((m) => m.role === "user").length;
  const agentCount = messages.length - userCount;

  lines.push("# Agent 自检对话");
  lines.push("");
  lines.push(`> 导出时间: ${now}`);
  lines.push(`> 共 ${messages.length} 条消息 (${userCount} 提问 / ${agentCount} 回答)`);
  lines.push("");

  messages.forEach((m) => {
    const ts = new Date(m.timestamp).toLocaleString("zh-CN", { hour12: false });
    const head = m.role === "user" ? `## 👤 用户` : `## 🤖 Agent`;
    lines.push(`${head}  ·  ${ts}`);
    lines.push("");
    // 用户内容是纯文本, 缩进; agent 内容是 markdown 源码, 直接放
    if (m.role === "user") {
      lines.push("> " + m.content.split("\n").join("\n> "));
    } else {
      lines.push(m.content);
      if (m.sources && m.sources.length > 0) {
        lines.push("");
        lines.push("**参考来源**");
        m.sources.forEach((s) => {
          lines.push(`- ${s.file}${s.section ? ` · ${s.section}` : ""}`);
        });
      }
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}

// ── Component ───────────────────────────────────────────

export function AgentAuditPage() {
  // 用 lazy initializer: 首次渲染时读 localStorage, SSR 期间返 []
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [designOpen, setDesignOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 消息变化时持久化 (跳过初始挂载, 避免覆盖)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    saveMessages(messages);
  }, [messages]);

  // 滚到底
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 清空对话
  const handleClear = useCallback(() => {
    if (messages.length === 0) return;
    if (!window.confirm(`清空当前对话? (${messages.length} 条消息)`)) return;
    setMessages([]);
    setApiError(null);
  }, [messages.length]);

  // 复制为 Markdown (含"已复制"反馈)
  const [copied, setCopied] = useState(false);
  const handleExport = useCallback(async () => {
    if (messages.length === 0) return;
    const md = formatMessagesAsMarkdown(messages);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板被拒 → 降级: 用 textarea select + execCommand
      const ta = document.createElement("textarea");
      ta.value = md;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* 真的不行就静默, 不打扰用户 */
      } finally {
        document.body.removeChild(ta);
      }
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || loading) return;

      const userMsg: Message = {
        id: nextId(),
        role: "user",
        content: question.trim(),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      setApiError(null);

      try {
        // 取当前快照作为历史 (含刚加的 user msg 也行, 后端会自己处理)
        const snapshot = [...messages, userMsg];
        const history = snapshot.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: question.trim(),
            history,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        const agentMsg: Message = {
          id: nextId(),
          role: "agent",
          content: data.answer ?? "（Agent 未返回有效回答）",
          sources: data.sources,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, agentMsg]);
      } catch {
        setApiError("Agent API 未连接，请确保后端服务已启动");
      } finally {
        setLoading(false);
      }
    },
    [messages, loading],
  );

  const handleSend = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  const handlePresetClick = useCallback(
    (question: string) => {
      sendMessage(question);
    },
    [sendMessage],
  );

  return (
    <div
      className="flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden"
      style={{ height: "calc(100dvh - 9rem)" }}
    >
      {/* ── Header (固定, 不滚动) ── */}
      <div className="shrink-0 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-base font-medium text-[var(--text)] font-display">Agent 自检</div>
            <div className="text-xs text-[var(--muted)] truncate">
              基于课程设计知识库 · 模型 <span className="font-mono text-[10px]">qwen-2.5-7b</span> · OpenRouter
              {messages.length > 0 && (
                <span className="ml-1.5">· 已存 {messages.length} 条</span>
              )}
            </div>
          </div>

          {/* 操作按钮组: 复制 + 清空 */}
          <div className="shrink-0 flex items-center gap-1.5">
            {/* 复制为 Markdown */}
            <button
              type="button"
              onClick={handleExport}
              disabled={messages.length === 0}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: copied ? "var(--success-soft)" : "var(--chip)",
                color: copied ? "var(--success)" : "var(--muted)",
              }}
              onMouseEnter={(e) => {
                if (messages.length === 0) return;
                (e.currentTarget as HTMLElement).style.color = "var(--accent-color)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = copied
                  ? "var(--success)"
                  : "var(--muted)";
              }}
              title="复制整个对话为 Markdown 到剪贴板"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  复制
                </>
              )}
            </button>

            {/* 清空 */}
            <button
              type="button"
              onClick={handleClear}
              disabled={messages.length === 0}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "var(--chip)",
                color: "var(--muted)",
              }}
              onMouseEnter={(e) => {
                if (messages.length === 0) return;
                (e.currentTarget as HTMLElement).style.color = "var(--error)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--muted)";
              }}
              title="清空对话历史 (本地存储)"
            >
              <Trash2 className="h-3 w-3" />
              清空
            </button>
          </div>
        </div>

        {/* Preset question chips */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {PRESET_QUESTIONS.map((q) => (
            <Badge
              key={q}
              variant="secondary"
              className="cursor-pointer transition-colors text-xs py-1"
              style={{ backgroundColor: "var(--chip)", color: "var(--muted)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "var(--accent-soft)";
                (e.currentTarget as HTMLElement).style.color = "var(--accent-color)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "var(--chip)";
                (e.currentTarget as HTMLElement).style.color = "var(--muted)";
              }}
              onClick={() => handlePresetClick(q)}
            >
              {q}
            </Badge>
          ))}
        </div>
      </div>

      {/* ── Chat area (仅这里滚动) ── */}
      <div
        className="flex-1 overflow-y-auto min-h-0"
        style={{ backgroundColor: "var(--bg-canvas)" }}
      >
        <div className="px-4 py-4 space-y-3">
          {/* API error banner */}
          {apiError && (
            <div
              className="flex items-start gap-2 rounded-lg p-3 text-sm"
              style={{
                backgroundColor: "var(--error-soft)",
                color: "var(--error)",
                border: "1px solid var(--error)",
              }}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{apiError}</span>
            </div>
          )}

          {/* Empty state */}
          {messages.length === 0 && !apiError && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h3 className="text-sm font-medium text-[var(--text)] mb-1">有什么问题可以问我</h3>
              <p className="text-xs text-[var(--muted)] max-w-sm">
                点击上方预设问题快速提问，或在下方输入框中输入您的问题
              </p>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-start gap-3">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--accent-soft)" }}
              >
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  style={{ color: "var(--accent-color)" }}
                />
              </div>
              <div
                className="rounded-2xl rounded-tl-md px-4 py-2.5"
                style={{ backgroundColor: "var(--surface)" }}
              >
                <div
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:0ms]"
                    style={{ backgroundColor: "var(--accent-color)" }}
                  />
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:150ms]"
                    style={{ backgroundColor: "var(--accent-color)" }}
                  />
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:300ms]"
                    style={{ backgroundColor: "var(--accent-color)" }}
                  />
                  <span className="ml-1.5">正在思考…</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input area (固定, duya 风格 pill) ── */}
      <div
        className="shrink-0 border-t border-[var(--border)] p-3"
        style={{ backgroundColor: "var(--bg-canvas)" }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="rounded-2xl p-2 transition-shadow"
          style={{
            backgroundColor: "var(--surface)",
            boxShadow:
              "inset 0 0 0 1px var(--border-color, var(--border)), 0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // auto-resize
              const t = e.target;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="问点什么… (Enter 发送, Shift+Enter 换行)"
            disabled={loading}
            rows={1}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none min-h-[40px] max-h-[160px] py-2 px-2"
          />

          {/* Bottom toolbar */}
          <div className="mt-1 px-1 flex items-center justify-between">
            {/* Left: context info */}
            <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground">
              <span
                className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-md font-mono"
                style={{ backgroundColor: "var(--chip)" }}
              >
                Qwen 2.5 · 7B
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={() => setDesignOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDesignOpen(true);
                  }
                }}
                className="hidden sm:inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] cursor-pointer transition-colors hover:text-[var(--accent-color)]"
                title="点击查看 Agent 设计说明"
              >
                <span>上下文 23 指标 + 4 方案</span>
                <Info className="h-3 w-3 opacity-60" />
              </span>
            </div>

            {/* Right: Send / Stop */}
            {loading ? (
              <button
                type="button"
                disabled
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors opacity-70 cursor-not-allowed"
                style={{ backgroundColor: "var(--error-soft)", color: "var(--error)" }}
                title="正在回答…"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="w-8 h-8 rounded-full text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: "var(--send-btn)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "var(--send-btn-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "var(--send-btn)";
                }}
                title="发送"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── 设计说明抽屉 ── */}
      <AgentDesignDrawer open={designOpen} onClose={() => setDesignOpen(false)} />
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex items-start gap-3",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: isUser ? "var(--text)" : "var(--accent-soft)",
        }}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" style={{ color: "var(--bg-canvas)" }} />
        ) : (
          <Bot className="h-3.5 w-3.5" style={{ color: "var(--accent-color)" }} />
        )}
      </div>

      {/* Bubble content */}
      <div
        className="max-w-[80%] rounded-2xl px-4 py-2.5"
        style={{
          // 用户气泡走"反色": 背景 = text 色, 文字 = bg-canvas 色
          // 永远高对比, 不受主题影响 (iMessage 风格)
          backgroundColor: isUser ? "var(--text)" : "var(--surface)",
          color: isUser ? "var(--bg-canvas)" : "var(--text)",
          borderTopRightRadius: isUser ? "4px" : undefined,
          borderTopLeftRadius: isUser ? undefined : "4px",
        }}
      >
        {isUser ? (
          <p
            className="text-sm whitespace-pre-wrap break-words"
            style={{ color: "var(--bg-canvas)" }}
          >
            {message.content}
          </p>
        ) : (
          <div>
            <MarkdownRenderer>{message.content}</MarkdownRenderer>

            {/* Source citations */}
            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-2">
                <p className="text-[11px] font-medium text-[var(--muted)] mb-1">
                  参考来源
                </p>
                {message.sources.map((src, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1.5 text-[11px] text-[var(--muted)]"
                  >
                    <FileText className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      {src.file}
                      {src.section ? ` · ${src.section}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}