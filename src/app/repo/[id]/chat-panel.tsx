"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ChatMessage } from "@/components/chat/chat-message";
import { ChatInput } from "@/components/chat/chat-input";
import { SessionSidebar, type ChatSessionItem } from "@/components/chat/session-sidebar";
import { useToast } from "@/components/ui/toast";
import { MessageSquare, PanelLeft } from "lucide-react";

type Status = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  sources?: string[];
  streaming?: boolean;
}

export function ChatPanel({ repositoryId, initialStatus }: { repositoryId: string; initialStatus: Status }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const activeId = searchParams.get("session");

  const [status, setStatus] = React.useState<Status>(initialStatus);
  const [sessions, setSessions] = React.useState<ChatSessionItem[]>([]);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [question, setQuestion] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [loadingSessions, setLoadingSessions] = React.useState(true);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [showJump, setShowJump] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const isAtBottomRef = React.useRef(true);

  const refreshSessions = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/sessions?repositoryId=${repositoryId}`);
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {}
  }, [repositoryId]);

  // Initial sessions load + status polling if not completed
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingSessions(true);
      await refreshSessions();
      if (!cancelled) setLoadingSessions(false);
    }
    load();
    if (status === "COMPLETED" || status === "FAILED") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/repositories/${repositoryId}`);
        if (!res.ok) return;
        const data = await res.json();
        const latest = data.repository?.snapshots?.[0]?.status as Status | undefined;
        if (latest) setStatus(latest);
      } catch {}
    }, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [repositoryId, status, refreshSessions]);

  // When sessions load and no activeId, select most recent or keep empty
  React.useEffect(() => {
    if (!activeId && sessions.length > 0 && !loadingSessions) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("session", sessions[0].id);
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [activeId, sessions, loadingSessions, router, searchParams]);

  // Load messages for active session
  React.useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    async function loadMessages() {
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/chat/sessions/${activeId}`);
        if (!res.ok) { if (!cancelled) setMessages([]); return; }
        const data = await res.json();
        const msgs: Message[] = (data.session.messages ?? []).map((m: any) => ({
          id: m.id, role: m.role, content: m.content, sources: m.sources ?? undefined,
        }));
        if (!cancelled) setMessages(msgs);
      } catch { if (!cancelled) setMessages([]); }
      finally { if (!cancelled) setLoadingMessages(false); }
    }
    loadMessages();
    return () => { cancelled = true; };
  }, [activeId]);

  // Auto scroll handling
  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    isAtBottomRef.current = atBottom;
    setShowJump(!atBottom && messages.length > 2);
  }, [messages.length]);

  React.useEffect(() => {
    if (isAtBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const jumpToLatest = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    isAtBottomRef.current = true;
    setShowJump(false);
  };

  const handleSelect = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("session", id);
    router.push(`?${params.toString()}`, { scroll: false });
    setDrawerOpen(false);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create chat");
      await refreshSessions();
      const params = new URLSearchParams(searchParams.toString());
      params.set("session", data.session.id);
      router.push(`?${params.toString()}`, { scroll: false });
      showToast("Chat created", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not create chat", "error");
    } finally { setCreating(false); }
  };

  const handleRename = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Rename failed");
      await refreshSessions();
      showToast("Chat renamed", "success");
    } catch (e) { showToast(e instanceof Error ? e.message : "Rename failed", "error"); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (activeId === id) {
        if (remaining.length > 0) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("session", remaining[0].id);
          router.push(`?${params.toString()}`, { scroll: false });
        } else {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("session");
          router.push(`?${params.toString()}`, { scroll: false });
          setMessages([]);
        }
      }
      showToast("Chat deleted", "success");
    } catch (e) { showToast(e instanceof Error ? e.message : "Delete failed", "error"); }
  };

  const inFlightRef = React.useRef(false);
  const handleAsk = React.useCallback(async () => {
    if (!question.trim() || sending || inFlightRef.current) return;
    inFlightRef.current = true;
    const q = question.trim();
    // Ensure we have a session — create one if none active
    let sessionId = activeId;
    if (!sessionId) {
      try {
        const res = await fetch("/api/chat/sessions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repositoryId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not create chat");
        sessionId = data.session.id;
        await refreshSessions();
        const params = new URLSearchParams(searchParams.toString());
        params.set("session", sessionId!);
        router.push(`?${params.toString()}`, { scroll: false });
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not start chat", "error");
        return;
      }
    }

    const userMessage: Message = { id: crypto.randomUUID(), role: "USER", content: q };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    setSending(true);
    isAtBottomRef.current = true;

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryId, question: q, chatSessionId: sessionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "ASSISTANT", content: (data.error as string) ?? "Something went wrong. Please try again." }]);
        setSending(false);
        inFlightRef.current = false;
        return;
      }
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantId, role: "ASSISTANT", content: "", streaming: true }]);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullAnswer = "";
      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const lines = part.split("\n");
            let event = ""; let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) data = line.slice(5).trim();
            }
            if (!event || !data) continue;
            try {
              const parsed = JSON.parse(data);
              if (event === "token") {
                fullAnswer += parsed.token;
                setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: fullAnswer } : m));
              } else if (event === "complete") {
                setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: fullAnswer, streaming: false, sources: parsed.message?.sources } : m));
                if (parsed.chatSessionId && !activeId) {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("session", parsed.chatSessionId);
                  router.push(`?${params.toString()}`, { scroll: false });
                }
                // refresh titles
                refreshSessions();
              } else if (event === "error") {
                setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: parsed.error ?? "Something went wrong.", streaming: false } : m));
              }
            } catch {}
          }
        }
      }
      // If stream ended without complete event, mark done
      setMessages((prev) => prev.map((m) => m.id === assistantId && m.streaming ? { ...m, streaming: false } : m));
      setSending(false);
      inFlightRef.current = false;
    } catch {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "ASSISTANT", content: "Network error — try again." }]);
      setSending(false);
      inFlightRef.current = false;
    }
  }, [question, sending, activeId, repositoryId, router, searchParams, refreshSessions, showToast]);

  const ready = status === "COMPLETED";

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[480px] overflow-hidden rounded-xl border border-border bg-surface sm:h-[70vh]">
      {/* Desktop sidebar */}
      <div className="hidden shrink-0 md:flex">
        <SessionSidebar
          repositoryId={repositoryId}
          sessions={sessions}
          activeId={activeId}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onRename={handleRename}
          onDelete={handleDelete}
          creating={creating}
        />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div className="fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] overflow-hidden rounded-r-xl border-r border-border bg-surface shadow-xl md:hidden">
            <SessionSidebar
              repositoryId={repositoryId}
              sessions={sessions}
              activeId={activeId}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDelete}
              creating={creating}
              variant="drawer"
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="md:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open sessions">
              <PanelLeft className="h-4 w-4" /> Sessions
            </Button>
            <p className="hidden text-sm text-text-muted sm:block">Ask about this repository</p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div ref={scrollRef} onScroll={handleScroll} className="relative flex-1 space-y-6 overflow-y-auto px-3 py-6 sm:px-6">
          {!ready && (
            <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-text-muted">
              {status === "FAILED" ? "Indexing failed — use Re-index from the repository actions to retry." : "Indexing in progress — this can take a minute for larger repositories. Chat will be available when indexing completes."}
            </div>
          )}

          {loadingMessages ? (
            <div className="space-y-4">
              <div className="h-12 animate-pulse rounded-lg bg-surface-muted" />
              <div className="h-20 animate-pulse rounded-lg bg-surface-muted" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-10 w-10" />}
              title="No messages yet"
              description="Ask a question about this repository to start exploring its code. Answers include source citations so you can verify every claim."
            />
          ) : (
            messages.map((m) => (
              <ChatMessage key={m.id} role={m.role} content={m.content} sources={m.sources} streaming={m.streaming} />
            ))
          )}
          <div ref={bottomRef} />
          {showJump && (
            <div className="sticky bottom-2 flex justify-center">
              <Button size="sm" variant="secondary" onClick={jumpToLatest} className="shadow-dropdown">Jump to latest</Button>
            </div>
          )}
        </div>

        <ChatInput
          value={question}
          onChange={setQuestion}
          onSubmit={handleAsk}
          disabled={!ready}
          sending={sending}
          placeholder={ready ? "Ask about this repository…" : "Waiting for indexing to finish…"}
        />
      </div>
    </div>
  );
}
