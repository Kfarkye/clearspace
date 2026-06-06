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
        alabaster: '#FAF9F6',
        sand: '#F4F3EF',
        clay: '#EAE8E1',
        charcoal: '#1A1A18',
        ink: '#0F0F0E',
        taupe: '#706E6B',
        bronze: '#8C7A6B',
        'warm-gold': '#B8A590',
        sage: '#929B87',
        emerald: '#34D399',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(140, 122, 107, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        'glass-hover': '0 14px 48px rgba(140, 122, 107, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        'glass-sm': '0 4px 16px rgba(140, 122, 107, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
        'btn': '0 2px 5px rgba(140, 122, 107, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
        'btn-hover': '0 4px 12px rgba(140, 122, 107, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        'btn-primary': '0 2px 6px rgba(140, 122, 107, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        'message': '0 1px 3px rgba(140, 122, 107, 0.04)',
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
