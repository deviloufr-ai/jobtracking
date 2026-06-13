export default function ConfirmDelete({ job, onConfirm, onCancel, t = (key) => key }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
        <div className="text-center">
          <div className="text-3xl mb-3">🗑️</div>
          <h3 className="text-base font-semibold text-gray-800 mb-2">{t('confirmDelete.title')}</h3>
          <p className="text-sm text-gray-500 mb-1">
            <span className="font-medium text-gray-700">{job.position}</span> chez <span className="font-medium text-gray-700">{job.company}</span>
          </p>
          <p className="text-xs text-red-500 mb-6">{t('confirmDelete.warning')}</p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
            >
              {t('confirmDelete.cancel')}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              {t('confirmDelete.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
