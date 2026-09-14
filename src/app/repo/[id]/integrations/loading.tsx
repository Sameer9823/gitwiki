import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="max-w-2xl space-y-6">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-16 rounded-xl" />
    </div>
  );
}
