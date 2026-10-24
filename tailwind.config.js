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
        bg: '#0D1117',
        background: '#0D1117',
        surface: {
          DEFAULT: '#141A23',
          50: '#1A222E',
          100: '#141A23',
          200: '#141A23',
          300: '#0D1117',
          2: '#1A222E',
        },
        raised: '#1A222E',
        border: {
          subtle: '#232C3A',
          DEFAULT: '#232C3A',
          strong: '#2E3849',
        },
        brand: {
          accent: '#A8E05F',
          lime: '#A8E05F',
          limeHover: '#b5e870',
          pine: '#0D1117',
          ivory: '#EDF1F6',
          emerald: '#A8E05F',
          blue: '#5eb6e8',
          amber: '#E8B64A',
          rose: '#ef4444',
          cyan: '#5eb6e8',
        },
        accent: {
          DEFAULT: '#A8E05F',
          ink: '#0D1117',
          soft: 'rgba(168, 224, 95, 0.14)',
        },
        caution: '#E8B64A',
        info: '#5eb6e8',
        warn: '#E8B64A',
        text: {
          DEFAULT: '#EDF1F6',
          primary: '#EDF1F6',
          secondary: '#8A95A5',
          2: '#8A95A5',
          3: '#5F6B7C',
        },
        muted: '#8A95A5',
        dim: '#5F6B7C',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      boxShadow: {
        'flat': 'none',
        'native': 'none',
      }
    },
  },
  plugins: [],
};
