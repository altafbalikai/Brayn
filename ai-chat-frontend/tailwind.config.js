/** @type {import('tailwindcss').Config} */
export default {
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
        'theme-appbg': '#0F172A',
        'theme-dark': '#0E1117',          // App background
        'theme-light': 'rgba(30, 41, 59, 0.6)', // Glass cards
        'theme-secondary': 'rgba(148, 163, 184, 0.25)', // Borders / muted
        'theme-accent': 'rgba(15, 23, 42, 0.7)', // Inputs
        'theme-surface': 'rgba(24, 32, 48, 0.85)', // Chat assistant message background
        'theme-contextMenu': 'rgba(15, 23, 42)', // Context Menu
        'theme-code-bg': 'rgba(15, 23, 42, 0.9)',
        'theme-code-header': 'rgba(30, 41, 59, 0.8)',
        'theme-inline-code': 'rgba(148, 163, 184, 0.15)',

        /* Text */
        'theme-text': '#E5E7EB',
        'theme-muted': '#9CA3AF',
        'theme-textaccent': '#CBD5E1',
        'theme-chat-text': '#E5E7EB'
      },
    },
  },
  plugins: [],
}

// /** @type {import('tailwindcss').Config} */
// export default {
//   content: [
//     "./index.html",
//     "./src/**/*.{js,ts,jsx,tsx}",
//   ],
//   theme: {
//     extend: {
//       colors: {
//         /* Base backgrounds */
//         'theme-dark': '#0E1117',          // App background
//         'theme-light': 'rgba(30, 41, 59, 0.6)', // Glass cards
//         'theme-secondary': 'rgba(148, 163, 184, 0.25)', // Borders / muted
//         'theme-accent': 'rgba(15, 23, 42, 0.7)', // Inputs

//         /* Text */
//         'theme-text': '#E5E7EB',
//         'theme-muted': '#9CA3AF',

//         /* Accents */
//         'theme-primary': '#38BDF8',
//         'theme-success': '#22C55E',
//         'theme-danger': '#EF4444',
//       },
//     },
//   },
//   plugins: [],
// };

