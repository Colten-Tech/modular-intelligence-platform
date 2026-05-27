export function SkeletonCard() {
  return (
    <div className="bg-bg-surface border border-border rounded overflow-hidden animate-pulse">
      {/* Left border accent */}
      <div className="flex">
        <div className="w-[3px] bg-bg-elevated shrink-0" />
        <div className="flex-1 p-4 space-y-3">
          {/* Top row: badge + score + timestamp */}
          <div className="flex items-center justify-between">
            <div className="w-16 h-4 bg-bg-elevated rounded" />
            <div className="w-8 h-4 bg-bg-elevated rounded" />
          </div>
          {/* Title */}
          <div className="space-y-1.5">
            <div className="w-full h-4 bg-bg-elevated rounded" />
            <div className="w-3/4 h-4 bg-bg-elevated rounded" />
          </div>
          {/* Body */}
          <div className="space-y-1">
            <div className="w-full h-3 bg-bg-elevated rounded" />
            <div className="w-full h-3 bg-bg-elevated rounded" />
            <div className="w-2/3 h-3 bg-bg-elevated rounded" />
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <div className="w-16 h-6 bg-bg-elevated rounded" />
            <div className="w-16 h-6 bg-bg-elevated rounded" />
            <div className="w-12 h-6 bg-bg-elevated rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}
