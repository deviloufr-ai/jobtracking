import { useState, useRef, useMemo } from 'react'
import html2pdf from 'html2pdf.js'
import { useCVs } from '../hooks/useCVs'

export default function MotivationLetterGenerator({ job, onClose, cvText, initialContent, onSaveLetter }) {
  const { cvs } = useCVs()
  const [selectedCVId, setSelectedCVId] = useState(null)
  const [letterText, setLetterText] = useState(initialContent || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [language, setLanguage] = useState('auto')
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

    if (!job.jobDescription && !job.url && !job.notes) {
      setError('Description du poste requise. Ajoutez une URL ou une description.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Try to fetch job description if only URL is available
      let jobDesc = job.jobDescription || job.notes || ''
      if (!jobDesc && job.url) {
        try {
          const response = await fetch('/api/fetch-jd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: job.url })
          })
          const data = await response.json()
          jobDesc = data.description || ''
        } catch (e) {
          console.warn('Could not fetch job description from URL')
        }
      }

      if (!jobDesc) {
        setError('Aucune description du poste disponible. Veuillez en ajouter une manuellement ou fournir une URL.')
        setLoading(false)
        return
      }

      const response = await fetch('/api/generate-motivation-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvText: finalCVText,
          jobDescription: jobDesc,
          company: job.company,
          position: job.position,
          language
        })
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

  const exportPDF = () => {
    if (!letterText) return

    // Save letter first
    saveLetter()

    const element = document.createElement('div')
    element.innerHTML = letterText
      .split('\n')
      .map(line => {
        if (!line.trim()) return '<div style="height: 8px"></div>'
        return `<p style="margin: 8px 0; line-height: 1.5">${line}</p>`
      })
      .join('')

    element.style.cssText = `
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #333;
      padding: 40px;
      max-width: 800px;
      background: white;
    `

    const opt = {
      margin: 10,
      filename: `lettre-motivation-${job.company}-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.75 },  // Reduced from 0.98 for smaller file size
      html2canvas: { scale: 1, logging: false },  // Scale 1 instead of 2
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true, precision: 10 }
    }

    html2pdf().set(opt).from(element).save()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-11/12 max-h-[85vh] flex flex-col max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
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
