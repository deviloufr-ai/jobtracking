// One-off: renders the SmartJobTracker brand mark into the source PNGs that
// `@capacitor/assets` expands into every Android density + the adaptive icon.
// Run: node scripts/gen-source-assets.mjs   (then: npx @capacitor/assets generate --android)
import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('assets', { recursive: true })

const GRAD = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>`

// Brand check mark (viewBox 0..64), centered at (cx,cy) scaled by s, in `stroke` colour.
const check = (cx, cy, s, stroke = '#ffffff') => `
  <g transform="translate(${cx},${cy}) scale(${s}) translate(-33,-31)">
    <polyline points="16,33 28,45 50,17" fill="none" stroke="${stroke}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="50" cy="17" r="5" fill="${stroke}"/>
  </g>`

const svgToPng = (svg, size, out) =>
  sharp(Buffer.from(svg)).resize(size, size).png().toFile(out)

const iconBackground = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">${GRAD}
  <rect width="1024" height="1024" fill="url(#g)"/></svg>`

const iconForeground = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  ${check(512, 512, 10)}</svg>`

const iconOnly = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">${GRAD}
  <rect width="1024" height="1024" rx="184" fill="url(#g)"/>${check(512, 512, 9)}</svg>`

const splash = (bg) => `<svg width="2732" height="2732" xmlns="http://www.w3.org/2000/svg">${GRAD}
  <rect width="2732" height="2732" fill="${bg}"/>
  <g transform="translate(1366,1366)">
    <rect x="-290" y="-290" width="580" height="580" rx="140" fill="url(#g)"/>
    ${check(0, 0, 7)}
  </g></svg>`

await Promise.all([
  svgToPng(iconBackground, 1024, 'assets/icon-background.png'),
  svgToPng(iconForeground, 1024, 'assets/icon-foreground.png'),
  svgToPng(iconOnly, 1024, 'assets/icon-only.png'),
  svgToPng(splash('#ffffff'), 2732, 'assets/splash.png'),
  svgToPng(splash('#0c0f16'), 2732, 'assets/splash-dark.png'),
])
console.log('✓ source assets written to assets/')
