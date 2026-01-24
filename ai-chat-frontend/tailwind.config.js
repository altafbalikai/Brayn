/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 'theme-dark': '#24241d',
        // 'theme-secondary': '#756959',
        // 'theme-accent': '#a49584',
        // 'theme-light': '#b7a99c',
        // 'theme-appbg': 'rgba(15, 23, 42, 0.75)',
        'theme-appbg': 'var(--theme-appbg)',
        'theme-dark': 'var(--theme-dark)',          // App background
        'theme-light': 'var(--theme-light)', // Glass cards
        'theme-secondary': 'var(--theme-secondary)', // Borders / muted
        'theme-accent': 'var(--theme-accent)', // Inputs
        'theme-surface': 'var(--theme-surface)', // Chat assistant message background
        'theme-contextMenu': 'var(--theme-contextMenu)', // Context Menu
        'theme-code-bg': 'var(--theme-code-bg)',
        'theme-code-header': 'var(--theme-code-header)',
        'theme-inline-code': 'var(--theme-inline-code)',

        /* Text */
        'theme-text': 'var(--theme-text)',
        'theme-muted': 'var(--theme-muted)',
        'theme-textaccent': 'var(--theme-textaccent)',
        'theme-chat-text': 'var(--theme-chat-text)'
      },
    },
  },
  plugins: [],
}