"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  sending?: boolean;
}

export function ChatInput({ value, onChange, onSubmit, disabled, placeholder, sending }: ChatInputProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSubmit();
    }
  };

  React.useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = Math.min(ref.current.scrollHeight, 160) + "px";
    }
  }, [value]);

  return (
    <div className="sticky bottom-0 border-t border-border bg-background/80 px-3 py-3 backdrop-blur focus-within:border-accent/30 supports-[backdrop-filter]:bg-background/80 sm:px-4" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (!disabled && value.trim()) onSubmit(); }}
        className="mx-auto flex max-w-3xl items-end gap-2"
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          rows={1}
          aria-label="Ask about this repository"
          className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent codexa-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
        />
        <Button type="submit" size="icon" disabled={disabled || sending || !value.trim()} aria-label="Send message">
          <Send className="h-4 w-4" />
        </Button>
      </form>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-text-muted">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
