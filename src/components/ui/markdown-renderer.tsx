"use client";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import { CodeBlock } from "./code-block";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={className ?? "prose prose-sm max-w-none text-text prose-headings:text-text prose-a:text-accent prose-strong:text-text prose-code:text-accent prose-code:bg-surface-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-pre:bg-transparent prose-pre:p-0"}>
      <ReactMarkdown
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ children, className }) => {
            const lang = className?.replace("language-", "") ?? undefined;
            const text = String(children).replace(/\n$/, "");
            const isBlock = className?.startsWith("language-");
            if (isBlock) return <CodeBlock code={text} language={lang} />;
            return <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs text-accent">{children}</code>;
          },
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 hover:text-accent-hover">
              {children}
            </a>
          ),
          table: ({ children }) => <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
          th: ({ children }) => <th className="border border-border bg-surface-muted px-3 py-2 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-4 italic text-text-muted">{children}</blockquote>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
