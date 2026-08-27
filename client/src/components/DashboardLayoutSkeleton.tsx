import { Skeleton } from './ui/skeleton';

export function DashboardLayoutSkeleton() {
  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top header bar — matches the real h-11 aurora-glass header */}
      <header className="h-11 shrink-0 border-b border-border bg-background/80 backdrop-blur-md flex items-center px-4 gap-3">
        <Skeleton className="h-6 w-6 rounded" />
        <Skeleton className="h-4 w-20" />
        <div className="flex-1" />
        <Skeleton className="h-6 w-6 rounded-full" />
      </header>

      {/* Main content area */}
      <div className="flex-1 p-4 space-y-4 overflow-hidden">
        {/* Risk disclaimer banner skeleton */}
        <Skeleton className="h-9 w-full rounded-lg" />

        {/* Content blocks */}
        <Skeleton className="h-10 w-48 rounded-lg" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
