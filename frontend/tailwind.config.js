/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#0D0D0D',
          secondary: '#161616',
          tertiary: '#1F1F1F'
        },
        accent: {
          primary: '#FF6B35',
          secondary: '#00D9FF',
          tertiary: '#A855F7'
        },
        text: {
          primary: '#FAFAFA',
          secondary: '#A1A1A1',
          tertiary: '#6B6B6B'
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
        'sans': ['Outfit', 'DM Sans', 'sans-serif']
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}