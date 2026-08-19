import { useState, useRef, useMemo } from 'react'
import { useCVs } from '../hooks/useCVs'
import { aiFetch } from '../services/apiKey'
import { useDragDock } from '../hooks/useDragDock'

export default function MotivationLetterGenerator({ job, onClose, cvText, initialContent, onSaveLetter }) {
  const { cvs } = useCVs()
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 896 })
  const [selectedCVId, setSelectedCVId] = useState(null)
  const [letterText, setLetterText] = useState(initialContent || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [language, setLanguage] = useState('auto')
  const [context, setContext] = useState('')
  const [saved, setSaved] = useState(false)
  const editorRef = useRef(null)

  // Use job-specific CV if available, otherwise allow selecting from uploaded CVs
  const effectiveCV = useMemo(() => {
    if (cvText && cvText.trim()) return cvText
    if (selectedCVId) {
      const selected = cvs.find(c => c.id === selectedCVId)
      return selected?.text || ''
    }
    return cvs.length > 0 ? cvs[0]?.text || '' : ''
  }, [cvText, cvs, selectedCVId])

  const generateLetter = async () => {
    const finalCVText = effectiveCV
    if (!finalCVText || finalCVText.trim() === '') {
      setError('Veuillez d\'abord uploader un CV ou en sélectionner un')
      return
    }

    if (!job.jobDescription && !job.description && !job.url && !job.notes) {
      setError('Description du poste requise. Ajoutez une URL ou une description.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Try to fetch job description if only URL is available
      let jobDesc = job.jobDescription || job.description || job.notes || ''
      let scrapeError = null
      if (!jobDesc && job.url) {
        try {
          const response = await fetch('/api/fetch-jd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: job.url })
          })
          const data = await response.json().catch(() => ({}))
          // The scrape can 200 with real text, or fail (incl. 422 for a JS-shell
          // page like Welcome to the Jungle / LinkedIn). Only use genuine text;
          // otherwise keep the scraper's message so the user knows what to do.
          if (response.ok && data.text) {
            jobDesc = data.text
          } else {
            scrapeError = data.error || null
          }
        } catch (e) {
          console.warn('Could not fetch job description from URL')
        }
      }

      if (!jobDesc) {
        setError(scrapeError
          || 'Aucune description du poste disponible. Veuillez en ajouter une manuellement ou fournir une URL.')
        setLoading(false)
        return
      }

      const response = await aiFetch('/api/generate-motivation-letter', {
        cvText: finalCVText,
        jobDescription: jobDesc,
        company: job.company,
        position: job.position,
        language,
        context
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `Generation failed: ${response.status}`)
      }

      const data = await response.json()
      setLetterText(data.letter)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const saveLetter = () => {
    if (!letterText || !onSaveLetter) return
    onSaveLetter(job.id, {
      letterSaved: {
        content: letterText,
        savedAt: new Date().toISOString(),
      }
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const exportPDF = async () => {
    if (!letterText) return

    const { jsPDF } = await import('jspdf')

    // Save letter first
    saveLetter()

    // Render real (vector) text rather than rasterizing to an image — crisp at
    // any zoom, selectable, and a much smaller file.
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 20
    const maxW = pageW - margin * 2
    const lineHeight = 6      // mm between wrapped lines
    const paraGap = 3         // extra mm between paragraphs

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(40, 40, 40)

    let y = margin
    const paragraphs = letterText.replace(/\r\n/g, '\n').split('\n')

    for (const para of paragraphs) {
      if (!para.trim()) { y += paraGap; continue }
      const lines = doc.splitTextToSize(para, maxW)
      for (const line of lines) {
        if (y > pageH - margin) { doc.addPage(); y = margin }
        doc.text(line, margin, y)
        y += lineHeight
      }
      y += paraGap
    }

    doc.save(`lettre-motivation-${job.company}-${new Date().toISOString().split('T')[0]}.pdf`)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      {snapPreview}
      <div className="bg-white rounded-2xl shadow-2xl w-11/12 max-h-[85vh] flex flex-col max-w-4xl" style={panelStyle}>
        {/* Header */}
        <div onPointerDown={startDrag} className="flex items-center justify-between p-4 border-b border-gray-200 cursor-move select-none">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Lettre de motivation</h2>
            <p className="text-xs text-gray-500">{job.company} – {job.position}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {!letterText ? (
            <div className="p-6 space-y-4">
              {!cvText && cvs.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Sélectionner un CV</label>
                  <select
                    value={selectedCVId || (cvs[0]?.id || '')}
                    onChange={(e) => setSelectedCVId(e.target.value)}
                    disabled={loading}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {cvs.map(cv => (
                      <option key={cv.id} value={cv.id}>{cv.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Langue</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={loading}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="auto">Détecter (auto)</option>
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Contexte additionnel <span className="text-gray-400 font-normal">(optionnel)</span>
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  disabled={loading}
                  rows={3}
                  placeholder="Points à mettre en avant, motivation spécifique, disponibilité, ton souhaité…"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <button
                onClick={generateLetter}
                disabled={loading}
                className="w-full bg-indigo-600 text-white font-medium py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '⏳ Génération en cours...' : '✨ Générer la lettre'}
              </button>

              {!letterText && !loading && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                  <p>La lettre sera générée en fonction de votre CV et de la description du poste.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-2">Contenu</label>
                <textarea
                  ref={editorRef}
                  value={letterText}
                  onChange={(e) => setLetterText(e.target.value)}
                  className="w-full h-96 border border-gray-300 rounded-lg p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Contexte additionnel <span className="text-gray-400 font-normal">(pris en compte lors de la regénération)</span>
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  disabled={loading}
                  rows={3}
                  placeholder="Points à mettre en avant, motivation spécifique, disponibilité, ton souhaité… puis cliquez sur 🔄 Regénérer"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                <p>📝 Vous pouvez éditer le contenu ci-dessus avant d'exporter en PDF</p>
                {saved && <p className="text-green-600 mt-2">✅ Lettre sauvegardée</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 gap-2">
          <button
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-100"
          >
            Fermer
          </button>
          {letterText && (
            <div className="flex gap-2">
              <button
                onClick={saveLetter}
                className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-100"
              >
                💾 Sauvegarder
              </button>
              <button
                onClick={generateLetter}
                disabled={loading}
                className="text-sm text-indigo-600 hover:text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-50"
              >
                🔄 Regénérer
              </button>
              <button
                onClick={exportPDF}
                className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors"
              >
                📥 Exporter PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
