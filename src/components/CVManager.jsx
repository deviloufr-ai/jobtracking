import { useState, useRef } from 'react'
import { useCVs } from '../hooks/useCVs'
import CVGenerator from './CVGenerator'

const PROFILE_KEY = 'jobtrackr_profile'

function saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)) } catch {}
}
function loadProfile() {
  try { const r = localStorage.getItem(PROFILE_KEY); return r ? JSON.parse(r) : null } catch { return null }
}

export default function CVManager({ jobs, preselectedJob }) {
  const { cvs, addCV, deleteCV, renameCV } = useCVs()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [generatorState, setGeneratorState] = useState(null)
  const [extractingId, setExtractingId] = useState(null)
  const [extractedCvName, setExtractedCvName] = useState(() => loadProfile()?.extractedFrom || null)
  const [justExtracted, setJustExtracted] = useState(false)
  const [newCvId, setNewCvId] = useState(null) // CV just uploaded — prompt extraction
  const fileRef = useRef()

  async function handleExtractProfile(cv) {
    setExtractingId(cv.id)
    try {
      const res = await fetch('/api/extract-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: cv.text })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur extraction')
      saveProfile({ ...data.profile, extractedFrom: cv.name })
      setExtractedCvName(cv.name)
      setJustExtracted(true)
      setNewCvId(null)
      setTimeout(() => setJustExtracted(false), 4000)
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
    setExtractingId(null)
  }

  const handleUpload = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setError('Veuillez sélectionner un fichier PDF')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Fichier trop lourd (max 5MB)')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, filename: file.name })
      })

      if (!res.ok) throw new Error('Erreur lors de la lecture du PDF')
      const data = await res.json()

      const entry = addCV({
        name: file.name.replace('.pdf', ''),
        text: data.text,
        pages: data.pages,
        size: file.size,
      })
      setNewCvId(entry?.id || 'new')
    } catch (e) {
      setError(e.message)
    }
    setUploading(false)
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  if (generatorState) {
    return (
      <CVGenerator
        cv={generatorState.cv}
        job={generatorState.job}
        onBack={() => setGeneratorState(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <span className="text-base">📄</span>
          <h3 className="text-sm font-semibold text-gray-800">Mes CVs</h3>
          <span className="text-xs text-gray-400 ml-auto">{cvs.length} CV{cvs.length > 1 ? 's' : ''} stocké{cvs.length > 1 ? 's' : ''}</span>
        </div>

        <div className="p-4">
          <div
            onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files[0]) }}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <p className="text-sm text-indigo-600 font-medium">Lecture du PDF en cours...</p>
              </div>
            ) : (
              <>
                <div className="text-3xl mb-2">📎</div>
                <p className="text-sm font-medium text-gray-700">Glisser un CV PDF ici</p>
                <p className="text-xs text-gray-400 mt-1">ou cliquer pour sélectionner • Max 5MB</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleUpload(e.target.files[0])} />
          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2 mt-2">{error}</p>}

          {/* Post-upload extraction prompt */}
          {newCvId && cvs.length > 0 && (() => {
            const cv = cvs.find(c => c.id === newCvId) || cvs[0]
            return (
              <div className="mt-3 flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl px-4 py-3">
                <span className="text-xl">✨</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-indigo-800">CV uploadé !</p>
                  <p className="text-xs text-indigo-600 mt-0.5">Extraire ton profil automatiquement pour améliorer STAR, emails et autofill ?</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setNewCvId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-white transition-colors">Plus tard</button>
                  <button
                    onClick={() => handleExtractProfile(cv)}
                    disabled={extractingId === cv.id}
                    className="text-xs font-semibold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {extractingId === cv.id ? <><span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" /> Extraction…</> : '✦ Extraire le profil'}
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Success feedback */}
          {justExtracted && (
            <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <span className="text-green-600">✓</span>
              <p className="text-sm text-green-700 font-medium">Profil extrait depuis <strong>{extractedCvName}</strong> — visible dans <strong>Réglages → Profil candidat</strong></p>
            </div>
          )}
        </div>

        {/* CV list */}
        {cvs.length > 0 && (
          <div className="divide-y divide-gray-50 border-t border-gray-100">
            {cvs.map(cv => (
              <div key={cv.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 group">
                <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">📄</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{cv.name}</p>
                  <p className="text-xs text-gray-400">{cv.pages} page{cv.pages > 1 ? 's' : ''} · {formatSize(cv.size)} · {new Date(cv.createdAt).toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleExtractProfile(cv)}
                    disabled={!!extractingId}
                    className="text-xs font-medium text-indigo-600 hover:text-white hover:bg-indigo-500 border border-indigo-200 hover:border-indigo-500 px-2.5 py-1 rounded-lg transition-all disabled:opacity-40 flex items-center gap-1 whitespace-nowrap"
                    title="Extraire le profil depuis ce CV"
                  >
                    {extractingId === cv.id
                      ? <><span className="w-2.5 h-2.5 border border-indigo-400 border-t-indigo-600 rounded-full animate-spin" /> Extraction…</>
                      : '✦ Profil'}
                  </button>
                  <button
                    onClick={() => deleteCV(cv.id)}
                    className="text-xs text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                    title="Supprimer"
                  >🗑️</button>
                </div>
                {extractedCvName === cv.name && !justExtracted && (
                  <span className="text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full ml-1 shrink-0">profil ✓</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate CV for a job */}
      {/* Auto-open for preselected job */}
      {preselectedJob && preselectedJob.status === 'todo' && cvs.length > 0 && !generatorState && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-800">✨ Générer un CV pour {preselectedJob.company}</p>
            <p className="text-xs text-indigo-600 mt-0.5">{preselectedJob.position}</p>
          </div>
          <div className="flex gap-2">
            {cvs.map(cv => (
              <button key={cv.id} onClick={() => setGeneratorState({ cv, job: preselectedJob })}
                className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 whitespace-nowrap">
                {cvs.length > 1 ? cv.name.slice(0,12)+'…' : '🚀 Générer maintenant'}
              </button>
            ))}
          </div>
        </div>
      )}

      {cvs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="text-base">✨</span>
            <h3 className="text-sm font-semibold text-gray-800">Générer un CV adapté</h3>
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-500 mb-3">Sélectionne un CV et une candidature pour générer une version optimisée :</p>
            <div className="space-y-3">
              {jobs.filter(j => j.status === 'todo' && (j.url || j.notes)).slice(0, 10).map(job => (
                <div key={job.id} className="flex items-center justify-between gap-3 p-3 border border-gray-100 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{job.company}</p>
                    <p className="text-xs text-gray-500 truncate">{job.position}</p>
                    {job.url && <p className="text-xs text-indigo-400 truncate">{job.url}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {cvs.map(cv => (
                      <button
                        key={cv.id}
                        onClick={() => setGeneratorState({ cv, job })}
                        className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
                        title={`Générer avec "${cv.name}"`}
                      >
                        {cvs.length > 1 ? cv.name.slice(0, 10) + '…' : '✨ Générer'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {cvs.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <div className="text-3xl mb-2">📎</div>
          {preselectedJob ? (
            <>
              <p className="text-sm font-medium text-gray-600">Uploadez un CV pour générer une version adaptée à</p>
              <p className="text-sm font-semibold text-indigo-600 mt-1">{preselectedJob.company} — {preselectedJob.position}</p>
            </>
          ) : (
            <p className="text-sm">Uploadez un CV PDF pour commencer</p>
          )}
        </div>
      )}
    </div>
  )
}
