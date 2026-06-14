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

export default function CVManager({ jobs, preselectedJob, onUpdateJob, t = (key) => key }) {
  const { cvs, addCV, deleteCV, renameCV } = useCVs()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [generatorState, setGeneratorState] = useState(null)
  const [extractingId, setExtractingId] = useState(null)
  const [extractedCvName, setExtractedCvName] = useState(() => loadProfile()?.extractedFrom || null)
  const [justExtracted, setJustExtracted] = useState(false)
  const [newCvId, setNewCvId] = useState(null) // CV just uploaded — prompt extraction
  const [editingCvId, setEditingCvId] = useState(null)
  const [editingText, setEditingText] = useState('')
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
      if (!res.ok) throw new Error(data.error || t('cvManagerUI.errorExtraction'))
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

  function handleOpenEdit(cv) {
    setEditingCvId(cv.id)
    setEditingText(cv.text)
  }

  function handleSaveEdit() {
    if (!editingCvId) return
    const cv = cvs.find(c => c.id === editingCvId)
    if (!cv) return
    addCV({ ...cv, text: editingText })
    setEditingCvId(null)
    setEditingText('')
  }

  const handleUpload = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setError(t('cvManagerUI.selectPDFFile'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t('cvManagerUI.fileTooLarge'))
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

      if (!res.ok) throw new Error(t('cvManagerUI.errorReading'))
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
        onSaveCV={onUpdateJob}
        t={t}
      />
    )
  }

  if (editingCvId) {
    const editingCV = cvs.find(c => c.id === editingCvId)
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Éditer le contenu du CV</h3>
            <button onClick={() => setEditingCvId(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <p className="text-sm text-gray-600 mb-3">{editingCV?.name}</p>
            <textarea
              value={editingText}
              onChange={e => setEditingText(e.target.value)}
              className="w-full h-[400px] text-sm border border-gray-200 rounded-lg p-3 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-none"
            />
          </div>
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
            <button
              onClick={() => setEditingCvId(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSaveEdit}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              ✓ Enregistrer
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <span className="text-base">📄</span>
          <h3 className="text-sm font-semibold text-gray-800">{t('cvManagerUI.title')}</h3>
          <span className="text-xs text-gray-400 ml-auto">{cvs.length} CV{cvs.length > 1 ? 's' : ''} {t('cvManagerUI.storageInfo')}{cvs.length > 1 ? 's' : ''}</span>
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
                <p className="text-sm text-indigo-600 font-medium">{t('cvManagerUI.readingPDF')}</p>
              </div>
            ) : (
              <>
                <div className="text-3xl mb-2">📎</div>
                <p className="text-sm font-medium text-gray-700">{t('cvManagerUI.dragDropPDF')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('cvManagerUI.orClick')}</p>
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
                  <p className="text-sm font-semibold text-indigo-800">{t('cvManagerUI.cvUploaded')}</p>
                  <p className="text-xs text-indigo-600 mt-0.5">{t('cvManagerUI.extractProfileAuto')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setNewCvId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-white transition-colors">{t('cvManagerUI.later')}</button>
                  <button
                    onClick={() => handleExtractProfile(cv)}
                    disabled={extractingId === cv.id}
                    className="text-xs font-semibold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {extractingId === cv.id ? <><span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" /> {t('cvManagerUI.extracting')}</> : '✦ ' + t('cvManagerUI.extractProfile')}
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Success feedback */}
          {justExtracted && (
            <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <span className="text-green-600">✓</span>
              <p className="text-sm text-green-700 font-medium">{t('cvManagerUI.profileExtracted').replace('{name}', extractedCvName)}</p>
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
                    onClick={() => handleOpenEdit(cv)}
                    className="text-xs font-medium text-blue-600 hover:text-white hover:bg-blue-500 border border-blue-200 hover:border-blue-500 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap"
                    title="Éditer le contenu"
                  >
                    ✎ Éditer
                  </button>
                  <button
                    onClick={() => handleExtractProfile(cv)}
                    disabled={!!extractingId}
                    className="text-xs font-medium text-indigo-600 hover:text-white hover:bg-indigo-500 border border-indigo-200 hover:border-indigo-500 px-2.5 py-1 rounded-lg transition-all disabled:opacity-40 flex items-center gap-1 whitespace-nowrap"
                    title={t('cvManagerUI.extractProfile')}
                  >
                    {extractingId === cv.id
                      ? <><span className="w-2.5 h-2.5 border border-indigo-400 border-t-indigo-600 rounded-full animate-spin" /> {t('cvManagerUI.extracting')}</>
                      : '✦ ' + t('cvManagerUI.extractProfile')}
                  </button>
                  <button
                    onClick={() => deleteCV(cv.id)}
                    className="text-xs text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                    title={t('common.delete')}
                  >🗑️</button>
                </div>
                {extractedCvName === cv.name && !justExtracted && (
                  <span className="text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full ml-1 shrink-0">{t('cvManagerUI.profileCheckmark')}</span>
                )}
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
            <p className="text-sm font-semibold text-indigo-800">✨ {t('cvManagerUI.generateForJob').replace('{company}', preselectedJob.company)}</p>
            <p className="text-xs text-indigo-600 mt-0.5">{preselectedJob.position}</p>
          </div>
          <div className="flex gap-2">
            {cvs.map(cv => (
              <button key={cv.id} onClick={() => setGeneratorState({ cv, job: preselectedJob })}
                className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 whitespace-nowrap">
                {cvs.length > 1 ? cv.name.slice(0,12)+'…' : '🚀 ' + t('cvManager.generate')}
              </button>
            ))}
          </div>
        </div>
      )}

      {cvs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="text-base">✨</span>
            <h3 className="text-sm font-semibold text-gray-800">{t('cvManagerUI.generateAdapted')}</h3>
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-500 mb-3">{t('cvManagerUI.selectCVAndJob')}</p>
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
              <p className="text-sm font-medium text-gray-600">{t('cvManagerUI.uploadCVForJob').replace('{company}', preselectedJob.company).replace('{position}', preselectedJob.position)}</p>
            </>
          ) : (
            <p className="text-sm">{t('cvManagerUI.uploadCVStart')}</p>
          )}
        </div>
      )}
    </div>
  )
}
