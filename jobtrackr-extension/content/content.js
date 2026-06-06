// JobTrackr content script — extracts job page text and sends it to the popup

;(function () {
  if (window.__jobtrackrInjected) return
  window.__jobtrackrInjected = true

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'EXTRACT_PAGE') return

    // Grab the most relevant text: try <main>, <article>, then body fallback
    const root =
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]') ||
      document.body

    // Strip nav/header/footer noise
    const clone = root.cloneNode(true)
    for (const tag of clone.querySelectorAll('nav,header,footer,script,style,noscript,aside')) {
      tag.remove()
    }

    const text = (clone.innerText || clone.textContent || '')
      .replace(/\s{3,}/g, '\n\n')
      .trim()
      .slice(0, 6000) // cap to keep Claude prompt lean

    return Promise.resolve({
      text,
      title: document.title,
      url: window.location.href,
    })
  })
})()
