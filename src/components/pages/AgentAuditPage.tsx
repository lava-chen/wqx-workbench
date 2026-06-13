"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  Copy,
  FileSearch,
  FileText,
  Info,
  Loader2,
  Send,
  Trash2,
  User,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { AgentDesignDrawer } from "@/components/chat/AgentDesignDrawer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MessageSource {
  file: string;
  section: string;
}

interface MessageEvidence {
  title: string;
  snippet: string;
  sourceType: string;
  file: string;
  section?: string;
  relevance: number;
}

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  sources?: MessageSource[];
  evidence?: MessageEvidence[];
  timestamp: number;
}

const PRESET_QUESTIONS = [
  "任务书要求的 23 项水利指标是否全部完成？",
  "方案 II 为什么最优？",
  "防洪限制水位为什么等于正常蓄水位？",
  "某个指标是从哪个数据、哪个公式算出来的？",
  "当前报告还有哪些地方可能被老师质疑？",
];

const API_URL =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_AGENT_API_URL
    ? process.env.NEXT_PUBLIC_AGENT_API_URL
    : "/api/agent";

const STORAGE_KEY = "wqx:agent:messages:v1";
const STORAGE_MAX = 200;

let messageCounter = 0;

function nextId(): string {
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}

function loadMessages(): Message[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.slice(-STORAGE_MAX) as Message[]) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-STORAGE_MAX)));
  } catch {
    // Ignore quota or private mode errors.
  }
}

