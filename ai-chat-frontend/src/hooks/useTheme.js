import { useContext } from 'react';
import { ThemeContext } from '../providers/ThemeProvider';

/**
 * Hook to access theme state and controls.
 * 
 * @returns {{
 *   theme: 'light' | 'dark' | 'system',
 *   resolvedTheme: 'light' | 'dark',
 *   setTheme: (theme: 'light' | 'dark' | 'system') => void,
 *   toggleTheme: () => void
 * }}
 * 
 * @example
 * const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
 * 
 * // Check current theme
 * if (resolvedTheme === 'dark') { ... }
 * 
 * // Set specific theme
 * setTheme('dark');
 * 
 * // Toggle through themes
 * toggleTheme(); // light -> dark -> system -> light
 */
export function useTheme() {
    const context = useContext(ThemeContext);

    if (context === null) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }

    return context;
}

export default useTheme;
