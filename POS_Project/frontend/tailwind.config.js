/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        thai: ['Prompt', 'Noto Sans Thai', 'sans-serif'],
      },
      colors: {
        primary:  { 50: '#eef2ff', 100: '#e0e7ff', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
        success:  { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a' },
        danger:   { 50: '#fff1f2', 500: '#f43f5e', 600: '#e11d48' },
        indigo:   { 100: '#e0e7ff', 200: '#c7d2fe', 400: '#818cf8', 700: '#4338ca' },
      },
      minHeight: { touch: '44px' },
      minWidth:  { touch: '44px' },
      animation: { scan: 'scan 2s ease-in-out infinite' },
      keyframes:  { scan: { '0%,100%': { top: '10%' }, '50%': { top: '85%' } } },
    },
  },
  plugins: [],
};
