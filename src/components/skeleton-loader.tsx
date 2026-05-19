export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`h-4 animate-pulse rounded-full bg-panel-strong ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-3xl border border-line bg-panel p-6 space-y-4">
      <SkeletonLine className="w-2/3 h-6" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-4/5" />
      <div className="flex gap-2 pt-2">
        <SkeletonLine className="w-16 h-6" />
        <SkeletonLine className="w-16 h-6" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
