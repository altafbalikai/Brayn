const AuthSkeletonLoader = () => {
  return (
    <div className="min-h-screen p-5 flex items-center justify-center bg-theme-dark">
      <div
        className="
          w-full max-w-md p-8
          bg-theme-light
          rounded-2xl
          shadow-2xl
          border border-theme-secondary
          backdrop-blur-xl
        "
      >
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <div className="h-7 w-32 rounded shimmer" />
        </div>

        {/* Subtitle */}
        <div className="mx-auto mb-8 h-4 w-40 rounded shimmer" />

        {/* Email label */}
        <div className="mb-2 h-4 w-16 rounded shimmer" />
        {/* Email input */}
        <div className="mb-6 h-12 w-full rounded-lg shimmer" />

        {/* Password label */}
        <div className="mb-2 h-4 w-20 rounded shimmer" />
        {/* Password input */}
        <div className="mb-6 h-12 w-full rounded-lg shimmer" />

        {/* Primary button */}
        <div className="h-12 w-full rounded-lg shimmer" />

        {/* Footer text */}
        <div className="mt-6 flex justify-center">
          <div className="h-4 w-56 rounded shimmer" />
        </div>
      </div>
    </div>
  );
};

export default AuthSkeletonLoader;
