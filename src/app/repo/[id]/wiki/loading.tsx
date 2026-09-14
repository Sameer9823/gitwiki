import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  );
}
