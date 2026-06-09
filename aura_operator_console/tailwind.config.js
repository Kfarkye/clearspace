/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./views/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Dark Mode Tokens mapped from original
        alabaster: '#000000',
        sand: '#0a0a0a',
        clay: '#27272a',
        charcoal: '#f4f4f5',
        ink: '#ffffff',
        taupe: '#a1a1aa',
        bronze: '#38bdf8', // Sky 400 for accent
        'warm-gold': '#7dd3fc',
        sage: '#929B87',
        emerald: '#34D399',

        // Alias Layer
        void: '#000000',
        surface: '#0a0a0a',
        blue: '#0A84FF',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'glass-hover': '0 14px 48px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'glass-sm': '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'btn': '0 2px 5px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'btn-hover': '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        'btn-primary': '0 2px 6px rgba(56, 189, 248, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        'message': '0 1px 3px rgba(0, 0, 0, 0.2)',
      },
      animation: {
        'thinking-dot': 'thinkingDot 1.4s ease-in-out infinite',
        'breathe': 'breathe 4s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        thinkingDot: {
          '0%, 80%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
          '40%': { opacity: 1, transform: 'scale(1)' },
        },
        breathe: {
          '0%, 100%': { opacity: 0.15, transform: 'scale(1)' },
          '50%': { opacity: 0.35, transform: 'scale(1.05)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
      },
    },
  },
  plugins: [],
}
