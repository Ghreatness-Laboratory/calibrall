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
        background: '#071510',
        surface: {
          50: '#143d2f',
          100: '#0f3427',
          200: '#0b261c',
          300: '#071b14',
          DEFAULT: '#0b261c',
        },
        border: {
          subtle: '#143c2e',
          DEFAULT: '#1c4e3b',
          strong: '#296b52',
        },
        brand: {
          accent: '#bae534', // Exact electric chartreuse/lime from Calibrall logo
          lime: '#bae534',
          limeHover: '#c8ee47',
          pine: '#0b2e22',   // Signature dark pine green background of the logo
          ivory: '#eeede3',  // Signature warm off-white from the logo wordmark
          emerald: '#bae534', // Aliased so all existing emerald accents match the brand lime
          glow: 'rgba(186, 229, 52, 0.22)',
          blue: '#38bdf8',
          amber: '#f59e0b',
          rose: '#ef4444',
          cyan: '#06b6d4',
        },
        pine: {
          950: '#05100c',
          900: '#071812',
          800: '#0b261c',
          700: '#0f3427',
          600: '#144232',
        },
        navy: {
          950: '#05100c',
          900: '#071812',
          800: '#0b261c',
          700: '#0f3427',
          600: '#144232',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'terminal': '0 4px 24px -2px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(186, 229, 52, 0.12)',
        'glow-lime': '0 0 25px -4px rgba(186, 229, 52, 0.35)',
        'glow-emerald': '0 0 25px -4px rgba(186, 229, 52, 0.35)',
      }
    },
  },
  plugins: [],
};
