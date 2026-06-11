export function MigrationDialog({ status, progress, message, error }) {
  if (status === 'idle' || status === 'success') {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        {/* Header */}
        <h2 className="text-xl font-bold text-gray-900 mb-6">Syncing your data</h2>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-2">{Math.round(progress)}%</p>
        </div>

        {/* Message */}
        <div className="mb-6">
          {status === 'error' ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm font-medium">Migration failed</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
              <p className="text-red-600 text-xs mt-2">{message}</p>
            </div>
          ) : (
            <>
              <p className="text-gray-700 text-sm font-medium">{message}</p>
              <div className="flex items-center gap-2 mt-4">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <p className="text-gray-600 text-xs">Processing...</p>
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <p className="text-gray-600 text-xs text-center">
          {status === 'error'
            ? 'Please try again later or contact support.'
            : 'This may take a minute. Please do not close this window.'}
        </p>
      </div>
    </div>
  )
}
