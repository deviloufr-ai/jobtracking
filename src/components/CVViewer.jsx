import { useState, useEffect, useRef } from 'react'
import { renderCV, TEMPLATES } from './CVGenerator'
import { useDragDock } from '../hooks/useDragDock'

// View a saved (adapted) CV — and, when onUpdate is provided, edit it in place:
// switch the design/template live and tweak the Markdown content, then persist
// back to the candidature (job.cvSaved) with NO AI call. Used both inline inside
// the candidature CV tab and as a full-screen modal.
export default function CVViewer({ job, onClose, inline = false, onUpdate = null, t = (key) => key }) {
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 896 })
  const saved = job?.cvSaved
  const [md, setMd] = useState(saved?.markdown || '')
  const [tpl, setTpl] = useState(saved?.template || 'standard')
  const [editing, setEditing] = useState(false)
  const [showTplMenu, setShowTplMenu] = useState(false)
  const [flash, setFlash] = useState(false) // brief "Saved" confirmation
  const profilePic = useRef((() => { try { return localStorage.getItem('cv_profile_picture') || null } catch { return null } })()).current

  // Re-sync local state when the underlying CV changes (switching jobs, or a
  // remote sync replaces cvSaved). Keyed on identity that changes on real edits.
  useEffect(() => {
    setMd(saved?.markdown || '')
    setTpl(saved?.template || 'standard')
    setEditing(false)
    setShowTplMenu(false)
  }, [job?.id, saved?.savedAt])

  if (!saved) return null

  const filename = saved.filename || 'CV'
  const canEdit = typeof onUpdate === 'function'
  const dirty = md !== (saved.markdown || '') || tpl !== (saved.template || 'standard')
  const currentTpl = TEMPLATES.find(x => x.id === tpl) || TEMPLATES[0]
  const html = renderCV(md, tpl, profilePic)

  const persist = () => {
    if (!canEdit || !dirty) return
    onUpdate(job.id, {
      cvSaved: { ...saved, markdown: md, template: tpl, savedAt: new Date().toISOString() },
    })
    setFlash(true)
    setTimeout(() => setFlash(false), 2500)
  }

  const handleDownloadPDF = async () => {
    try {
      const { default: html2pdf } = await import('html2pdf.js')
      const element = document.createElement('div')
      element.innerHTML = html
      element.style.padding = '0'
      element.style.margin = '0'
      element.style.fontFamily = 'Arial, Helvetica, sans-serif'
      element.style.lineHeight = '1.2'
      element.style.color = '#000'
      element.style.backgroundColor = '#fff'
      element.style.width = '210mm'
      element.style.boxSizing = 'border-box'
      element.style.wordWrap = 'break-word'
      element.style.overflowWrap = 'break-word'

      const opt = {
        margin: [12, 0, 14, 0],
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
          compress: true,
          hotfixes: ['px_scaling'],
        },
        pagebreak: {
          mode: ['css', 'legacy'],
          avoid: '.cv-block',
        },
      }

      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('PDF download error:', err)
    }
  }

  // ── Toolbar (design picker + edit toggle + save + download) ─────────────────
  const toolbar = (
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      <span className="text-sm font-semibold text-gray-700 truncate min-w-0 mr-auto">📄 {filename}</span>

      {/* Design / template picker — switching applies to the preview live */}
      <div className="relative">
        <button
          onClick={() => setShowTplMenu(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          title={t('cvViewer.design')}
        >
          <span>{currentTpl.icon}</span>
          <span className="hidden sm:inline">{currentTpl.label}</span>
          <span className="text-gray-300 text-[10px]">▾</span>
        </button>
        {showTplMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowTplMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 w-52">
              {TEMPLATES.map(x => (
                <button
                  key={x.id}
                  onClick={() => { setTpl(x.id); setShowTplMenu(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${tpl === x.id ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                >
                  <span className="text-lg">{x.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${tpl === x.id ? 'text-indigo-700' : 'text-gray-700'}`}>{x.label}</p>
                    <p className="text-[10px] text-gray-400 truncate">{x.desc}</p>
                  </div>
                  {tpl === x.id && <span className="ml-auto text-indigo-500 text-xs">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Edit / preview toggle — only when the caller can persist edits */}
      {canEdit && (
        <button
          onClick={() => setEditing(v => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${editing ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          {editing ? '👁 ' + t('cvViewer.preview') : '✎ ' + t('cvViewer.edit')}
        </button>
      )}

      {/* Save — appears once the content or design has changed */}
      {canEdit && (dirty || flash) && (
        <button
          onClick={persist}
          disabled={!dirty}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${flash && !dirty ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
        >
          {flash && !dirty ? '✓ ' + t('cvViewer.saved') : '💾 ' + t('cvViewer.save')}
        </button>
      )}

      <button
        onClick={handleDownloadPDF}
        className="text-xs font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
      >
        📥 {t('cvViewer.download')}
      </button>
    </div>
  )

  // ── Content (live preview, or split editor when editing) ────────────────────
  const preview = (
    <div className="cv-paper rounded-lg shadow-sm p-4 sm:p-8 max-w-2xl mx-auto bg-white"
      dangerouslySetInnerHTML={{ __html: html }} />
  )

  const editor = (
    <div className="flex flex-col lg:flex-row gap-3 h-full">
      <div className="lg:w-1/2 flex flex-col min-h-[280px]">
        <p className="text-[11px] text-gray-400 mb-1.5">{t('cvViewer.editHint')}</p>
        <textarea
          value={md}
          onChange={e => setMd(e.target.value)}
          className="flex-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none min-h-[280px]"
        />
      </div>
      <div className="lg:w-1/2 overflow-y-auto bg-gray-50 rounded-xl p-4">
        {preview}
      </div>
    </div>
  )

  // Inline mode — render directly inside the candidature CV tab container
  if (inline) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-200 flex-shrink-0 bg-white">
          {toolbar}
        </div>
        <div className="flex-1 overflow-auto bg-gray-50 p-4 sm:p-6">
          {editing ? editor : preview}
        </div>
      </div>
    )
  }

  // Modal mode — full-screen overlay
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-2 sm:p-4">
      {snapPreview}
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[94vh] sm:max-h-[90vh] flex flex-col" style={panelStyle}>
        <div onPointerDown={startDrag} className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b border-gray-200 flex-shrink-0 cursor-move select-none">
          <div className="flex-1 min-w-0">{toolbar}</div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1 flex-shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-gray-50 p-3 sm:p-6">
          {editing ? editor : preview}
        </div>
      </div>
    </div>
  )
}
