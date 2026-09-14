import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="mt-6 h-[60vh] w-full rounded-xl" />
    </div>
  );
}
