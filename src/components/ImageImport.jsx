import { useState, useRef } from 'react'
import { getStatus } from '../hooks/useJobs'

const IS_DEV = import.meta.env.DEV

async function analyzeJobImage(base64Image, mimeType) {
  const endpoint = IS_DEV ? null : '/api/claude'
  
  if (!endpoint) {
    // Mock for dev
    return [
      { company: 'Yeita', position: 'Product Manager', status: 'reviewing', date: new Date().toISOString().split('T')[0], notes: 'Application viewed', confidence: 90 },
      { company: 'GojiberryAI', position: 'Founding Product Manager', status: 'sent', date: new Date().toISOString().split('T')[0], notes: 'Full Remote SaaS', confidence: 88 },
    ]
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64Image }
          },
          {
            type: 'text',
            text: `Analyse cette capture d'écran de candidatures (LinkedIn, Indeed, ou autre plateforme) et extrait toutes les candidatures visibles.

Pour chaque candidature retourne un JSON avec :
- company: nom de l'entreprise (string)
- position: intitulé du poste (string)
- status: un de ces statuts exacts: "sent" | "reviewing" | "interview" | "waiting" | "offer" | "rejected" | "cancelled"
- date: date au format YYYY-MM-DD (si visible, sinon date d'aujourd'hui)
- notes: informations utiles visibles (ex: "Application viewed", "Remote", "No longer accepting") max 80 chars
- confidence: score 0-100

Mapping des statuts :
- "sent" → Applied, Candidature envoyée, postulé
- "reviewing" → Application viewed, En cours d'examen, Viewed
- "interview" → Interview scheduled, Entretien planifié
- "waiting" → En attente, Waiting
- "offer" → Offer received, Offre reçue
- "rejected" → Rejected, Refusé, Not selected
- "cancelled" → Withdrawn, Annulé

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après, sans backticks.`
          }
        ]
      }]
    })
  })

  if (!res.ok) throw new Error('Erreur API Claude')
  const data = await res.json()
  const text = data.content?.[0]?.text || '[]'
  
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return []
  }
}

export default function ImageImport({ onImport, onClose, existingJobs }) {
  const [step, setStep] = useState('idle') // idle | analyzing | review
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const fileRef = useRef()

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Veuillez sélectionner une image (PNG, JPG, WebP)')
      return
    }

    setError(null)
    setPreview(URL.createObjectURL(file))
    setStep('analyzing')

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const parsed = await analyzeJobImage(base64, file.type)
      
      const existingNames = existingJobs.map(j => j.company.toLowerCase())
      const newOnly = parsed.filter(p => 
        p.company && !existingNames.includes(p.company.toLowerCase()) && p.confidence >= 50
      )

      setResults(newOnly)
      setSelected(new Set(newOnly.map((_, i) => i)))
      setStep('review')
    } catch (e) {
      setError('Erreur lors de l\'analyse : ' + e.message)
      setStep('idle')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleImport = () => {
    const toImport = results
      .filter((_, i) => selected.has(i))
      .map(r => ({
        company: r.company || 'Inconnu',
        position: r.position || 'Poste non précisé',
        url: '',
        status: r.status || 'sent',
        date: r.date || new Date().toISOString().split('T')[0],
        notes: r.notes || '',
      }))
    onImport(toImport)
    onClose()
  }

  const toggleSelect = (i) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={step !== 'analyzing' ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl z-10 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-lg">🖼️</div>
            <div>
              <h2 className="font-semibold text-gray-800 text-sm">Import par screenshot</h2>
              <p className="text-xs text-gray-400">LinkedIn, Indeed, Apec, Welcome to the Jungle...</p>
            </div>
          </div>
          {step !== 'analyzing' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          )}
        </div>

        <div className="px-6 py-5">

          {/* Step: idle — upload zone */}
          {step === 'idle' && (
            <div>
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
              >
                <div className="text-4xl mb-3">📸</div>
                <p className="font-medium text-gray-700 mb-1">Glissez une capture d'écran ici</p>
                <p className="text-sm text-gray-400 mb-4">ou cliquez pour sélectionner un fichier</p>
                <p className="text-xs text-gray-300">PNG, JPG, WebP • Max 10MB</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleFile(e.target.files[0])}
                />
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-3 mt-3">{error}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {['LinkedIn', 'Indeed', 'Apec', 'Welcome to the Jungle', 'Jobteaser'].map(p => (
                  <span key={p} className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Step: analyzing */}
          {step === 'analyzing' && (
            <div className="text-center py-6">
              {preview && (
                <div className="mb-4 rounded-xl overflow-hidden max-h-40 mx-auto">
                  <img src={preview} alt="preview" className="w-full object-cover opacity-60" />
                </div>
              )}
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-50 mb-3">
                <svg className="w-6 h-6 text-purple-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
              <p className="font-medium text-gray-700">Analyse de l'image en cours...</p>
              <p className="text-xs text-gray-400 mt-1">Claude extrait les candidatures visibles</p>
            </div>
          )}

          {/* Step: review */}
          {step === 'review' && (
            <div>
              {preview && (
                <div className="mb-4 rounded-xl overflow-hidden max-h-32">
                  <img src={preview} alt="preview" className="w-full object-cover opacity-40" />
                </div>
              )}
              {results.length === 0 ? (
                <div className="text-center py-4">
                  <div className="text-3xl mb-2">🤷</div>
                  <p className="text-gray-600 font-medium">Aucune candidature détectée</p>
                  <p className="text-xs text-gray-400 mt-1">Essayez avec une image plus lisible</p>
                  <button onClick={() => { setStep('idle'); setPreview(null) }} className="mt-3 text-sm text-indigo-600 hover:underline">
                    Réessayer
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-700">
                      {results.length} candidature{results.length > 1 ? 's' : ''} détectée{results.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-gray-400">{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</p>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {results.map((r, i) => {
                      const st = getStatus(r.status)
                      const isSelected = selected.has(i)
                      return (
                        <div
                          key={i}
                          onClick={() => toggleSelect(i)}
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected ? 'border-indigo-200 bg-indigo-50/50' : 'border-gray-100 bg-gray-50/50 opacity-60'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-colors ${
                            isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                          }`}>
                            {isSelected && <span className="text-white text-xs">✓</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm text-gray-800">{r.company}</span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                {st.label}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{r.position}</p>
                            {r.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{r.notes}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && results.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-between">
            <button
              onClick={() => { setStep('idle'); setPreview(null); setResults([]) }}
              className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-4 py-2 rounded-lg"
            >
              ← Nouvelle image
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">
                Annuler
              </button>
              <button
                onClick={handleImport}
                disabled={selected.size === 0}
                className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                Importer {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
