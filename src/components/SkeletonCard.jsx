export default function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-[#F1D4D6]">
      {/* Thumbnail */}
      <div className="skeleton w-full aspect-video" />
      {/* Content */}
      <div className="p-3 space-y-2">
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="flex items-center justify-between mt-3">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  )
}
