import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="mt-2 h-8 w-48" />
      <Skeleton className="mt-4 h-24 w-full rounded-xl" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </main>
  );
}
