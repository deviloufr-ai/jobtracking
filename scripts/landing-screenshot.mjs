#!/usr/bin/env node
// Regenerates public/app-screenshot.webp — the product shot on the landing page.
//
// Uses FICTIONAL data only (invented companies, never a real account), seeded into
// the local IndexedDB of a dev server running without Supabase (local-only mode,
// no sign-in). Nothing touches production data.
//
//   1. Start the dev server in screenshot mode (Supabase blanked by .env.screenshot):
//        npm run dev -- --mode screenshot --port 5199 --strictPort
//   2. node scripts/landing-screenshot.mjs [url] [out]
//        url defaults to http://localhost:5199, out to public/app-screenshot.webp
//
// Drives a headless Edge/Chrome over the DevTools protocol (Node >= 22 for the
// global WebSocket) — no extra dependencies.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const URL_ = process.argv[2] || 'http://localhost:5199'
const OUT = resolve(process.argv[3] || 'public/app-screenshot.webp')
const PORT = 9333
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1.5 }

const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

// ── fictional dataset ─────────────────────────────────────────────────────────
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const e = (n, status, note) => ({ date: day(n), status, note, source: 'manual' })
const job = (id, company, position, status, score, history, extra = {}) => ({
  id: `demo-${id}`, company, position, status, score, history,
  date: history[0].date, notes: '', favorite: false,
  createdAt: new Date(history[0].date).toISOString(), updatedAt: new Date().toISOString(),
  ...extra,
})

const JOBS = [
  job(1, 'Octave Finance', 'Senior Product Manager', 'offer', 88, [
    e(38, 'sent', 'Candidature envoyée'),
    e(30, 'reviewing', 'Premier échange avec la recruteuse'),
    e(21, 'interview', 'Entretien manager — cas produit'),
    e(12, 'interview', 'Entretien final avec la CPO'),
    e(3, 'offer', '🎉 Offre reçue : 78 k€ fixe + 10 % variable'),
  ], { favorite: true }),
  job(2, 'Brisa Santé', 'Product Manager Growth', 'interview', 84, [
    e(20, 'sent', 'Candidature envoyée'),
    e(13, 'reviewing', 'Profil retenu pour un premier échange'),
    e(4, 'interview', 'Entretien RH — 30 min'),
  ], { favorite: true }),
  job(3, 'Kovalt', 'Product Owner Data', 'interview', 79, [
    e(16, 'sent', 'Candidature envoyée'),
    e(9, 'interview', 'Étude de cas à rendre vendredi'),
  ]),
  job(4, 'Nordelle', 'Lead Product Manager', 'reviewing', 81, [
    e(25, 'sent', 'Candidature envoyée'),
    e(22, 'reviewing', 'Candidature en cours d’examen'),
  ]),
  job(5, 'Maison Verdi', 'Product Manager E-commerce', 'reviewing', 74, [
    e(9, 'sent', 'Candidature envoyée'),
    e(7, 'reviewing', 'Accusé de réception — retour sous 2 semaines'),
  ]),
  job(6, 'Terravia', 'Senior PM Plateforme', 'sent', 77, [e(5, 'sent', 'Candidature envoyée')]),
  job(7, 'Pixaloo', 'Product Manager Mobile', 'sent', 69, [e(2, 'sent', 'Candidature envoyée via le site carrière')]),
  job(8, 'Solen Énergie', 'Product Manager B2B', 'waiting', 72, [
    e(30, 'sent', 'Candidature envoyée'),
    e(24, 'reviewing', 'Candidature en cours d’examen'),
    e(14, 'waiting', 'Relance envoyée — en attente de retour'),
  ]),
  job(9, 'Atelier Nomade', 'Head of Product', 'todo', 86, [e(1, 'todo', 'Offre repérée — prête à postuler')]),
  job(10, 'Quanta Logistique', 'Product Manager IA', 'todo', 91, [e(0, 'todo', 'Offre repérée — prête à postuler')]),
  job(11, 'Fyra Studio', 'Product Manager Senior', 'rejected', 65, [
    e(40, 'sent', 'Candidature envoyée'),
    e(26, 'interview', 'Entretien téléphonique'),
    e(18, 'rejected', 'Refus — profil plus orienté B2C retenu'),
  ]),
  job(12, 'Lumen Assurances', 'Product Owner', 'rejected_ats', 58, [
    e(33, 'sent', 'Candidature envoyée'),
    e(28, 'rejected_ats', 'Refus automatique (ATS)'),
  ]),
]

