/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base
        bgDeep:    "#050A18",
        bgSurface: "#0B1120",
        bgCard:    "#0F1928",
        bgHover:   "#141F32",
        // Borders
        borderSubtle:  "rgba(255,255,255,0.06)",
        borderDefault: "rgba(255,255,255,0.10)",
        borderFocus:   "rgba(201,168,76,0.60)",
        // Brand
        gold:      "#C9A84C",
        goldLight: "#E2C06A",
        goldDim:   "rgba(201,168,76,0.15)",
        // Status
        statusGreen: "#22C55E",
        statusRed:   "#EF4444",
        statusAmber: "#F59E0B",
        statusBlue:  "#3B82F6",
        // Text
        textPrimary: "#F1F5F9",
        textSecondary: "#94A3B8",
        textMuted:   "#4E6180",
        // Legacy compat
        primaryPurple: "#7C5CBF",
        accentTeal:    "#1ABCB0",
        warningAmber:  "#F59E0B",
        dangerRose:    "#EF4444",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        card:    "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.5)",
        cardHov: "0 4px 16px rgba(0,0,0,0.5)",
        gold:    "0 0 16px rgba(201,168,76,0.18)",
        inset:   "inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      animation: {
        'fade-in':    'fadeIn 0.25s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' },                   '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
