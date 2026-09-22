"use client";
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Copy, Check, User, ArrowUpRight } from "lucide-react";

interface Citation {
  path: string;
  symbolName?: string;
  startLine?: number;
  endLine?: number;
}

interface ChatMessageProps {
  role: "USER" | "ASSISTANT";
  content: string;
  sources?: string[];
  citations?: Citation[];
  streaming?: boolean;
  createdAt?: string;
  repositoryId?: string;
}

function parseSourceString(s: string): { path: string; lines?: string; symbol?: string } {
  // format: "path:start-end — symbol"  or  "path — symbol"  or  "path:start-end"
  const [loc, sym] = s.split(" — ");
  const m = loc.match(/^(.+?):(\d+-\d+)$/);
  if (m) return { path: m[1], lines: m[2], symbol: sym };
  if (sym) return { path: loc, symbol: sym };
  return { path: loc };
}

export function ChatMessage({ role, content, sources, citations, streaming, repositoryId }: ChatMessageProps) {
  const [copied, setCopied] = React.useState(false);
  const isUser = role === "USER";

  const onCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] gap-3 sm:max-w-[75%]">
          <div className="rounded-2xl rounded-br-md bg-accent px-4 py-3 text-sm leading-relaxed text-white">
            <p className="whitespace-pre-wrap break-words">{content}</p>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-text-muted" aria-hidden="true">
            <User className="h-4 w-4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent" aria-hidden="true">
        <span className="font-mono text-xs font-bold">C</span>
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-4 sm:px-5">
          {streaming && !content ? (
            <p className="flex items-center gap-2 text-sm text-text-muted">
              <span className="inline-flex gap-1" aria-hidden="true">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: "300ms" }} />
              </span>
              Analyzing your codebase...
            </p>
          ) : (
            <MarkdownRenderer content={content || (streaming ? "" : "")} className="text-sm leading-relaxed text-text" />
          )}
          {streaming && content && <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-accent" aria-hidden="true">▌</span>}
        </div>
        {!streaming && content && (
          <div className="flex items-center gap-2">
            <button
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
              aria-label={copied ? "Copied" : "Copy message"}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        {sources && sources.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
            <p className="mb-2 font-mono text-xs font-medium uppercase tracking-wide text-text-muted">Sources</p>
            <ul className="space-y-1.5">
              {sources.map((s, i) => {
                const p = parseSourceString(s);
                const inner = (
                  <>
                    <span className="truncate font-mono text-text">{p.path}</span>
                    {p.lines && <span className="font-mono text-text-muted">{p.lines}</span>}
                    {p.symbol && <span className="text-text-muted">— {p.symbol}</span>}
                    {repositoryId && <ArrowUpRight className="ml-auto h-3 w-3 shrink-0 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />}
                  </>
                );
                return (
                  <li key={i}>
                    {repositoryId ? (
                      <Link
                        href={`/repo/${repositoryId}/explorer?path=${encodeURIComponent(p.path)}`}
                        className="group flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs transition-colors hover:border-border-strong hover:bg-surface-hover"
                        title={`Open ${p.path} in Code Explorer`}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs">
                        {inner}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
