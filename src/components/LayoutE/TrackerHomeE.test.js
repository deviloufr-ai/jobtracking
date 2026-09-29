import { describe, it, expect } from 'vitest'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TrackerHomeE from './TrackerHomeE'
import { fr } from '../../translations/fr'

// Under vitest the app's JSX compiles to classic React.createElement calls.
globalThis.React = React

// Resolve 'a.b.c' keys against the real FR dictionary so the assertions read
// like what a user sees.
const t = (key) => key.split('.').reduce((o, k) => o?.[k], fr) ?? key
const noop = () => {}
const handlers = { onConnectGmail: noop, onImportScreenshot: noop, onImportLink: noop, onAddManual: noop }

describe('TrackerHomeE first run', () => {
  it('welcomes a brand-new account with the ways to add a first application', () => {
    const html = renderToStaticMarkup(createElement(TrackerHomeE, { jobs: [], filtered: [], t, ...handlers }))
    expect(html).toContain('Ajoutez votre première candidature')
    expect(html).toContain('Connecter Gmail')
    expect(html).toContain('Capture d’écran')
    expect(html).toContain('Lien LinkedIn')
    expect(html).toContain('Saisie manuelle')
    // not the filtered-search dead end
    expect(html).not.toContain('Aucune candidature trouvée')
    expect(html).not.toContain('Réinitialiser les filtres')
  })

  it('keeps the regular list once there is at least one application', () => {
    const job = { id: 'j1', company: 'Acme', position: 'PM', status: 'sent', date: '2026-09-01', history: [] }
    const html = renderToStaticMarkup(createElement(TrackerHomeE, { jobs: [job], filtered: [job], t, ...handlers }))
    expect(html).not.toContain('Ajoutez votre première candidature')
    expect(html).toContain('Acme')
  })
})
