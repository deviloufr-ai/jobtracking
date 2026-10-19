// JobTrackr Sync Script — injected into the JobTrackr tab to read localStorage
// Returns { profile, cvText, cvName, apiKey } to the extension background

(function () {
  try {
    // Debug: log what's available in localStorage
    const allKeys = Object.keys(localStorage)

    // Personal Claude key the user saved in the web app's Settings. Lets the
    // extension reuse it so AI features run unlimited without re-entering it.
    const apiKey = localStorage.getItem('jobtrackr_claude_api_key') || null

    // The app's UI language (written by useLanguage, 'fr' | 'en'). The add-on
    // uses it as the output language of the match-score prose (summary /
    // strengths / gaps / listing reason) — see scoreOutputLanguage() in
    // background.js. Null when the user never picked one (browser language wins).
    const uiLang = localStorage.getItem('jobtrackr_language') || null

    // Read profile
    const rawProfile = localStorage.getItem('jobtrackr_profile')
    if (!rawProfile) {
      // Still propagate the key even if there's no profile/CV to sync yet.
      if (apiKey) return { apiKey, uiLang, synced: true }
      return { error: `No profile found in localStorage. Available keys: ${allKeys.join(', ')}`, synced: false }
    }

    const profile = JSON.parse(rawProfile)
    if (!profile) {
      if (apiKey) return { apiKey, uiLang, synced: true }
      return { error: 'Profile is empty or null', synced: false }
    }

    // Read CVs. The app stores CVs in IndexedDB (async, unreadable from this
    // synchronous injected script), so it mirrors the most-recent CV into
    // localStorage under `jobtrackr_base_cv`. Prefer that; fall back to the
    // legacy `jobtrackr_cvs` array for older app versions.
    let baseCv = null
    const rawBaseCv = localStorage.getItem('jobtrackr_base_cv')
    if (rawBaseCv) {
      try { baseCv = JSON.parse(rawBaseCv) } catch { baseCv = null }
    }
    if (!baseCv || !baseCv.text) {
      const rawCVs = localStorage.getItem('jobtrackr_cvs')
      if (rawCVs) {
        const cvs = JSON.parse(rawCVs)
        if (Array.isArray(cvs) && cvs.length > 0) {
          // Sort by most recent (descending)
          baseCv = cvs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null
        }
      }
    }

    // CV *file* (binary) for real form uploads (LinkedIn Easy Apply etc.). The app
    // stores the generated PDF in IndexedDB; to make it reachable from this
    // synchronous injected script it must mirror a data URL into localStorage —
    // either as a field on `jobtrackr_base_cv` (fileDataUrl / dataUrl / pdfDataUrl,
    // or base64+mime) or under a dedicated key. We probe all of these; when none is
    // present, cvFile stays null and the extension leaves the CV step to the user.
    let cvFile = null
    const asDataUrl = (v, mime) => {
      if (!v || typeof v !== 'string') return null
      if (v.startsWith('data:')) return v
      // Bare base64 → wrap with a mime (default PDF).
      if (/^[A-Za-z0-9+/=\s]+$/.test(v) && v.length > 100) return `data:${mime || 'application/pdf'};base64,${v.replace(/\s+/g, '')}`
      return null
    }
    const fromObj = (o) => {
      if (!o || typeof o !== 'object') return null
      const url = asDataUrl(o.fileDataUrl || o.dataUrl || o.pdfDataUrl || o.fileBase64 || o.base64 || o.file, o.mime || o.type)
      if (!url) return null
      return { name: o.fileName || o.name || 'CV.pdf', type: o.mime || o.type || 'application/pdf', dataUrl: url }
    }
    cvFile = fromObj(baseCv)
    if (!cvFile) {
      for (const key of ['jobtrackr_base_cv_file', 'jobtrackr_base_cv_pdf', 'jobtrackr_cv_file']) {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        let parsed = null
        try { parsed = JSON.parse(raw) } catch { parsed = raw }
        cvFile = (typeof parsed === 'string')
          ? (asDataUrl(parsed) ? { name: 'CV.pdf', type: 'application/pdf', dataUrl: asDataUrl(parsed) } : null)
          : fromObj(parsed)
        if (cvFile) break
      }
    }

    return {
      profile,
      cvText: baseCv?.text || null,
      cvName: baseCv?.name || null,
      cvFile,
      apiKey,
      uiLang,
      synced: true
    }
  } catch (e) {
    return {
      error: `Sync error: ${e.message}. localStorage keys: ${Object.keys(localStorage).join(', ')}`,
      synced: false
    }
  }
})()
