// ── Mixpanel analytics ────────────────────────────────────────────────────────
// Single source of truth for product analytics. The rest of the app calls the
// typed `track*` helpers below; this module owns SDK init, user identity, the
// UTM/super-property registration and the little per-user "journey" store that
// lets us compute the time-to-value deltas (signup → Gmail connect → first
// application → first CV → first follow-up …) the growth funnel needs.
//
// Design rules (from the Mixpanel tracking-implementation guidance):
//   • snake_case event + property names, case-sensitive, never built dynamically.
//   • identify() with the DATABASE primary key (Supabase auth uid), NOT the email.
//   • identify on every login AND every app re-open; reset() on logout.
//   • track signup_completed AFTER identify().
//   • numbers are sent as real numbers (never quoted strings); datetimes as Date
//     objects so Mixpanel types them as dates.
//   • omit a property entirely when it isn't applicable — never send null / "".
//
// Instrumentation must never break the product: every public call is wrapped so a
// Mixpanel/network failure can only no-op, never throw into business logic.
import mixpanel from 'mixpanel-browser'

// Project token — the SmartJobTracker Mixpanel project (see task brief). Safe to
// ship client-side: it is a write-only ingestion token, not a secret.
const MIXPANEL_TOKEN = '7002d187b7e1578a7c567468461b9c9b'

// No-op under vitest (jsdom) so unit tests that import the jobs/gmail/CV modules
// don't fire real network requests or need a Mixpanel stub.
const DISABLED =
  import.meta.env.MODE === 'test' ||
  !!import.meta.env.VITEST ||
  typeof window === 'undefined'

// Mirrors the server default SHARED_KEY_TRIAL_LIMIT (see CLAUDE.md). Used to
// estimate ai_actions_remaining_after for users on the shared free quota; the
// authoritative count lives server-side (Supabase shared_key_usage), so this is a
// best-effort client-side signal that resets per browser.
const FREE_TRIAL_LIMIT = 15

const JOURNEY_KEY = 'jobtrackr_mp_journey'
const UTM_KEY = 'jobtrackr_mp_utm'

let initialized = false

// ── init ──────────────────────────────────────────────────────────────────────
// Idempotent. Called once on app boot (main.jsx) but every public helper also
// calls ensureInit() so an auth event that lands before boot finishes still works.
export function initAnalytics() {
  ensureInit()
}

function ensureInit() {
  if (initialized || DISABLED) return initialized
  try {
    mixpanel.init(MIXPANEL_TOKEN, {
      // Explicit, curated events only. Autocapture is left OFF on purpose: this is
      // a privacy-sensitive app (emails, CVs, recruiter names) and autocapture can
      // scrape input/text content. With autocapture off we also must NOT send
      // page-view events, hence track_pageview:false.
      autocapture: false,
      track_pageview: false,
      persistence: 'localStorage',
      batch_requests: true,
      // Respect Do Not Track.
      ignore_dnt: false,
    })
    initialized = true
    registerBaseSuperProps()
    // The npm module build (init_as_module) does NOT attach to window, unlike the
    // CDN snippet. Expose the initialized instance so the integration can be
    // verified/debugged from the console — e.g. `mixpanel.track('debug')` to
    // confirm ingestion, or `mixpanel.get_distinct_id()` to check identity.
    try { if (typeof window !== 'undefined') window.mixpanel = mixpanel } catch { /* ignore */ }
  } catch (err) {
    // Swallow — analytics must never take the app down.
    console.warn('Mixpanel init failed:', err?.message)
  }
  return initialized
}

// Register properties attached to EVERY event: the acquisition source (captured
// from the first URL that carried utm parameters) and the runtime platform.
function registerBaseSuperProps() {
  try {
    const utm = captureUtmSource()
    const superProps = { app_platform: detectPlatform() }
    if (utm) superProps.utm_source = utm
    mixpanel.register(superProps)
  } catch { /* ignore */ }
}

function detectPlatform() {
  try {
    return window.Capacitor?.isNativePlatform?.() ? 'native' : 'web'
  } catch { return 'web' }
}

