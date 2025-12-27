const ChatSkeletonLoader = () => {
  return (
    <div className="relative h-full w-full bg-theme-dark overflow-hidden flex">
      {/* Sidebar Skeleton */}
      <div className="hidden md:flex w-64 bg-theme-dark p-4 flex-col">
        <div className="h-6 w-32 rounded shimmer mb-6" />

        <div className="h-10 w-full rounded-lg shimmer mb-6" />

        <div className="space-y-3 flex-1 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 w-full rounded-lg shimmer" />
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <div className="h-4 w-24 rounded shimmer" />
          <div className="h-4 w-20 rounded shimmer" />
        </div>
      </div>

      {/* Main Chat Area Skeleton */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Hero Skeleton */}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-xl w-full text-center">
            {/* Logo + Title */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-full shimmer" />
              <div className="h-7 w-24 rounded shimmer" />
            </div>

            {/* Value Proposition */}
            <div className="mx-auto mb-6 h-4 w-80 rounded shimmer" />

            {/* Prompt Chips */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-7 w-28 rounded-full shimmer" />
              ))}
            </div>

            {/* Hint text */}
            <div className="mx-auto mb-4 h-3 w-48 rounded shimmer" />

            {/* Composer Skeleton (INLINE, not floating) */}
            <div className="mx-auto mt-2 w-full max-w-4xl px-2">
              <div className="h-12 rounded-3xl shimmer" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatSkeletonLoader;
