import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-surface/50 px-4 py-6 sm:px-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-7 w-48" />
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="mt-6 h-[60vh] w-full rounded-xl" />
      </div>
    </div>
  );
}
