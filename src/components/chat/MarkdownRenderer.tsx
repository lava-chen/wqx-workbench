/**
 * 适配 duya/src/components/chat/MarkdownRenderer.tsx
 *
 * 关键点:
 *  - GFM 表格 (任务书 23 项 / 4 方案对比都靠这个)
 *  - KaTeX 公式 (Z_死 = max(...) 这种偶尔会写 LaTeX)
 *  - preprocessMarkdownBold: 修 **含括号**(...) 加粗在 micromark 下不解析的 bug
 */

"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { markdownComponents } from "./markdownComponents";

/** 修 **text (xx)** 类含括号 bold 不解析的 workaround */
export function preprocessMarkdownBold(text: string): string {
  return text.replace(/\*\*([^\n*]+?)\*\*/g, (match, content) => {
    if (/[（）()]/.test(content)) {
      return `**\u200B${content}\u200B**`;
    }
    return match;
  });
}

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  children,
  className,
}) => {
  const processed = preprocessMarkdownBold(children);

  return (
    <div className={className || "message-content"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
};
