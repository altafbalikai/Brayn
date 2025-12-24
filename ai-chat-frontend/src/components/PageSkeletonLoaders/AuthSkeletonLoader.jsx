const AuthSkeletonLoader = () => {
  return (
    <div className="min-h-screen p-5 flex items-center justify-center bg-theme-dark animated-gradient">
      <div className="w-full max-w-md p-8 bg-theme-light rounded-2xl shadow-2xl border border-theme-secondary animate-pulse">
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <div className="h-7 w-32 rounded bg-theme-secondary/30" />
        </div>

        {/* Subtitle */}
        <div className="mx-auto mb-8 h-4 w-40 rounded bg-theme-secondary/20" />

        {/* Email label */}
        <div className="mb-2 h-4 w-16 rounded bg-theme-secondary/30" />
        {/* Email input */}
        <div className="mb-6 h-12 w-full rounded-lg bg-theme-secondary/20" />

        {/* Password label */}
        <div className="mb-2 h-4 w-20 rounded bg-theme-secondary/30" />
        {/* Password input */}
        <div className="mb-6 h-12 w-full rounded-lg bg-theme-secondary/20" />

        {/* Button */}
        <div className="h-12 w-full rounded-lg bg-theme-secondary/40" />

        {/* Footer text */}
        <div className="mt-6 flex justify-center">
          <div className="h-4 w-56 rounded bg-theme-secondary/20" />
        </div>
      </div>
    </div>
  );
};

export default AuthSkeletonLoader;
