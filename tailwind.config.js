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
        background: '#0a1812',
        surface: {
          50: '#142c21',
          100: '#11261d',
          200: '#0f2219',
          300: '#0a1812',
          DEFAULT: '#0f2219',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.05)',
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          strong: 'rgba(255, 255, 255, 0.16)',
        },
        brand: {
          accent: '#b8e63a',
          lime: '#b8e63a',
          limeHover: '#c8ee47',
          pine: '#0a1812',
          ivory: '#e8efe9',
          emerald: '#b8e63a',
          blue: '#38bdf8',
          amber: '#e3b341',
          rose: '#ef4444',
          cyan: '#06b6d4',
        },
        text: {
          primary: '#e8efe9',
          secondary: '#8fa69a',
        },
        pine: {
          950: '#07120d',
          900: '#0a1812',
          800: '#0f2219',
          700: '#142c21',
          600: '#1a372a',
        },
        navy: {
          950: '#07120d',
          900: '#0a1812',
          800: '#0f2219',
          700: '#142c21',
          600: '#1a372a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'flat': 'none',
        'terminal': '0 2px 8px -2px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      }
    },
  },
  plugins: [],
};
