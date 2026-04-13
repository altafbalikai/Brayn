import { useTheme } from "../hooks/useTheme";
import ThemePreview from "./ThemePreview";

/**
 * Theme options configuration
 */
const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/**
 * Segmented theme selector control.
 * Displays Light, Dark, and System options side by side.
 *
 * @param {Object} props
 * @param {string} [props.className] - Additional CSS classes
 */
export function ThemeSelector({ className = "" }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-3 gap-4"
        role="radiogroup"
        aria-label="Select color mode"
      >
        {THEME_OPTIONS.map((opt) => {
          const selected = theme === opt.value;

          return (
            <button
              key={opt.value}
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(opt.value)}
              className={`
                group relative rounded-xl p-3
                transition-all duration-200
                focus:outline-none
                ${
                  selected
                    ? "ring-2 ring-[var(--theme-focus-ring)]"
                    : "border border-[var(--theme-secondary)] hover:border-[var(--theme-focus-ring)]/40"
                }
              `}
            >
              <ThemePreview mode={opt.value} />

              <span
                className={`mt-3 block text-sm text-center ${
                  selected
                    ? "text-[var(--theme-text)] font-medium"
                    : "text-[var(--theme-muted)]"
                }`}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ThemeSelector;
