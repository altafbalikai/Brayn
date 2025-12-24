const ChatSkeletonLoader = () => {
  return (
    <div className="relative h-full w-full bg-theme-light overflow-hidden flex">
      {/* Sidebar Skeleton */}
      <div className="hidden md:flex w-64 bg-theme-dark p-4 flex-col animate-pulse">
        {/* App title */}
        <div className="h-6 w-32 bg-theme-secondary/40 rounded mb-6" />

        {/* New chat button */}
        <div className="h-10 w-full bg-theme-secondary/30 rounded-lg mb-6" />

        {/* Conversation list */}
        <div className="space-y-3 flex-1 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-12 w-full bg-theme-secondary/20 rounded-lg"
            />
          ))}
        </div>

        {/* Footer actions */}
        <div className="mt-4 space-y-3">
          <div className="h-4 w-24 bg-theme-secondary/30 rounded" />
          <div className="h-4 w-20 bg-theme-secondary/20 rounded" />
        </div>
      </div>

      {/* Main Chat Area Skeleton */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 animate-pulse">
        {/* Empty-state header */}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-xl w-full text-center">
            {/* Logo */}
            <div className="mx-auto mb-4 h-8 w-40 bg-theme-secondary/40 rounded" />

            {/* Subtitle */}
            <div className="mx-auto mb-8 h-4 w-72 bg-theme-secondary/20 rounded" />

            {/* Prompt cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl bg-theme-secondary/20"
                />
              ))}
            </div>

            {/* Hint */}
            <div className="mx-auto mt-6 h-3 w-64 bg-theme-secondary/20 rounded" />

            {/* Primary action */}
            <div className="mx-auto mt-6 h-12 w-48 bg-theme-secondary/40 rounded-xl" />
          </div>
        </div>

        {/* Composer Skeleton */}
        <div className="flex-shrink-0 p-4 border-t border-theme-secondary bg-theme-light">
          <div className="h-12 w-full rounded-xl bg-theme-secondary/30" />
        </div>
      </div>
    </div>
  );
};

export default ChatSkeletonLoader;
