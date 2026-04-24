/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '480px',   // breakpoint extra para etiquetas de tabs
      },
      fontFamily: {
        sans:   ['Sora', 'sans-serif'],
        mono:   ['DM Mono', 'monospace'],
        script: ['Great Vibes', 'cursive'],
      },
      colors: {
        pink: {
          DEFAULT: '#e0277a',
          dark:    '#b81e62',
          deep:    '#8c1449',
          light:   '#fce9f2',
          mid:     '#f07ab4',
        },
        rose:  { DEFAULT: '#c9907a', light: '#f7ede9' },
        gold:  { DEFAULT: '#c8964a', light: '#f9f0e3' },
        ink:   { DEFAULT: '#1a1218', 2: '#4a3340', 3: '#9a7e8e' },
        surface: '#fdf5f9',
        line:    '#ead8e4',
      },
    },
  },
  plugins: [],
}