// Runs in the page: clear then fill the app's IndexedDB "jobs" store.
const SEED = (jobs) => `new Promise((res, rej) => {
  const r = indexedDB.open('jobtrackr');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const tx = r.result.transaction('jobs', 'readwrite');
    const store = tx.objectStore('jobs');
    store.clear();
    for (const j of ${JSON.stringify(jobs)}) store.put(j);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  };
})`

// Pre-set per-device flags so no tour/banner covers the shot. In local-only mode
// the app leaves the landing page once a Gmail user is known, so give it a
// fictional profile — with NO token, so no Gmail call is ever attempted.
const DEMO_ACCOUNT = { 'camille.martin@example.com': { user: { email: 'camille.martin@example.com', name: 'Camille Martin' } } }
const PRELOAD = `try {
  localStorage.setItem('jobtrackr_language', 'fr');
  localStorage.setItem('jobtrackr_tour_done', '1');
  localStorage.setItem('jobtrackr_analytics_consent', 'denied');
  localStorage.setItem('jobtrackr_onboarded', '1');
  localStorage.setItem('jobtrackr_notif_banner_dismissed', '1');
  localStorage.setItem('jobtrackr_notif_banner_dismiss_time', String(Date.now()));
  localStorage.setItem('jt_gmail_accounts', ${JSON.stringify(JSON.stringify(DEMO_ACCOUNT))});
} catch {}`

// ── DevTools protocol plumbing ────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function waitFor(fn, ms = 15000) {
  const t0 = Date.now()
  for (;;) {
    try { const v = await fn(); if (v) return v } catch { /* retry */ }
    if (Date.now() - t0 > ms) throw new Error('timeout')
    await sleep(250)
  }
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id)
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
    } else if (msg.method) listeners.forEach(l => l(msg))
  }
  return {
    open: new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej }),
    send: (method, params = {}) => new Promise((res, rej) => {
      const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params }))
    }),
    once: (method) => new Promise(res => { const l = (m) => { if (m.method === method) { listeners.splice(listeners.indexOf(l), 1); res(m) } }; listeners.push(l) }),
    close: () => ws.close(),
  }
}

async function main() {
  const exe = BROWSERS.find(p => existsSync(p))
  if (!exe) throw new Error('No Edge/Chrome found — set BROWSER_PATH')
  await waitFor(() => fetch(URL_).then(r => r.ok), 20000).catch(() => { throw new Error(`Dev server not reachable at ${URL_}`) })

  const profile = mkdtempSync(join(tmpdir(), 'sjt-shot-'))
  const browser = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--lang=fr-FR', '--no-first-run', '--no-default-browser-check',
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, 'about:blank',
  ], { stdio: 'ignore' })

  try {
    const target = await waitFor(async () => {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json())
      return list.find(t => t.type === 'page')
    })
    const c = cdp(target.webSocketDebuggerUrl)
    await c.open
    await c.send('Page.enable')
    await c.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, mobile: false })
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: PRELOAD })

    // 1st load creates the DB schema; seed it; 2nd load renders the seeded data.
    let loaded = c.once('Page.loadEventFired')
    await c.send('Page.navigate', { url: URL_ })
    await loaded
    await waitFor(async () => {
      const r = await c.send('Runtime.evaluate', { expression: `(async()=>{const d=await indexedDB.databases();return d.some(x=>x.name==='jobtrackr')})()`, awaitPromise: true })
      return r.result.value
    })
    await sleep(1500)
    const seeded = await c.send('Runtime.evaluate', { expression: SEED(JOBS), awaitPromise: true })
    if (seeded.exceptionDetails) throw new Error('Seeding failed: ' + seeded.exceptionDetails.text)

    loaded = c.once('Page.loadEventFired')
    await c.send('Page.reload', { ignoreCache: true })
    await loaded
    await sleep(6000) // let reprocess/derived views settle

    const shot = await c.send('Page.captureScreenshot', { format: 'webp', quality: 82 })
    writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
    console.log(`Saved ${OUT}`)
    c.close()
  } finally {
    browser.kill()
    await sleep(500)
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* locked on Windows — harmless */ }
  }
}

main().catch(err => { console.error(err.message); process.exit(1) })
