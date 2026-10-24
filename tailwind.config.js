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
        bg: '#0A0F0D',
        background: '#0A0F0D',
        surface: {
          DEFAULT: '#101713',
          50: '#151E19',
          100: '#101713',
          200: '#101713',
          300: '#0A0F0D',
          2: '#151E19',
        },
        raised: '#151E19',
        border: {
          subtle: 'rgba(255, 255, 255, 0.07)',
          DEFAULT: 'rgba(255, 255, 255, 0.07)',
          strong: 'rgba(255, 255, 255, 0.12)',
        },
        brand: {
          accent: '#B6E63B',
          lime: '#B6E63B',
          limeHover: '#c5f34e',
          pine: '#0A0F0D',
          ivory: '#ECF1EE',
          emerald: '#B6E63B',
          blue: '#5eb6e8',
          amber: '#E2AE45',
          rose: '#ef4444',
          cyan: '#5eb6e8',
        },
        accent: {
          DEFAULT: '#B6E63B',
          ink: '#0A0F0D',
          soft: 'rgba(182, 230, 59, 0.12)',
        },
        caution: '#E2AE45',
        info: '#5eb6e8',
        warn: '#E2AE45',
        text: {
          DEFAULT: '#ECF1EE',
          primary: '#ECF1EE',
          secondary: '#8B9890',
          2: '#8B9890',
          3: '#5E6A63',
          muted: '#8B9890',
          subtle: '#5E6A63',
        },
        muted: '#8B9890',
        subtle: '#5E6A63',
        dim: '#5E6A63',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'flat': 'none',
        'native': 'none',
      }
    },
  },
  plugins: [],
};
