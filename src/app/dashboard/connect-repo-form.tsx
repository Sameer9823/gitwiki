"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function ConnectRepoForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [repo, setRepo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!repo.trim()) { setError("Enter a GitHub repository, e.g. vercel/next.js"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repo.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setRepo("");
      showToast("Repository connected — indexing started", "success");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <Input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/repo or a GitHub URL"
          disabled={loading}
          aria-label="GitHub repository"
          autoComplete="off"
        />
        {error && <p className="mt-1.5 text-xs text-error" role="alert">{error}</p>}
      </div>
      <Button type="submit" loading={loading} disabled={loading || !repo.trim()} className="shrink-0">
        {loading ? "Connecting…" : "Connect"}
      </Button>
    </form>
  );
}
