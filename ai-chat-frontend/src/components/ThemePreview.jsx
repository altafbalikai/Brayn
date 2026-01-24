// Exact colors from index.css to ensure accurate preview regardless of current theme context
const THEME = {
  light: {
    bg: "#F8FAFC",
    surface: "#FFFFFF",
    primary: "#E2E8F0",
    secondary: "#FFE4E6",
    text: "#0F172A",
    muted: "#475569",
  },
  dark: {
    bg: "#0F172A",
    surface: "#1E293B", // Inferred from slate-800 equivalent or secondary
    primary: "#1E293B", // theme-secondary in dark
    secondary: "#334155",
    text: "#E5E7EB",
    muted: "#9CA3AF",
  },
};

function ThemePreview({ mode }) {
  const base = "relative h-24 w-full rounded-lg overflow-hidden border border-black/5";

  if (mode === "system") {
    return (
      <div className={`${base} flex`}>
        <div 
          className="w-1/2 p-2 relative"
          style={{ backgroundColor: THEME.light.bg }}
        >
          <PreviewContent theme={THEME.light} />
        </div>
        <div 
          className="w-1/2 p-2 relative"
          style={{ backgroundColor: THEME.dark.bg }}
        >
          <PreviewContent theme={THEME.dark} />
        </div>
      </div>
    );
  }

  const currentTheme = mode === "light" ? THEME.light : THEME.dark;

  return (
    <div
      className={`${base} p-2`}
      style={{ backgroundColor: currentTheme.bg }}
    >
      <PreviewContent theme={currentTheme} />
    </div>
  );
}

function PreviewContent({ theme }) {
  return (
    <div className="space-y-2">
      {/* Fake Header/Line 1 */}
      <div
        className="h-2 w-1/2 rounded"
        style={{ backgroundColor: theme.muted, opacity: 0.4 }}
      />
      {/* Fake Line 2 */}
      <div
        className="h-2 w-3/4 rounded"
        style={{ backgroundColor: theme.muted, opacity: 0.2 }}
      />
      
      {/* Fake Card/Surface */}
      <div
        className="mt-3 h-8 w-full rounded border"
        style={{ 
          backgroundColor: theme.surface, 
          borderColor: theme.primary 
        }}
      >
        <div className="h-full flex items-center px-2 gap-2">
           <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.secondary }} />
           <div className="h-1.5 w-12 rounded" style={{ backgroundColor: theme.text, opacity: 0.2 }} />
        </div>
      </div>
    </div>
  );
}

export default ThemePreview;

