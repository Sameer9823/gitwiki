import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </main>
  );
}
