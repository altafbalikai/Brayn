import { useTheme } from '../hooks/useTheme';
import ThemePreview from './ThemePreview';

/**
 * Sun icon for light mode
 */
function SunIcon({ className = '' }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
      />
    </svg>
  );
}

/**
 * Moon icon for dark mode
 */
function MoonIcon({ className = '' }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
      />
    </svg>
  );
}

/**
 * Monitor icon for system mode
 */
function MonitorIcon({ className = '' }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25"
      />
    </svg>
  );
}

/**
 * Theme options configuration
 */
const THEME_OPTIONS = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
];

/**
 * Segmented theme selector control.
 * Displays Light, Dark, and System options side by side.
 * 
 * @param {Object} props
 * @param {string} [props.className] - Additional CSS classes
 */
export function ThemeSelector({ className = '' }) {
  const { theme, setTheme } = useTheme();

return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-[var(--theme-text)]">
        Color mode
      </h3>

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
