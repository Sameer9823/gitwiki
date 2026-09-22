"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={cn("code-block group", className)}>
      <div className="code-block-header">
        <span className="code-block-language">{language ?? ""}</span>
        <button onClick={onCopy} className="code-block-copy" aria-label="Copy code">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto text-code"><code>{code}</code></pre>
    </div>
  );
}
