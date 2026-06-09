/**
 * RowActions - Clean action buttons for job row header
 * Organized in logical groups with tooltips
 */
export default function RowActions({
  expanded = false,
  onAddStep,
  onSync,
  onUseCase,
  onEdit,
  onDelete,
  enriching = false,
  hasUseCase = false
}) {
  const actions = [
    // Timeline actions (only when expanded)
    ...(expanded ? [
      {
        id: 'add',
        icon: '➕',
        label: 'Ajouter une étape',
        onClick: onAddStep,
        color: 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50'
      },
      {
        id: 'sync',
        icon: '🔄',
        label: 'Synchroniser Gmail & Calendar',
        onClick: onSync,
        disabled: enriching,
        color: 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
      },
      {
        id: 'case',
        icon: '📋',
        label: 'Cas pratique',
        onClick: onUseCase,
        color: hasUseCase ? 'text-purple-600 hover:text-purple-700 hover:bg-purple-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      },
      { divider: true }
    ] : []),

    // Candidate actions
    {
      id: 'edit',
      icon: '✏️',
      label: 'Modifier la candidature',
      onClick: onEdit,
      color: 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'
    },
    {
      id: 'delete',
      icon: '🗑️',
      label: 'Supprimer',
      onClick: onDelete,
      color: 'text-gray-500 hover:text-red-600 hover:bg-red-50'
    }
  ]

  return (
    <div className="flex items-center gap-1">
      {actions.map((action) => {
        if (action.divider) {
          return <div key="divider" className="border-l border-gray-300 h-5 mx-0.5" />
        }

        return (
          <button
            key={action.id}
            onClick={(e) => {
              e.stopPropagation()
              action.onClick?.()
            }}
            disabled={action.disabled}
            className={`p-1.5 rounded-lg transition-colors ${action.color} ${action.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            title={action.label}
            aria-label={action.label}
          >
            {action.icon}
          </button>
        )
      })}
    </div>
  )
}
