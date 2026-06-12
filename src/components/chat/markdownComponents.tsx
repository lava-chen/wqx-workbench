/**
 * 适配 duya/src/components/chat/markdownComponents.tsx
 *
 * 关键差异:
 *  - duya 用 text-foreground/border-border (Tailwind 主题色), 我们用同套 token
 *  - 加了 markdown 表格边框/斑马条, 适配 AgentAuditPage 的紧凑布局
 *  - code 块走现有 --code-bg / --code-border
 *  - 公式走 rehype-katex, 引入 katex.min.css
 */

import type { ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";

export const markdownComponents = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-lg font-semibold text-foreground mt-4 mb-2 pb-1 border-b border-border/50">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-base font-semibold text-foreground mt-4 mb-1.5">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-sm font-semibold text-foreground mt-3 mb-1">
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="text-sm font-medium text-foreground mt-2 mb-1">
      {children}
    </h4>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-sm text-foreground leading-[1.65] mb-2 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc list-outside text-sm text-foreground mb-2 pl-5 space-y-0.5 marker:text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal list-outside text-sm text-foreground mb-2 pl-5 space-y-0.5 marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-sm text-foreground leading-[1.6] pl-0.5">
      {children}
    </li>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => {
    const match = /language-(\w+)/.exec(className || "");
    const raw = String(children ?? "");
    const hasNewline = raw.includes("\n");
    const isBlock = hasNewline || match;

    if (!isBlock) {
      // 行内 code: 去掉包裹的反引号
      let textContent = raw.trim();
      while (textContent.startsWith("`")) textContent = textContent.slice(1);
      while (textContent.endsWith("`")) textContent = textContent.slice(0, -1);

      return (
        <code
          className="px-1 py-0.5 rounded text-[12.5px] font-mono border border-border"
          style={{
            backgroundColor: "var(--code-bg, var(--surface))",
            color: "var(--accent-color)",
          }}
        >
          {textContent}
        </code>
      );
    }

    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  pre: ({ children }: { children?: ReactNode }) => (
    <div className="my-2">{children}</div>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-[3px] border-border pl-3 my-2 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border/50 my-3" />,

  // ── 表格 (duya 重点, 我们适配斑马条) ──
  table: ({ children }: { children?: ReactNode }) => (
    <div className="overflow-x-auto my-2 rounded-md border border-border">
      <table className="w-full text-sm text-left border-collapse">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => (
    <thead className="bg-[var(--surface)] border-b border-border">{children}</thead>
  ),
  tbody: ({ children }: { children?: ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  tr: ({ children }: { children?: ReactNode }) => (
    <tr className="border-b border-border/60 last:border-b-0 hover:bg-[var(--surface)]/40 transition-colors">
      {children}
    </tr>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="px-3 py-1.5 font-semibold text-foreground text-left text-xs uppercase tracking-wide">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="px-3 py-1.5 text-foreground align-top text-[13px]">
      {children}
    </td>
  ),

  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic text-foreground">{children}</em>
  ),
  del: ({ children }: { children?: ReactNode }) => (
    <del className="line-through text-muted-foreground">{children}</del>
  ),
};
