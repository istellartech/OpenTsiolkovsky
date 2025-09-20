import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#ff7a1a',
          foreground: '#14110f',
          50: '#fff6ef',
          100: '#ffe5d0',
          200: '#ffc89c',
          300: '#ffa162',
          400: '#ff8740',
          500: '#ff7a1a',
          600: '#f16005',
          700: '#c24a04',
          800: '#9c3b09',
          900: '#7d330c',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', '"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 40px -32px rgba(15, 23, 42, 0.4)',
      },
    },
  },
  plugins: [],
}

export default config
