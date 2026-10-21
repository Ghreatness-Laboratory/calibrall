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
        bg: 'var(--bg)',
        background: 'var(--bg)',
        surface: {
          50: 'var(--surface-2)',
          100: 'var(--surface)',
          200: 'var(--surface)',
          300: 'var(--bg)',
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
        },
        border: {
          subtle: 'var(--border)',
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        brand: {
          accent: 'var(--accent)',
          lime: 'var(--accent)',
          limeHover: '#c8ee47',
          pine: 'var(--bg)',
          ivory: 'var(--text)',
          emerald: 'var(--accent)',
          blue: 'var(--info)',
          amber: 'var(--warn)',
          rose: '#ef4444',
          cyan: 'var(--info)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          ink: 'var(--accent-ink)',
          soft: 'var(--accent-soft)',
        },
        info: 'var(--info)',
        warn: 'var(--warn)',
        text: {
          DEFAULT: 'var(--text)',
          primary: 'var(--text)',
          secondary: 'var(--text-2)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
        },
        pine: {
          950: '#07100e',
          900: 'var(--bg)',
          800: 'var(--surface)',
          700: 'var(--surface-2)',
          600: '#1a2b25',
        },
        navy: {
          950: '#07100e',
          900: 'var(--bg)',
          800: 'var(--surface)',
          700: 'var(--surface-2)',
          600: '#1a2b25',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'DejaVu Sans Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      boxShadow: {
        'flat': 'none',
        'terminal': '0 2px 8px -2px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--border)',
      }
    },
  },
  plugins: [],
};
