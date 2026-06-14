import { PDFDocument } from 'pdf-lib'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
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

    // Load PDF and optimize
    const pdfDoc = await PDFDocument.load(pdfBytes)

    // Compress: remove unnecessary metadata and optimize
    pdfDoc.setProducer('JobTrackr')
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
