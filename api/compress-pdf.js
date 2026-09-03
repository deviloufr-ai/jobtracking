import { PDFDocument } from 'pdf-lib'
import { applyCors, getClientIp, rateLimit } from './_lib/http.js'

const MAX_PDF_BYTES = 8 * 1024 * 1024 // 8 MB decoded — bounds the CPU-bound parse
const MAX_PDF_PAGES = 100

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }

  // Throttle: this runs untrusted, CPU-bound pdf-lib parsing — cap the request rate
  // so it can't be used as a compute-DoS lever.
  const { ok, retryAfter } = rateLimit({ key: `compress-pdf:${getClientIp(req)}`, limit: 20, windowMs: 60_000 })
  if (!ok) {
    res.setHeader('Retry-After', String(retryAfter))
    res.status(429).json({ error: 'Too many requests. Please slow down.' })
    return
  }

  const { pdfBase64 } = req.body
  if (!pdfBase64) {
    res.status(400).json({ error: 'pdfBase64 required' })
    return
  }

  try {
    // Decode base64 PDF
    const pdfBytes = Buffer.from(pdfBase64.split(',')[1] || pdfBase64, 'base64')

    // Bound decoded size before the (CPU-bound) parse.
    if (pdfBytes.length > MAX_PDF_BYTES) {
      res.status(413).json({ error: 'PDF too large (max 8 MB).' })
      return
    }

    // Load PDF and optimize
    const pdfDoc = await PDFDocument.load(pdfBytes)

    if (pdfDoc.getPageCount() > MAX_PDF_PAGES) {
      res.status(413).json({ error: `PDF has too many pages (max ${MAX_PDF_PAGES}).` })
      return
    }

    // Compress: remove unnecessary metadata and optimize
    pdfDoc.setProducer('SmartJobTracker')
    pdfDoc.setCreationDate(new Date())

    // Get all pages and re-encode to reduce size
    const pages = pdfDoc.getPages()
    for (const page of pages) {
      // Clear any unnecessary content
      if (page.node) {
        page.node.setMediaBox(page.getMediaBox()[0], page.getMediaBox()[1], page.getMediaBox()[2], page.getMediaBox()[3])
      }
    }

    // Save with compression
    const compressedBytes = await pdfDoc.save({ useObjectStreams: true })
    const compressedBase64 = Buffer.from(compressedBytes).toString('base64')

    // Calculate compression ratio
    const originalSize = pdfBytes.length
    const compressedSize = compressedBytes.length
    const ratio = Math.round((1 - compressedSize / originalSize) * 100)

    res.status(200).json({
      pdfBase64: `data:application/pdf;base64,${compressedBase64}`,
      originalSize,
      compressedSize,
      compressionRatio: ratio
    })
  } catch (err) {
    console.error('PDF compression error:', err)
    res.status(500).json({ error: err.message })
  }
}