function formatMessagesAsMarkdown(messages: Message[]): string {
  const lines: string[] = [];
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const userCount = messages.filter((item) => item.role === "user").length;

  lines.push("# Agent 自检对话");
  lines.push("");
  lines.push(`> 导出时间：${now}`);
  lines.push(`> 共 ${messages.length} 条消息（${userCount} 条提问 / ${messages.length - userCount} 条回答）`);
  lines.push("");

  for (const message of messages) {
    const ts = new Date(message.timestamp).toLocaleString("zh-CN", { hour12: false });
    lines.push(`## ${message.role === "user" ? "用户" : "Agent"} / ${ts}`);
    lines.push("");

    if (message.role === "user") {
      lines.push(`> ${message.content.split("\n").join("\n> ")}`);
    } else {
      lines.push(message.content);

      if (message.sources?.length) {
        lines.push("");
        lines.push("**参考来源**");
        for (const source of message.sources) {
          lines.push(`- ${source.file}${source.section ? ` / ${source.section}` : ""}`);
        }
      }

      if (message.evidence?.length) {
        lines.push("");
        lines.push("**调查证据**");
        for (const evidence of message.evidence) {
          lines.push(
            `- ${evidence.title} / ${evidence.file}${evidence.section ? ` / ${evidence.section}` : ""} / 相关度 ${evidence.relevance}`,
          );
          lines.push(`  摘录：${evidence.snippet}`);
        }
      }
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export function AgentAuditPage() {
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleClear = useCallback(() => {
    if (messages.length === 0) return;
    if (!window.confirm(`清空当前对话？共 ${messages.length} 条消息。`)) return;
    setMessages([]);
    setApiError(null);
  }, [messages.length]);

  const handleExport = useCallback(async () => {
    if (messages.length === 0) return;

    const markdown = formatMessagesAsMarkdown(messages);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = markdown;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || loading) return;

      const userMessage: Message = {
        id: nextId(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };

      const snapshot = [...messages, userMessage];
      setMessages(snapshot);
      setInput("");
      setLoading(true);
      setApiError(null);

      try {
        const history = snapshot.map((item) => ({
          role: item.role,
          content: item.content,
        }));

        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmed,
            history,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const agentMessage: Message = {
          id: nextId(),
          role: "agent",
          content: data.answer ?? "Agent 未返回有效回答。",
          sources: data.sources,
          evidence: data.evidence,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, agentMessage]);
      } catch {
        setApiError("Agent API 暂时不可用，请确认本地服务已经启动。");
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, messages],
  );

  const handleSend = useCallback(() => {
    void sendMessage(input);
  }, [input, sendMessage]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="shrink-0 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-display text-base font-medium text-[var(--text)]">Agent 自检</div>
            <div className="truncate text-xs text-[var(--muted)]">
              基于课设知识库、本地代码与文档检索 · 模型
              <span className="ml-1 font-mono text-[10px]">qwen-2.5-7b</span>
              {messages.length > 0 && <span className="ml-1.5">· 已存 {messages.length} 条</span>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleExport}
              disabled={messages.length === 0}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                backgroundColor: copied ? "var(--success-soft)" : "var(--chip)",
                color: copied ? "var(--success)" : "var(--muted)",
              }}
              title="复制整个对话为 Markdown"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "已复制" : "复制"}
            </button>

            <button
              type="button"
              onClick={handleClear}
              disabled={messages.length === 0}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--chip)] px-2 py-1 text-[11px] text-[var(--muted)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              title="清空本地对话历史"
            >
              <Trash2 className="h-3 w-3" />
              清空
            </button>
          </div>
        </div>

        <div className="mt-3 flex max-h-[72px] flex-wrap gap-1.5 overflow-y-auto pr-1">
          {PRESET_QUESTIONS.map((question) => (
            <Badge
              key={question}
              variant="secondary"
              className="cursor-pointer py-1 text-xs transition-colors"
              style={{ backgroundColor: "var(--chip)", color: "var(--muted)" }}
              onClick={() => void sendMessage(question)}
            >
              {question}
            </Badge>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" style={{ backgroundColor: "var(--bg-canvas)" }}>
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col space-y-3 px-4 py-4">
          {apiError && (
            <div
              className="flex items-start gap-2 rounded-lg border p-3 text-sm"
              style={{
                backgroundColor: "var(--error-soft)",
                color: "var(--error)",
                borderColor: "var(--error)",
              }}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{apiError}</span>
            </div>
          )}

          {messages.length === 0 && !apiError && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h3 className="mb-1 text-sm font-medium text-[var(--text)]">先从一个核对问题开始</h3>
              <p className="max-w-sm text-xs text-[var(--muted)]">
                上面可以直接点预设问题，也可以问某个指标来源、某张图为什么这样画、或者报告还有哪些风险点。
              </p>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {loading && (
            <div className="flex items-start gap-3">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--accent-soft)" }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--accent-color)" }} />
              </div>
              <div className="rounded-2xl rounded-tl-md px-4 py-2.5" style={{ backgroundColor: "var(--surface)" }}>
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span
                    className="inline-block h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:0ms]"
                    style={{ backgroundColor: "var(--accent-color)" }}
                  />
                  <span
                    className="inline-block h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:150ms]"
                    style={{ backgroundColor: "var(--accent-color)" }}
                  />
                  <span
                    className="inline-block h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:300ms]"
                    style={{ backgroundColor: "var(--accent-color)" }}
                  />
                  <span>正在查资料并组织回答…</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] p-3" style={{ backgroundColor: "var(--bg-canvas)" }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSend();
          }}
          className="mx-auto w-full max-w-6xl rounded-2xl p-2"
          style={{
            backgroundColor: "var(--surface)",
            boxShadow: "inset 0 0 0 1px var(--border-color, var(--border)), 0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              const target = event.target;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="问点什么……（Enter 发送，Shift+Enter 换行）"
            disabled={loading}
            rows={1}
            className="min-h-[40px] max-h-[160px] w-full resize-none bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />

          <div className="mt-1 flex items-center justify-between px-1">
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 font-mono"
                style={{ backgroundColor: "var(--chip)" }}
              >
                Qwen 2.5 / 7B
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={() => setDesignOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setDesignOpen(true);
                  }
                }}
                className="hidden cursor-pointer items-center gap-1 whitespace-nowrap text-[11px] transition-colors hover:text-[var(--accent-color)] sm:inline-flex"
                title="查看 Agent 设计说明"
              >
                <span>上下文 23 指标 + 4 方案 + 本地资料检索</span>
                <Info className="h-3 w-3 opacity-60" />
              </span>
            </div>

            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: "var(--send-btn)" }}
              title="发送"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>

      <AgentDesignDrawer open={designOpen} onClose={() => setDesignOpen(false)} />
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-start gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: isUser ? "var(--text)" : "var(--accent-soft)" }}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" style={{ color: "var(--bg-canvas)" }} />
        ) : (
          <Bot className="h-3.5 w-3.5" style={{ color: "var(--accent-color)" }} />
        )}
      </div>

      <div
        className="max-w-[80%] rounded-2xl px-4 py-2.5"
        style={{
          backgroundColor: isUser ? "var(--text)" : "var(--surface)",
          color: isUser ? "var(--bg-canvas)" : "var(--text)",
          borderTopRightRadius: isUser ? "4px" : undefined,
          borderTopLeftRadius: isUser ? undefined : "4px",
        }}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-sm" style={{ color: "var(--bg-canvas)" }}>
            {message.content}
          </p>
        ) : (
          <div>
            <MarkdownRenderer>{message.content}</MarkdownRenderer>

            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-2">
                <p className="mb-1 text-[11px] font-medium text-[var(--muted)]">参考来源</p>
                {message.sources.map((source, index) => (
                  <div key={`${source.file}-${source.section}-${index}`} className="flex items-start gap-1.5 text-[11px] text-[var(--muted)]">
                    <FileText className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      {source.file}
                      {source.section ? ` / ${source.section}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {message.evidence && message.evidence.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-2">
                <p className="mb-1 text-[11px] font-medium text-[var(--muted)]">资料调查证据</p>
                {message.evidence.map((evidence, index) => (
                  <div
                    key={`${evidence.file}-${evidence.section ?? evidence.title}-${index}`}
                    className="rounded-xl border px-3 py-2"
                    style={{
                      backgroundColor: "var(--bg-canvas)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-color)]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-medium text-[var(--text)]">{evidence.title}</span>
                          <span className="rounded-full bg-[var(--chip)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                            {evidence.sourceType}
                          </span>
                          <span className="text-[var(--muted)]">相关度 {evidence.relevance}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--muted)]">
                          {evidence.file}
                          {evidence.section ? ` / ${evidence.section}` : ""}
                        </div>
                        <p className="mt-1 text-[12px] leading-5 text-[var(--text)]">{evidence.snippet}</p>
                      </div>
                    </div>
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
