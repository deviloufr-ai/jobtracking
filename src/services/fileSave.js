import { Capacitor } from '@capacitor/core'

// Cross-platform file delivery.
//
// On the WEB this is a normal browser download. Inside the Capacitor Android/iOS
// shell the WebView has NO download manager, so a blob/anchor download (jsPDF
// .save(), html2pdf .save(), `<a download>`) silently does nothing — this is why
// "download CV" appeared broken on the Android app. On native we instead write the
// bytes into the app's cache and open the OS share sheet, from which the user can
// save the file (Files/Drive) or open it.
//
// Native path needs @capacitor/filesystem and @capacitor/share compiled into the
// app: after adding them run `npm install`, then `npx cap sync android`, then
// rebuild the APK. The plugin modules are imported dynamically so they never load
// on the web build.

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.onloadend = () => {
      const res = String(reader.result || '')
      const comma = res.indexOf(',')
      resolve(comma >= 0 ? res.slice(comma + 1) : res) // strip the data: prefix
    }
    reader.readAsDataURL(blob)
  })
}

function webDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has committed the download first.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const isNative = () => {
  try { return !!Capacitor?.isNativePlatform?.() } catch { return false }
}

/**
 * Deliver a generated file to the user. Web → browser download; native → write to
 * cache + share sheet. Returns { web } or { native, uri }. Throws only on a real
 * failure (a user-cancelled share sheet is treated as success).
 */
export async function deliverFile(blob, filename, _mimeType) {
  if (!isNative()) {
    webDownload(blob, filename)
    return { web: true }
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const data = await blobToBase64(blob)
  const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache })
  try {
    await Share.share({ title: filename, url: uri })
  } catch (err) {
    // The user dismissing the share sheet rejects with a "cancel" message — that's
    // not an error (the file is already written). Re-throw anything else.
    if (!/cancel/i.test(err?.message || '')) throw err
  }
  return { native: true, uri }
}

/** Convenience wrapper for text/JSON payloads. */
export async function deliverText(text, filename, mimeType = 'text/plain') {
  return deliverFile(new Blob([text], { type: mimeType }), filename, mimeType)
}
