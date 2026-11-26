/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media',
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
          DEFAULT: 'var(--surface)',
          50: 'var(--surface-2)',
          100: 'var(--surface)',
          200: 'var(--surface)',
          300: 'var(--bg)',
          2: 'var(--surface-2)',
        },
        raised: 'var(--surface-2)',
        border: {
          subtle: 'var(--line)',
          DEFAULT: 'var(--line)',
          strong: 'var(--border-strong)',
        },
        brand: {
          accent: 'var(--accent)',
          lime: 'var(--accent)',
          limeHover: 'var(--accent)',
          pine: 'var(--bg)',
          ivory: 'var(--text)',
          emerald: 'var(--accent)',
          blue: 'var(--info)',
          amber: 'var(--medium)',
          rose: 'var(--danger)',
          cyan: 'var(--info)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          ink: 'var(--accent-ink)',
          soft: 'var(--accent-soft)',
        },
        caution: 'var(--medium)',
        medium: 'var(--medium)',
        info: 'var(--info)',
        warn: 'var(--medium)',
        text: {
          DEFAULT: 'var(--text)',
          primary: 'var(--text)',
          secondary: 'var(--text-2)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
          muted: 'var(--muted)',
          subtle: 'var(--text-3)',
        },
        muted: 'var(--muted)',
        subtle: 'var(--text-3)',
        dim: 'var(--text-3)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['var(--font-dm-sans)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        flat: 'none',
        native: 'none',
      },
    },
  },
  plugins: [],
};
