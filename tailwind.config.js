/** @type {import('tailwindcss').Config} */

// ── Redesign 2026 · "Clean & Friendly" ───────────────────────────────────────
// Notion/Figma-flavoured modern light: pure-white surfaces on a soft cool-gray
// canvas, comfortable rounded cards, and a friendly vivid-blue accent that also
// serves as the primary action colour — flat, never a gradient (gradients were
// the old "AI SaaS" tell). Because gray + slate are remapped at the token level,
// every bg-white / text-gray-* / border-gray-* / bg-slate-50 across the app
// picks up the clean neutral at once. Dark themes keep working — themes.css
// overrides these classes via --theme-* variables regardless of light values.

// Clean cool-neutral ("soft gray → slate"). Low chroma, a hair cool, friendly.
const neutral = {
  50:  '#f7f8fa',
  100: '#eef0f4',
  200: '#e3e6ec',  // hairline borders
  300: '#d0d5de',
  400: '#9ba2af',
  500: '#6b7280',
  600: '#4b5563',
  700: '#374151',
  800: '#1f242c',
  900: '#12161c',
  950: '#0b0e12',
}

// Vivid blue accent — clean, friendly, confident (brand-600 #2563eb). The
// primary action colour and the single hue that anchors the whole UI.
const blue = {
  50:  '#eff6ff',
  100: '#dbeafe',
  200: '#bfdbfe',
  300: '#93c5fd',
  400: '#60a5fa',
  500: '#3b82f6',
  600: '#2563eb',
  700: '#1d4ed8',
  800: '#1e40af',
  900: '#1e3a8a',
  950: '#172554',
}

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: blue,
        // Remap the app's two neutral families onto one clean cool-gray ramp.
        gray: neutral,
        slate: neutral,
        ink: neutral,
      },
      fontFamily: {
        // Inter drives the UI; Plus Jakarta Sans gives headings + the wordmark a
        // friendly, rounded voice without the "default Inter/Space Grotesk" look
        // (loaded in index.html).
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Soft, cool-neutral, layered — friendly depth on white/gray surfaces.
        'card':    '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.07)',
        'card-lg': '0 4px 12px -2px rgb(16 24 40 / 0.08), 0 12px 28px -8px rgb(16 24 40 / 0.10)',
        'card-xl': '0 8px 24px -6px rgb(16 24 40 / 0.10), 0 32px 56px -20px rgb(16 24 40 / 0.16)',
        // Accent shadow that sits under the blue buttons / logo mark.
        'ink':     '0 1px 2px 0 rgb(37 99 235 / 0.12), 0 6px 16px -4px rgb(37 99 235 / 0.28)',
        'glow':    '0 0 0 3px rgb(37 99 235 / 0.16)',
        'hairline':'0 0 0 1px rgb(16 24 40 / 0.06)',
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
