/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        }
      },
      boxShadow: {
        'card':    '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
        'card-lg': '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.08)',
        'glow':    '0 0 0 3px rgb(99 102 241 / 0.2)',
      },
      keyframes: {
        'fade-in':   { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-up':  { from: { opacity: '0', transform: 'translateX(-50%) translateY(8px)' }, to: { opacity: '1', transform: 'translateX(-50%) translateY(0)' } },
        'sheet-up':     { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'backdrop-in':  { from: { opacity: '0' }, to: { opacity: '1' } },
        'expand':       { from: { opacity: '0', transform: 'translateY(-6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pop-in':       { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
      animation: {
        'fade-in':  'fade-in 0.15s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
        'sheet-up':    'sheet-up 0.28s cubic-bezier(0.32,0.72,0,1)',
        'backdrop-in': 'backdrop-in 0.2s ease-out',
        'expand':      'expand 0.2s ease-out',
        'pop-in':      'pop-in 0.18s ease-out',
      },
    },
  },
  plugins: [],
}
