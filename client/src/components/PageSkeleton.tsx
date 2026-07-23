import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] flex gap-4">
          {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 border-b border-[var(--border)]/50 flex gap-4">
            {Array.from({ length: cols }).map((_, j) => <Skeleton key={j} className="h-4 flex-1" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-10 w-32 rounded-lg mt-4" />
      </div>
    </div>
  );
}

export function GridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="h-[400px] w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    </div>
  );
}
