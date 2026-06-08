import { useState, useEffect } from 'react'

// Custom hook to detect if JobTrackr Firefox extension is installed
export function useExtensionDetect() {
  const [installed, setInstalled] = useState(null) // null = checking, true/false = result

  useEffect(() => {
    // Method 1: extension sets data-jobtrackr-ext on <html>
    if (document.documentElement.hasAttribute('data-jobtrackr-ext')) {
      setInstalled(true)
      return
    }

    // Method 2: ping via custom event
    const timeout = setTimeout(() => setInstalled(false), 800)
    const handler = () => { clearTimeout(timeout); setInstalled(true) }
    window.addEventListener('jobtrackr-ext-pong', handler, { once: true })
    window.dispatchEvent(new CustomEvent('jobtrackr-ext-ping'))

    return () => { clearTimeout(timeout); window.removeEventListener('jobtrackr-ext-pong', handler) }
  }, [])

  return installed
}
