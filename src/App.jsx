import { useState, useMemo } from 'react'
import { useJobs } from './hooks/useJobs'
import { useExtensionImport } from './hooks/useExtensionImport'
import Stats from './components/Stats'
import Filters from './components/Filters'
import JobRow from './components/JobRow'
import JobModal from './components/JobModal'
import ConfirmDelete from './components/ConfirmDelete'
import GmailImport from './components/GmailImport'
import NextAction from './components/NextAction'
import JobSearch from './components/JobSearch'
import CVManager from './components/CVManager'
import ImageImport from './components/ImageImport'

const DEFAULT_FILTERS = { search: '', statuses: [], period: 'all' }
const DEFAULT_SORT = { col: 'date', dir: 'desc' }

function sortJobs(jobs, sort) {
  const sorted = [...jobs]
  const { col, dir } = sort
  sorted.sort((a, b) => {
    let va, vb
    if (col === 'date')    { va = new Date(a.date); vb = new Date(b.date) }
    if (col === 'company') { va = a.company.toLowerCase(); vb = b.company.toLowerCase() }
    if (col === 'status')  { va = a.status; vb = b.status }
    if (col === 'position'){ va = a.position.toLowerCase(); vb = b.position.toLowerCase() }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
  return sorted
}

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <span className="ml-1 text-gray-300 text-xs">↕</span>
  return <span className="ml-1 text-indigo-500 text-xs">{sort.dir === 'asc' ? '↑' : '↓'}</span>
}

export default function App() {
  const { jobs, addJob, updateJob, deleteJob, updateStatus, addHistoryEntry, mergeDuplicates } = useJobs()
  const [modal, setModal] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [toast, setToast] = useState(null)
  const [showGmail, setShowGmail] = useState(false)
  const [activeTab, setActiveTab] = useState('tracker')
  const [selectedJobForCV, setSelectedJobForCV] = useState(null) // 'tracker' | 'search' | 'cv'
  const [showImageImport, setShowImageImport] = useState(false)

  const showToast = (msg, duration = 2500) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }

  useExtensionImport(addJob, showToast)

  const handleSort = (col) => {
    setSort(prev => ({
      col,
      dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc'
    }))
  }

  const filtered = useMemo(() => {
    const list = jobs.filter(j => {
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!j.company.toLowerCase().includes(q) && !j.position.toLowerCase().includes(q)) return false
      }
      if (filters.statuses.length > 0 && !filters.statuses.includes(j.status)) return false
      if (filters.period !== 'all') {
        const d = new Date(j.date)
        const now = new Date()
        const days = (now - d) / (1000 * 60 * 60 * 24)
        if (filters.period === 'week' && days > 7) return false
        if (filters.period === 'month' && days > 30) return false
      }
      return true
    })
    return sortJobs(list, sort)
  }, [jobs, filters, sort])

  const handleSave = (form) => {
    if (modal === 'add') { addJob(form); showToast('Candidature ajoutee !') }
    else { updateJob(modal.id, form); showToast('Candidature mise a jour') }
  }

  const handleDelete = () => {
    deleteJob(toDelete.id)
    setToDelete(null)
    showToast('Candidature supprimee')
  }

  const handleGenerateCV = (job) => {
    setSelectedJobForCV(job)
    setActiveTab('cv')
  }

  const handleBulkImport = (newJobs) => {
    newJobs.forEach(j => addJob(j))
    showToast(`${newJobs.length} candidature${newJobs.length > 1 ? 's' : ''} importee${newJobs.length > 1 ? 's' : ''} !`, 3500)
  }

  const handleUpdateHistory = (id, history) => {
    updateJob(id, { history })
  }

  const handleClearAll = () => {
    if (!window.confirm(`Effacer toutes les ${jobs.length} candidatures ? Cette action est irreversible.`)) return
    jobs.forEach(j => deleteJob(j.id))
    showToast('Toutes les candidatures ont ete effacees')
  }

  const ThHeader = ({ col, label }) => (
    <th
      onClick={() => handleSort(col)}
      className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-indigo-600 select-none whitespace-nowrap"
    >
      {label}<SortIcon col={col} sort={sort} />
    </th>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">J</div>
            <div>
              <h1 className="font-bold text-gray-800 leading-tight">JobTrackr</h1>
              <p className="text-xs text-gray-400">Suivi de candidatures</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImageImport(true)}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-lg hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-all">
              <span>🖼️</span><span className="hidden sm:inline">Screenshot</span>
            </button>
            <button onClick={() => setShowGmail(true)}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.909 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
              </svg>
              <span className="hidden sm:inline">Gmail</span>
            </button>
            <button onClick={() => setModal('add')}
              className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm">
              <span className="text-lg leading-none">+</span>
              <span className="hidden sm:inline">Nouvelle candidature</span>
              <span className="sm:hidden">Ajouter</span>
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          <button
            onClick={() => setActiveTab('tracker')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'tracker'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📋 Mes candidatures
            {jobs.length > 0 && (
              <span className="ml-2 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">{jobs.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'search'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🔎 Recherche d'offres
          </button>
          <button
            onClick={() => setActiveTab('cv')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'cv'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📄 Mon CV
          </button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === 'cv' ? (
          <CVManager jobs={jobs} preselectedJob={selectedJobForCV} />
        ) : activeTab === 'search' ? (
          <JobSearch onAddJob={(job) => { addJob(job); showToast(`${job.company} ajouté !`); setActiveTab('tracker') }} existingJobs={jobs} />
        ) : (
          <>
        <Stats jobs={jobs} />
        <NextAction jobs={jobs} />
        <Filters filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)} total={jobs.length} filtered={filtered.length} />

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              {jobs.length === 0 ? (
                <>
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-gray-500 font-medium">Aucune candidature pour l instant</p>
                  <p className="text-gray-400 text-sm mt-1 mb-6">Ajoutez-en une manuellement, importez depuis Gmail ou via screenshot</p>
                  <div className="flex gap-3 justify-center flex-wrap">
                    <button onClick={() => setShowImageImport(true)} className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-purple-50 transition-colors">🖼️ Screenshot</button>
                    <button onClick={() => setShowGmail(true)} className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">📧 Gmail</button>
                    <button onClick={() => setModal('add')} className="bg-indigo-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-indigo-700 transition-colors">+ Ajouter manuellement</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="text-gray-500 font-medium">Aucune candidature trouvee</p>
                  <button onClick={() => setFilters(DEFAULT_FILTERS)} className="mt-3 text-sm text-indigo-600 hover:underline">Reinitialiser les filtres</button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <ThHeader col="company" label="Entreprise / Poste" />
                    <ThHeader col="status" label="Statut" />
                    <ThHeader col="date" label="Date" />
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Offre</th>
                    <th className="py-3 px-4 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(job => (
                    <JobRow key={job.id} job={job} onEdit={setModal} onDelete={setToDelete} onStatusChange={updateStatus} onAddStep={addHistoryEntry} onUpdateHistory={handleUpdateHistory} onGenerateCV={handleGenerateCV} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-gray-300">JobTrackr v0.4</p>
          {jobs.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={mergeDuplicates}
                className="text-xs text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200">
                🔀 Fusionner les doublons
              </button>
              <button onClick={handleClearAll}
                className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-200">
                🗑️ Effacer toutes les données
              </button>
            </div>
          )}
        </div>
          </>
        )}
      </main>

      {modal && <JobModal job={modal === 'add' ? null : modal} onSave={handleSave} onClose={() => setModal(null)} />}
      {toDelete && <ConfirmDelete job={toDelete} onConfirm={handleDelete} onCancel={() => setToDelete(null)} />}
      {showGmail && <GmailImport onImport={handleBulkImport} onClose={() => setShowGmail(false)} existingJobs={jobs} />}
      {showImageImport && <ImageImport onImport={handleBulkImport} onClose={() => setShowImageImport(false)} existingJobs={jobs} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
