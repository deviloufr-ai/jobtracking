import { useState, useMemo } from 'react'
import { useJobs } from './hooks/useJobs'
import Stats from './components/Stats'
import Filters from './components/Filters'
import JobRow from './components/JobRow'
import JobModal from './components/JobModal'
import ConfirmDelete from './components/ConfirmDelete'

const DEFAULT_FILTERS = { search: '', statuses: [], period: 'all' }

export default function App() {
  const { jobs, addJob, updateJob, deleteJob, updateStatus } = useJobs()
  const [modal, setModal] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [toast, setToast] = useState(null)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const filtered = useMemo(() => {
    return jobs.filter(j => {
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
  }, [jobs, filters])

  const handleSave = (form) => {
    if (modal === 'add') {
      addJob(form)
      showToast('Candidature ajoutée !')
    } else {
      updateJob(modal.id, form)
      showToast('Candidature mise à jour')
    }
  }

  const handleDelete = () => {
    deleteJob(toDelete.id)
    setToDelete(null)
    showToast('Candidature supprimée')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">J</div>
            <div>
              <h1 className="font-bold text-gray-800 leading-tight">JobTrackr</h1>
              <p className="text-xs text-gray-400">Suivi de candidatures</p>
            </div>
          </div>
          <button
            onClick={() => setModal('add')}
            className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
          >
            <span className="text-lg leading-none">+</span>
            Nouvelle candidature
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Stats jobs={jobs} />

        <Filters
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters(DEFAULT_FILTERS)}
          total={jobs.length}
          filtered={filtered.length}
        />

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              {jobs.length === 0 ? (
                <>
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-gray-500 font-medium">Aucune candidature pour l instant</p>
                  <p className="text-gray-400 text-sm mt-1">Commencez par en ajouter une !</p>
                  <button
                    onClick={() => setModal('add')}
                    className="mt-4 bg-indigo-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    + Ajouter ma première candidature
                  </button>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="text-gray-500 font-medium">Aucune candidature trouvée</p>
                  <p className="text-gray-400 text-sm mt-1">Essayez de modifier ou réinitialiser vos filtres</p>
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="mt-3 text-sm text-indigo-600 hover:underline"
                  >
                    Réinitialiser les filtres
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Entreprise / Poste</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Offre</th>
                    <th className="py-3 px-4 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(job => (
                    <JobRow
                      key={job.id}
                      job={job}
                      onEdit={setModal}
                      onDelete={setToDelete}
                      onStatusChange={updateStatus}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-300 mt-6">
          JobTrackr · Données stockées localement dans votre navigateur
        </p>
      </main>

      {modal && (
        <JobModal
          job={modal === 'add' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {toDelete && (
        <ConfirmDelete
          job={toDelete}
          onConfirm={handleDelete}
          onCancel={() => setToDelete(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
