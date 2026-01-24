import { createContext, useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Theme context providing theme state and controls.
 * @type {React.Context<ThemeContextValue|null>}
 */
export const ThemeContext = createContext(null);

/**
 * Theme options
 * @typedef {'light' | 'dark' | 'system'} Theme
 */

const STORAGE_KEY = 'theme';

/**
 * Get the resolved theme (light or dark) based on stored preference and system settings.
 * @param {Theme} theme - The stored theme preference
 * @returns {'light' | 'dark'} - The resolved theme
 */
function getResolvedTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/**
 * Apply the theme class to the document element.
 * @param {'light' | 'dark'} resolvedTheme - The theme to apply
 */
function applyTheme(resolvedTheme) {
  const root = document.documentElement;
  if (resolvedTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/**
 * Get the initial theme from localStorage or default to system.
 * @returns {Theme}
 */
function getInitialTheme() {
  if (typeof window === 'undefined') return 'system';
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch (e) {
    // localStorage not available
  }
  return 'system';
}

/**
 * ThemeProvider component that manages theme state and applies it to the document.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);
  const [resolvedTheme, setResolvedTheme] = useState(() => getResolvedTheme(getInitialTheme()));

  // Set theme and persist to localStorage
  const setTheme = useCallback((newTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch (e) {
      // localStorage not available
    }
  }, []);

  // Toggle through themes: light -> dark -> system -> light
  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      let newTheme;
      if (current === 'light') newTheme = 'dark';
      else if (current === 'dark') newTheme = 'system';
      else newTheme = 'light';
      
      // Persist to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, newTheme);
      } catch (e) {
        // localStorage not available
      }
      
      return newTheme;
    });
  }, []);

  // Apply theme when it changes
  useEffect(() => {
    const resolved = getResolvedTheme(theme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      if (theme === 'system') {
        const resolved = getResolvedTheme('system');
        setResolvedTheme(resolved);
        applyTheme(resolved);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export default ThemeProvider;
