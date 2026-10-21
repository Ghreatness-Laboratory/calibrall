/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0d14',
        surface: {
          50: '#1e2433',
          100: '#171c28',
          200: '#121620',
          300: '#0e121a',
          DEFAULT: '#121620',
        },
        border: {
          subtle: '#1e2638',
          DEFAULT: '#252f44',
          strong: '#36425d',
        },
        brand: {
          emerald: '#10b981',
          accent: '#059669',
          glow: '#10b98120',
          blue: '#3b82f6',
          amber: '#f59e0b',
          rose: '#ef4444',
          cyan: '#06b6d4',
        },
        navy: {
          950: '#07090e',
          900: '#0b0f19',
          800: '#111726',
          700: '#1a2238',
          600: '#25304e',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'terminal': '0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.25)',
      }
    },
  },
  plugins: [],
};
