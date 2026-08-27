// Single source of truth for the browser-extension version & download link.
//
// ── RELEASE CHECKLIST — every time you publish a new extension build ──────────
//   1. Bump  "version"  in  jobtrackr-extension/manifest.json
//   2. Get the build Mozilla-signed (addons.mozilla.org → self-distribution) and
//      drop the signed file at  public/jobtracker-addon-<version>.xpi
//   3. Set  LATEST_EXTENSION_VERSION  below to that exact version.
// That's it — the header pill, the update modal, Settings and onboarding all read
// from here, so a release is a one-line change.
//
// The app compares LATEST_EXTENSION_VERSION against the version the *installed*
// extension advertises (via the `data-jobtrackr-ext` attribute / the
// `jobtrackr-ext-pong` event detail — see jobtrackr-extension/content.js). When
// the user is behind, ExtensionUpdateModal offers the update.
//
// NOTE: this must always point at a version whose signed .xpi actually exists in
// public/, otherwise the download 404s and "update" would loop forever.
export const LATEST_EXTENSION_VERSION = '1.6.1'

// Path (served from /public) of the signed .xpi users download to install/update.
export const EXTENSION_XPI_PATH = `/jobtracker-addon-${LATEST_EXTENSION_VERSION}.xpi`

// Compare two dotted version strings. Returns -1 / 0 / 1 like a comparator.
// Missing/non-numeric segments count as 0, so '1.6' === '1.6.0'.
export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

// Parse the version an installed extension advertises. Builds before version
// reporting existed set the attribute to the literal string 'true' — that means
// "installed, version unknown", so we return null and don't nag them.
export function parseExtVersion(raw) {
  if (!raw || raw === 'true') return null
  return /^\d+(\.\d+)*$/.test(raw) ? raw : null
}