// Capture utm_source once (the first landing that has it wins) and persist it so
// it survives the OAuth round-trip and later sessions.
function captureUtmSource() {
  try {
    const stored = localStorage.getItem(UTM_KEY)
    if (stored) return stored
    const params = new URLSearchParams(window.location.search || '')
    const src = params.get('utm_source')
    if (src) {
      localStorage.setItem(UTM_KEY, src)
      return src
    }
  } catch { /* ignore */ }
  return null
}

export function getUtmSource() {
  try { return localStorage.getItem(UTM_KEY) || undefined } catch { return undefined }
}

// ── low-level helpers ──────────────────────────────────────────────────────────
// Build the props object, drop anything undefined/null/'' (Mixpanel guidance:
// omit inapplicable props rather than sending empties), then track.
function track(eventName, props = {}) {
  if (!ensureInit()) return
  try {
    const clean = {}
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === '') continue
      clean[k] = v
    }
    mixpanel.track(eventName, clean)
  } catch (err) {
    console.warn(`Mixpanel track(${eventName}) failed:`, err?.message)
  }
}

// Coerce an ISO string / epoch / Date into a Date so Mixpanel types it as a
// datetime property.
function toDate(v) {
  if (v instanceof Date) return v
  if (v == null) return new Date()
  const d = new Date(v)
  return isNaN(d.getTime()) ? new Date() : d
}

// Whole seconds between a stored ISO timestamp and now (never negative). Returns
// undefined when the origin is missing so the caller omits the property.
function secondsSince(iso, now = Date.now()) {
  if (!iso) return undefined
  const start = Date.parse(iso)
  if (isNaN(start)) return undefined
  return Math.max(0, Math.round((now - start) / 1000))
}

function daysSince(iso, now = Date.now()) {
  if (!iso) return undefined
  const start = Date.parse(iso)
  if (isNaN(start)) return undefined
  return Math.max(0, Math.round(((now - start) / 86400000) * 100) / 100)
}

