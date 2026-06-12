/**
 * 代码块渲染 (从 duya/src/components/chat/CodeBlock.tsx 适配)
 *
 * 支持:
 *  - 高亮语言标签
 *  - 复制按钮
 *  - 行号 (行数 > 3 时)
 *  - 紧凑布局 (适配 Agent 气泡)
 */

"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

export function CodeBlock({ className, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const match = /language-(\w+)/.exec(className || "");
  const language = match?.[1] || "";
  const raw = String(children ?? "").replace(/\n$/, "");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板被拒就静默 */
    }
  };

  const showLineNumbers = raw.split("\n").length > 3;

  return (
    <div className="my-2 rounded-md border border-[var(--code-border,var(--border))] overflow-hidden bg-[var(--code-bg,var(--surface))]">
      {/* header: language + copy */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--code-border,var(--border))] bg-[var(--surface)]/60">
        <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wide">
          {language || "text"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          className="h-5 w-5 hover:bg-[var(--surface-hover)]"
          title={copied ? "已复制" : "复制代码"}
        >
          {copied ? (
            <Check className="h-3 w-3 text-[var(--success)]" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* body */}
      <pre className="p-3 overflow-x-auto text-[12.5px] leading-[1.55] font-mono">
        <code className="text-foreground">
          {showLineNumbers
            ? raw.split("\n").map((line, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-muted-foreground/50 select-none w-6 text-right shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 whitespace-pre">{line || " "}</span>
                </div>
              ))
            : raw}
        </code>
      </pre>
    </div>
  );
}
