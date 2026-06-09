/**
 * StepSidebar - Right sidebar showing timeline summary and step metadata
 * Displays: mini timeline, duration, source, next action
 */
export default function StepSidebar({ job, history = [], selectedStepIndex = null }) {
  if (!history || history.length === 0) return null

  const selectedStep = selectedStepIndex !== null ? history[selectedStepIndex] : null
  const jobDate = new Date(job.date)

  // Calculate days since job posting
  const getDaysSince = (date) => {
    const d = new Date(date)
    const days = Math.floor((new Date() - d) / (1000 * 60 * 60 * 24))
    return days === 0 ? 'Aujourd\'hui' : days === 1 ? 'Hier' : `J+${days}`
  }

  // Get source icon
  const getSourceIcon = (source) => {
    switch (source) {
      case 'email': return '📧'
      case 'calendar': return '📅'
      case 'manual': return '✍️'
      default: return '📝'
    }
  }

  // Get source label
  const getSourceLabel = (source) => {
    switch (source) {
      case 'email': return 'Email'
      case 'calendar': return 'Calendar'
      case 'manual': return 'Ajouté manuellement'
      default: return 'Note'
    }
  }

  return (
    <div className="bg-gradient-to-b from-gray-50 to-white rounded-lg border border-gray-200 p-4">
      {/* Mini timeline */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-gray-600 uppercase mb-3 tracking-wide">Progression</h4>
        <div className="flex flex-col gap-2">
          {[...history].reverse().map((step, idx) => {
            const isSelected = selectedStep && step.date === selectedStep.date && step.status === selectedStep.status
            const st = { dot: 'bg-gray-300' } // placeholder
            return (
              <div
                key={idx}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                  isSelected ? 'bg-indigo-100' : 'hover:bg-gray-100'
                }`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-indigo-600' : 'bg-gray-300'}`} />
                <span className={`text-[11px] truncate ${isSelected ? 'font-semibold text-indigo-700' : 'text-gray-600'}`}>
                  {step.status === 'todo' ? '📋 À faire' :
                   step.status === 'sent' ? '📤 Envoyée' :
                   step.status === 'reviewing' ? '👀 En examen' :
                   step.status === 'interview' ? '🎯 Entretien' :
                   step.status === 'waiting' ? '⏳ En attente' :
                   step.status === 'offer' ? '🎉 Offre' :
                   step.status === 'rejected' ? '❌ Refusée' : step.status}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Metadata if step selected */}
      {selectedStep && (
        <>
          <div className="border-t border-gray-200 pt-4">
            {/* Date info */}
            <div className="mb-4">
              <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Date</div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-700">{new Date(selectedStep.date).toLocaleDateString('fr-FR', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}</span>
                <span className="text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                  {getDaysSince(selectedStep.date)}
                </span>
              </div>
            </div>

            {/* Source */}
            <div className="mb-4">
              <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Source</div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{getSourceIcon(selectedStep.source)}</span>
                <span className="text-xs text-gray-700">{getSourceLabel(selectedStep.source)}</span>
              </div>
            </div>

            {/* Duration since last step */}
            {selectedStepIndex > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Délai depuis étape précédente</div>
                {(() => {
                  const prev = history[selectedStepIndex - 1]
                  const curr = selectedStep
                  const days = Math.floor((new Date(curr.date) - new Date(prev.date)) / (1000 * 60 * 60 * 24))
                  return (
                    <span className="text-xs text-gray-700 font-medium">
                      {days === 0 ? 'Même jour' : days === 1 ? '1 jour' : `${days} jours`}
                    </span>
                  )
                })()}
              </div>
            )}

            {/* Days since job posting */}
            <div className="mb-4">
              <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Depuis candidature</div>
              {(() => {
                const days = Math.floor((new Date(selectedStep.date) - jobDate) / (1000 * 60 * 60 * 24))
                return (
                  <span className="text-xs text-gray-700 font-medium">
                    {days === 0 ? 'Jour même' : days === 1 ? '1 jour après' : `${days} jours après`}
                  </span>
                )
              })()}
            </div>

            {/* Quick actions */}
            <div className="pt-3 border-t border-gray-200">
              <button className="w-full text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 py-2 rounded-md transition-colors">
                ➕ Ajouter une note
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
