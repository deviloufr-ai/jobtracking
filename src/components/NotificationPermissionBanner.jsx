import { useNotificationPermission } from '../hooks/useNotificationPermission'

export default function NotificationPermissionBanner() {
  const { shouldShowBanner, requestPermission, dismissBanner } = useNotificationPermission()

  if (!shouldShowBanner) return null

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 right-4 z-40 md:max-w-md md:left-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4">
        <p className="text-sm font-medium text-gray-900 mb-3">
          🔔 Activez les notifications
        </p>
        <p className="text-xs text-gray-600 mb-4">
          Ne manquez plus jamais une relance ou un entretien important
        </p>
        <div className="flex gap-2">
          <button
            onClick={requestPermission}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
          >
            Activer
          </button>
          <button
            onClick={dismissBanner}
            className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium py-2 px-3 rounded-lg transition-colors"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  )
}
