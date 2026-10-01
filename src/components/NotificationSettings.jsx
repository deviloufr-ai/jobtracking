import { useState, useEffect } from 'react'
import { useNotificationPermission } from '../hooks/useNotificationPermission'
import { useLanguage } from '../hooks/useLanguage'
import {
  loadNotificationSettings,
  saveNotificationSettings,
  reEnableScenario,
  isScenarioAutoDisabled,
  getScenarioLabel,
} from '../services/notificationRules'
import { sendBrowserNotification } from '../hooks/useNotificationPermission'

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function NotificationSettings() {
  const { permission } = useNotificationPermission()
  const { t } = useLanguage()
  const [settings, setSettings] = useState(() => loadNotificationSettings())
  const [toast, setToast] = useState(null)

  const updateSetting = (key, value) => {
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    saveNotificationSettings(updated)

    // Re-enable scenario if it was auto-disabled
    if (value && isScenarioAutoDisabled(key)) {
      reEnableScenario(key)
    }
  }

  const handleTestNotification = () => {
    if (permission !== 'granted') {
      setToast(t('notifSettings.notEnabled'))
      setTimeout(() => setToast(null), 2000)
      return
    }

    sendBrowserNotification(t('notifSettings.testTitle'), {
      body: t('notifSettings.testBody'),
      tag: 'test-notification',
    })
    setToast(t('notifSettings.testSent'))
    setTimeout(() => setToast(null), 2000)
  }

  const handleDisableAll = () => {
    if (!window.confirm(t('notifSettings.disableAllConfirm'))) {
      return
    }
    const allOff = Object.keys(settings).reduce((acc, key) => {
      acc[key] = false
      return acc
    }, {})
    setSettings(allOff)
    saveNotificationSettings(allOff)
    setToast(t('notifSettings.allDisabled'))
    setTimeout(() => setToast(null), 2000)
  }

  const handleReEnable = (scenarioId) => {
    reEnableScenario(scenarioId)
    // Force a re-render by updating local state
    setSettings(prev => ({ ...prev }))
  }

  const scenariosList = [
    'n01_no_response_14d', 'n02_interview_24h', 'n03_offer_received', 'n04_rejection',
    'n05_reviewing_7d', 'n07_auto_archived', 'n08_deadline_reminder',
  ].map(key => ({ key, label: t(`notifSettings.scenarioLabels.${key}`) }))

  const permissionStatus =
    permission === 'granted' ? t('notifSettings.enabled') :
    permission === 'denied' ? t('notifSettings.denied') :
    t('notifSettings.pending')

  const isAutoDisabledCount = scenariosList.filter(s => isScenarioAutoDisabled(s.key)).length

  return (
    <div className="space-y-6">
      {/* Permission Status */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">{t('notifSettings.browserTitle')}</h3>
            <p className="text-sm text-gray-600">
              {t('notifSettings.status')} <span className={permission === 'granted' ? 'text-green-600' : permission === 'denied' ? 'text-red-600' : 'text-gray-600'}>{permissionStatus}</span>
            </p>
            {permission === 'denied' && (
              <p className="text-xs text-red-600 mt-2">
                {t('notifSettings.deniedHint')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Test Notification Button */}
      {permission === 'granted' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <button
            onClick={handleTestNotification}
            className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {t('notifSettings.test')}
          </button>
        </div>
      )}

      {/* Scenarios */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <h3 className="font-semibold text-gray-900">{t('notifSettings.scenarios')}</h3>
          {isAutoDisabledCount > 0 && (
            <p className="text-xs text-red-600 mt-1">
              {t('notifSettings.autoDisabled').replace('{n}', isAutoDisabledCount)}
            </p>
          )}
        </div>
        <div className="px-6 py-4 space-y-3">
          {scenariosList.map(scenario => {
            const isDisabled = isScenarioAutoDisabled(scenario.key)
            return (
              <div key={scenario.key} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium text-gray-800 cursor-pointer mb-0.5">
                    {scenario.label}
                  </label>
                  {isDisabled && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-red-600">{t('notifSettings.disabledAfterIgnores')}</span>
                      <button
                        onClick={() => handleReEnable(scenario.key)}
                        className="text-xs text-indigo-600 hover:underline ml-1"
                      >
                        {t('notifSettings.reEnable')}
                      </button>
                    </div>
                  )}
                </div>
                <Toggle
                  checked={settings[scenario.key] && !isDisabled}
                  onChange={(value) => updateSetting(scenario.key, value)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Disable All */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <button
          onClick={handleDisableAll}
          className="w-full px-4 py-2.5 border border-red-200 hover:bg-red-50 text-red-600 text-sm font-medium rounded-lg transition-colors"
        >
          {t('notifSettings.disableAll')}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
