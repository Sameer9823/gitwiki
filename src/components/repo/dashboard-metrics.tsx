"use client";

import { FileCode, Boxes, Share2, BookOpen } from "lucide-react";
import { MetricCard } from "@/components/repo/metric-card";
import { MetricGrid } from "@/components/repo/metric-grid";

type Props = {
  fileCount: number | null;
  chunkCount: number | null;
  dependencyCount: number;
  wikiCount: number;
  avgFreshness: number | null;
};

export function DashboardMetrics({ fileCount, chunkCount, dependencyCount, wikiCount, avgFreshness }: Props) {
  return (
    <MetricGrid>
      <MetricCard icon={FileCode} label="Files Indexed" value={fileCount} />
      <MetricCard icon={Boxes} label="Chunks Indexed" value={chunkCount} hint="Used for retrieval in AI Chat" />
      <MetricCard icon={Share2} label="Dependencies Mapped" value={dependencyCount} hint="From the architecture graph" />
      <MetricCard
        icon={BookOpen}
        label="Wiki Pages"
        value={wikiCount}
        hint={avgFreshness != null ? `${avgFreshness}% average freshness` : "No pages yet"}
      />
    </MetricGrid>
  );
}