// ── journey store (per-user funnel timeline, localStorage) ─────────────────────
// Holds the timestamps + counters needed to compute time-to-value deltas. Keyed
// by uid: identifying a different account starts a fresh journey so one device's
// deltas never bleed into another user's.
function readJourney() {
  try {
    const raw = localStorage.getItem(JOURNEY_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function writeJourney(j) {
  try { localStorage.setItem(JOURNEY_KEY, JSON.stringify(j)) } catch { /* ignore */ }
}

// Merge fields into the journey and persist. Returns the updated object.
function patchJourney(patch) {
  const j = { ...readJourney(), ...patch }
  writeJourney(j)
  return j
}

// ── identity ───────────────────────────────────────────────────────────────────
// Called from supabase.js on every auth state change. Identifies the user and,
// for a brand-new account, fires signup_completed exactly once (per browser).
export function onAuthChange(event, session) {
  if (DISABLED) return
  const user = session?.user
  if (event === 'SIGNED_OUT' || !user) {
    if (event === 'SIGNED_OUT') resetAnalytics()
    return
  }
  identifyUser(user)
}

export function identifyUser(user) {
  if (!user?.id || !ensureInit()) return
  try {
    mixpanel.identify(user.id)

    const email = user.email || user.user_metadata?.email || ''
    mixpanel.people?.set?.({
      ...(email ? { $email: email } : {}),
      ...(user.user_metadata?.full_name ? { $name: user.user_metadata.full_name } : {}),
    })

    let journey = readJourney()
    // New account on this browser → start a fresh funnel timeline.
    if (journey.uid !== user.id) {
      journey = { uid: user.id, signupAt: user.created_at || new Date().toISOString() }
      writeJourney(journey)
    }

    maybeTrackSignup(user, journey)
  } catch (err) {
    console.warn('Mixpanel identify failed:', err?.message)
  }
}

// signup_completed — the funnel entry. Fires once per uid per browser, and only
// for an account that was actually just created (created_at within the window),
// so we never retro-fire it for pre-existing users the first time we see them.
const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000
function maybeTrackSignup(user, journey) {
  if (journey.signupTracked) return
  const createdMs = Date.parse(user.created_at || '')
  const isFreshSignup = !isNaN(createdMs) && (Date.now() - createdMs) < NEW_ACCOUNT_WINDOW_MS
  // Mark as handled either way so we never fire on a later session for this uid.
  patchJourney({ signupTracked: true })
  if (!isFreshSignup) return

  track('signup_completed', {
    signup_method: 'google_oauth',
    // The app itself is free; AI features run on a shared free-trial quota until
    // the user adds their own key. A new account therefore starts on 'free'.
    plan_initial: 'free',
    utm_source: getUtmSource(),
    signup_timestamp: toDate(user.created_at),
  })
}

export function resetAnalytics() {
  if (!initialized || DISABLED) return
  try { mixpanel.reset() } catch { /* ignore */ }
}

// ── 2. gmail_connection_started ────────────────────────────────────────────────
// authFlowResult: 'redirected' when we hand off to the system browser (native),
// 'initiated' for the in-page web popup.
export function trackGmailConnectionStarted({ authFlowResult = 'initiated' } = {}) {
  const j = patchJourney({ gmailConnectionStartedAt: new Date().toISOString() })
  track('gmail_connection_started', {
    connection_provider: 'google',
    auth_flow_result: authFlowResult,
    signup_to_gmail_connect_seconds: secondsSince(j.signupAt),
  })
}

// ── 3. gmail_connected (activation moment) ─────────────────────────────────────
export function trackGmailConnected({ emailAccountCount = 1 } = {}) {
  const j = patchJourney({ gmailConnectedAt: new Date().toISOString() })
  track('gmail_connected', {
    gmail_connected_at: new Date(),
    email_account_count: Number(emailAccountCount) || 1,
    signup_to_gmail_connect_seconds: secondsSince(j.signupAt),
  })
}

// ── 4. application_tracked_first ───────────────────────────────────────────────
// Called on every tracked application; fires the event only when the count goes
// 0 → 1 for this user. `applicationSource`: gmail_sync | manual | import.
export function trackApplicationTracked({ applicationSource = 'manual' } = {}) {
  const prev = readJourney()
  const count = (prev.applicationsTracked || 0) + 1
  const j = patchJourney({
    applicationsTracked: count,
    ...(count === 1 ? { firstApplicationAt: new Date().toISOString() } : {}),
  })
  if (count !== 1) return // only the FIRST tracked application is the funnel event

  track('application_tracked_first', {
    application_source: applicationSource,
    application_count_after_event: count,
    // Time from the activation moment (Gmail connected) — or signup if Gmail was
    // never connected — to the first tracked application.
    time_to_first_application_seconds: secondsSince(j.gmailConnectedAt || j.signupAt),
  })
}

// ── 5. cv_generation_started ───────────────────────────────────────────────────
// cvInputType: resume_only | ats_assessment | role_description.
export function trackCvGenerationStarted({ applicationId, cvInputType } = {}) {
  const prev = readJourney()
  const isFirst = !prev.firstCvStartedAt
  if (isFirst) patchJourney({ firstCvStartedAt: new Date().toISOString() })
  track('cv_generation_started', {
    cv_tool_context: 'adaptive_cv_studio',
    application_id: applicationId,
    // Only meaningful for the first CV in the journey.
    time_to_first_cv_seconds: isFirst ? secondsSince(prev.firstApplicationAt) : undefined,
    cv_input_type: cvInputType,
  })
}

// ── 6. cv_generated + 9. ai_action_consumed(cv_tailoring) ──────────────────────
export function trackCvGenerated({ applicationId, atsScore, baselineScore } = {}) {
  const score = Number(atsScore)
  const base = Number(baselineScore)
  const delta = (!isNaN(score) && !isNaN(base)) ? Math.round((score - base) * 100) / 100 : undefined
  if (!readJourney().firstCvGeneratedAt) patchJourney({ firstCvGeneratedAt: new Date().toISOString() })

  track('cv_generated', {
    application_id: applicationId,
    ats_score: isNaN(score) ? undefined : score,
    cv_score_delta_from_baseline: delta,
    cv_generated_at: new Date(),
  })
  trackAiActionConsumed('cv_tailoring')
}

// ── 7. follow_up_drafted (+ ai_action_consumed + cadence) ──────────────────────
// followUpType: initial_followup | reply_check | inactivity_nudge.
export function trackFollowUpDrafted({ applicationId, followUpType } = {}) {
  const prev = readJourney()
  const prevAiActionAt = prev.lastAiActionAt // capture BEFORE this action updates it
  const step = (prev.followupSeq || 0) + 1
  const isFirst = !prev.firstFollowupAt
  patchJourney({
    followupSeq: step,
    ...(isFirst ? { firstFollowupAt: new Date().toISOString() } : {}),
  })

  track('follow_up_drafted', {
    application_id: applicationId,
    follow_up_type: followUpType,
    // Time from the first generated CV to the first follow-up drafted.
    time_to_first_followup_seconds: isFirst ? secondsSince(prev.firstCvGeneratedAt) : undefined,
    follow_up_channel: 'email',
  })
  trackAiActionConsumed('followup_generation')
  maybeTrackCadence({ prevAiActionAt, followUpSequenceStep: step })
}

// ── 8. mock_interview_completed (+ ai_action_consumed + cadence) ───────────────
// interviewMode: live_voice | practice.
export function trackMockInterviewCompleted({ applicationId, interviewMode = 'live_voice', questionsCoveredCount } = {}) {
  const prevAiActionAt = readJourney().lastAiActionAt
  track('mock_interview_completed', {
    application_id: applicationId,
    interview_mode: interviewMode,
    questions_covered_count: Number(questionsCoveredCount) || undefined,
    mock_interview_completed_at: new Date(),
  })
  trackAiActionConsumed('mock_interview_coaching')
  maybeTrackCadence({ prevAiActionAt })
}

// ── 9. ai_action_consumed ──────────────────────────────────────────────────────
// aiActionType: cv_tailoring | followup_generation | mock_interview_coaching.
// Credit source: a stored user key means the action is billed to that key
// ('anthropic_api_key_unlocked'); otherwise it spends the shared free quota.
export function trackAiActionConsumed(aiActionType) {
  const unlocked = hasUserApiKey()
  const creditType = unlocked ? 'anthropic_api_key_unlocked' : 'free_quota'

  let remaining
  if (!unlocked) {
    const used = (readJourney().freeActionsUsed || 0) + 1
    patchJourney({ freeActionsUsed: used })
    remaining = Math.max(0, FREE_TRIAL_LIMIT - used)
  }
  // Record this consumption as the latest AI action (drives cadence gaps).
  patchJourney({ lastAiActionAt: new Date().toISOString() })

  track('ai_action_consumed', {
    ai_action_type: aiActionType,
    // Omitted for unlocked keys, where the quota doesn't apply (usage is unbounded).
    ai_actions_remaining_after: remaining,
    ai_action_credit_type: creditType,
    ai_action_consumed_at: new Date(),
  })
}

// ── 11. interview_followup_cadence_checkin ─────────────────────────────────────
// Recurring engagement: a follow-up or mock interview run while a prior AI action
// exists. `prevAiActionAt` is the lastAiActionAt captured BEFORE the current
// action updated it — so the gap reflects the previous action, not this one.
function maybeTrackCadence({ prevAiActionAt, followUpSequenceStep } = {}) {
  if (!prevAiActionAt) return // no prior AI action → nothing recurring yet
  track('interview_followup_cadence_checkin', {
    cadence_type: 'mock_interview_followup_sequence',
    days_since_last_ai_action: daysSince(prevAiActionAt),
    follow_up_sequence_step: followUpSequenceStep,
    cadence_event_at: new Date(),
  })
}

// ── 10. offer_received ─────────────────────────────────────────────────────────
export function trackOfferReceived({ applicationId, offerStatus = 'received', trackedApplicationsCount } = {}) {
  track('offer_received', {
    offer_status: offerStatus,
    application_id: applicationId,
    offer_received_at: new Date(),
    tracked_applications_count_at_offer: Number(trackedApplicationsCount) || undefined,
  })
}

// Whether the user configured their own Claude API key (mirrors apiKey.js's
// storage key). Read directly to avoid a circular import with the AI helpers.
function hasUserApiKey() {
  try { return !!localStorage.getItem('jobtrackr_claude_api_key') } catch { return false }
}
