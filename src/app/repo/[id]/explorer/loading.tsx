import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="flex h-[70vh] gap-4">
      <Skeleton className="w-80 rounded-xl" />
      <Skeleton className="flex-1 rounded-xl" />
    </div>
  );
}
