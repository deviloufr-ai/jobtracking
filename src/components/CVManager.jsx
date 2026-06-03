import { useState, useRef } from 'react'
import { useCVs } from '../hooks/useCVs'
import CVGenerator from './CVGenerator'

export default function CVManager({ jobs, preselectedJob }) {
  const { cvs, addCV, deleteCV, renameCV } = useCVs()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [generatorState, setGeneratorState] = useState(null) // { cv, job }
  const fileRef = useRef()

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

      addCV({
        name: file.name.replace('.pdf', ''),
        text: data.text,
        pages: data.pages,
        size: file.size,
      })
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
                    onClick={() => deleteCV(cv.id)}
                    className="text-xs text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                    title="Supprimer"
                  >🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate CV for a job */}
      {/* Auto-open for preselected job */}
      {preselectedJob && cvs.length > 0 && !generatorState && (
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
              {jobs.filter(j => j.url || j.notes).slice(0, 10).map(job => (
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
