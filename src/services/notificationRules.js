const NOTIFICATION_LOG_KEY = 'jobtrackr_notif_log'
const NOTIFICATION_IGNORE_KEY = 'jobtrackr_notif_ignore'
const NOTIFICATION_SETTINGS_KEY = 'jobtrackr_notif_settings'

// Default settings for each scenario
const DEFAULT_SCENARIO_SETTINGS = {
  n01_no_response_14d: true,    // Relance sans réponse
  n02_interview_24h: true,      // Entretien dans 24h
  n03_offer_received: true,     // Offre reçue
  n04_rejection: true,          // Refus reçu
  n05_reviewing_7d: true,       // Profil en examen > 7j
  n07_auto_archived: true,      // Auto-archivé après 60j
  n08_deadline_reminder: true,  // Rappel deadline
}

function loadNotificationLog() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveNotificationLog(log) {
  try {
    localStorage.setItem(NOTIFICATION_LOG_KEY, JSON.stringify(log))
  } catch {}
}

function loadIgnoreCount() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_IGNORE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveIgnoreCount(ignores) {
  try {
    localStorage.setItem(NOTIFICATION_IGNORE_KEY, JSON.stringify(ignores))
  } catch {}
}

export function loadNotificationSettings() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_SETTINGS_KEY)
    return raw ? JSON.parse(raw) : DEFAULT_SCENARIO_SETTINGS
  } catch {
    return DEFAULT_SCENARIO_SETTINGS
  }
}

export function saveNotificationSettings(settings) {
  try {
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}

// Check if a scenario is currently disabled due to 3 consecutive ignores
export function isScenarioAutoDisabled(scenarioId) {
  const ignores = loadIgnoreCount()
  return (ignores[scenarioId] || 0) >= 3
}

export function recordNotificationIgnore(scenarioId) {
  const ignores = loadIgnoreCount()
  ignores[scenarioId] = (ignores[scenarioId] || 0) + 1
  saveIgnoreCount(ignores)
}

export function reEnableScenario(scenarioId) {
  const ignores = loadIgnoreCount()
  delete ignores[scenarioId]
  saveIgnoreCount(ignores)
}

export function recordNotificationSent(scenario, jobId, metadata = {}) {
  const log = loadNotificationLog()
  const entry = {
    id: crypto.randomUUID(),
    scenario,
    jobId,
    timestamp: Date.now(),
    metadata,
  }
  const updated = [entry, ...log].slice(0, 1000)
  saveNotificationLog(updated)
}

// Anti-spam rules:
// - Max 1 per job per day
// - Max 3 per day total
// - Only 8am-20pm local time
// - N01 sent once per job maximum
// - Status change after trigger cancels notification
export function canSendNotification(scenario, jobId, jobData = {}) {
  const log = loadNotificationLog()
  const now = Date.now()
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime()

  // Rule 1: Max 1 per job per day
  const todayForThisJob = log.filter(
    e => e.jobId === jobId && e.timestamp >= todayStart && e.timestamp <= now
  )
  if (todayForThisJob.length > 0) {
    return { allowed: false, reason: 'max_1_per_job_per_day' }
  }

  // Rule 2: Max 3 per day total
  const todayTotal = log.filter(e => e.timestamp >= todayStart && e.timestamp <= now)
  if (todayTotal.length >= 3) {
    return { allowed: false, reason: 'max_3_per_day' }
  }

  // Rule 3: N01 sent only once per job (ever)
  if (scenario === 'n01_no_response_14d') {
    const n01Sent = log.filter(
      e => e.scenario === 'n01_no_response_14d' && e.jobId === jobId
    )
    if (n01Sent.length > 0) {
      return { allowed: false, reason: 'n01_already_sent' }
    }
  }

  // Rule 4: Auto-disabled after 3 consecutive ignores
  if (isScenarioAutoDisabled(scenario)) {
    return { allowed: false, reason: 'auto_disabled_ignores' }
  }

  return { allowed: true }
}

export function getNotificationStats() {
  const log = loadNotificationLog()
  const now = Date.now()
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
  const today = log.filter(e => e.timestamp >= todayStart && e.timestamp <= now)

  const byScenario = today.reduce((acc, e) => {
    acc[e.scenario] = (acc[e.scenario] || []).concat(e)
    return acc
  }, {})

  return {
    todayCount: today.length,
    totalCount: log.length,
    byScenario,
  }
}

// Detect if scenario conditions are still met (status change cancels notification)
export function isScenarioStillTriggered(scenario, jobData) {
  const { status, history = [], date, notes = '' } = jobData

  switch (scenario) {
    case 'n01_no_response_14d': {
      // Still triggered if status is still in "sent/reviewing/waiting"
      // and no response received yet
      return ['sent', 'reviewing', 'waiting'].includes(status)
    }
    case 'n02_interview_24h': {
      // Still triggered if status is "interview"
      return status === 'interview'
    }
    case 'n03_offer_received': {
      // Still triggered if status is "offer"
      return status === 'offer'
    }
    case 'n04_rejection': {
      // Still triggered if status is rejected
      return ['rejected', 'rejected_ats'].includes(status)
    }
    case 'n05_reviewing_7d': {
      // Still triggered if status is "reviewing"
      return status === 'reviewing'
    }
    case 'n07_auto_archived': {
      // Not user-triggered, system event
      return false
    }
    case 'n08_deadline_reminder': {
      // Check if deadline still exists in notes
      return notes.includes('deadline') || notes.includes('Deadline') || notes.includes('test')
    }
    default:
      return false
  }
}

export function getScenarioLabel(scenario) {
  const labels = {
    n01_no_response_14d: 'Relance sans réponse (J+14)',
    n02_interview_24h: 'Entretien dans 24h',
    n03_offer_received: 'Offre reçue',
    n04_rejection: 'Refus reçu',
    n05_reviewing_7d: 'Profil en examen > 7j',
    n07_auto_archived: 'Candidature auto-archivée',
    n08_deadline_reminder: 'Rappel deadline',
  }
  return labels[scenario] || scenario
}
