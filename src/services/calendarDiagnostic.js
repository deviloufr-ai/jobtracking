import { getConnectedAccounts, ensureValidToken } from './gmail'
import { detectEventType } from './calendar'

// One-shot calendar self-test, rendered in Settings → Debug. For EACH connected
// Google account it refreshes the token and hits the Calendar API directly (next
// 60 days) so the RAW HTTP status is visible — unlike fetchCalendarEvents, which
// swallows a 401 as []. Answers "why doesn't my interview show?":
//   • Is the right account even connected in THIS browser? (accounts are stored
//     per-browser and don't sync across devices, unlike jobs.)
//   • Is the token valid / does it carry the calendar scope? (401 / 403)
//   • Does the event actually come back from the API — and is it ACCEPTED?
//     (responseStatus: an unaccepted invite from an unknown sender isn't on the
//     calendar at all, so it never appears here.)
// Read-only: only GETs events. Never includes token strings in the report.
export async function runCalendarDiagnostic() {
  const report = {
    at: new Date().toISOString(),
    summary: {},
    accounts: [],
  }

  const accounts = getConnectedAccounts()
  report.summary.connectedCount = accounts.length
  report.summary.connectedEmails = accounts.map(a => a?.email).filter(Boolean)

  if (accounts.length === 0) {
    report.diagnosis =
      "Aucun compte Google connecté dans CE navigateur → le calendrier ne peut rien récupérer. " +
      "Connectez Gmail (onglet Import Gmail). Les comptes connectés sont stockés par navigateur " +
      "et NE se synchronisent PAS entre appareils (contrairement aux candidatures)."
    return report
  }

  const timeMin = new Date()
  const timeMax = new Date(); timeMax.setDate(timeMax.getDate() + 60)
  let totalEvents = 0
  let anyOk = false

  for (const acct of accounts) {
    const email = acct?.email || '(inconnu)'
    const entry = { email, tokenPresent: false, httpStatus: null, ok: false, upcomingCount: 0, events: [], error: null }
    try {
      const token = await ensureValidToken(email)
      entry.tokenPresent = !!token
      if (!token) {
        entry.error = 'Pas de token valide (reconnexion nécessaire).'
        report.accounts.push(entry)
        continue
      }

      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '50',
      })
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      entry.httpStatus = res.status
      entry.ok = res.ok

      if (!res.ok) {
        entry.error = res.status === 401
          ? 'Token expiré/invalide (401) — reconnectez ce compte.'
          : res.status === 403
          ? 'Accès calendrier refusé (403) — scope calendar.readonly manquant, reconnectez ce compte.'
          : `Erreur API ${res.status}.`
        report.accounts.push(entry)
        continue
      }

      anyOk = true
      const data = await res.json()
      const items = data.items || []
      entry.upcomingCount = items.length
      totalEvents += items.length
      entry.events = items.slice(0, 12).map(e => {
        const start = e.start?.dateTime || e.start?.date || ''
        const title = e.summary || '(sans titre)'
        const hasMeetingLink = !!(e.hangoutLink ||
          /meet\.google\.com|zoom\.us|teams\.microsoft\.com|whereby\.com|webex\.com/i.test(`${e.description || ''} ${e.location || ''}`))
        return {
          date: start ? start.slice(0, 16).replace('T', ' ') : '(sans date)',
          title,
          type: detectEventType(title),
          hasMeetingLink,
          // 'accepted' | 'needsAction' | 'tentative' | 'declined' — needsAction
          // means the invite is on the calendar but NOT yet accepted.
          rsvp: (e.attendees || []).find(a => a.self)?.responseStatus || null,
        }
      })
    } catch (e) {
      entry.error = String(e?.message || e)
    }
    report.accounts.push(entry)
  }

  report.summary.totalUpcoming = totalEvents
  report.summary.interviewLike = report.accounts
    .flatMap(a => a.events)
    .filter(e => ['interview', 'test', 'offer'].includes(e.type)).length

  if (!anyOk) {
    report.diagnosis =
      "Aucun calendrier n'a répondu correctement (token expiré ou scope calendrier manquant). " +
      'Reconnectez le(s) compte(s) Gmail concerné(s) via l\'onglet Import Gmail.'
  } else if (totalEvents === 0) {
    report.diagnosis =
      "Calendrier(s) accessible(s) mais AUCUN évènement à venir (60 j). Si un entretien manque : " +
      "l'invitation n'est peut-être pas ACCEPTÉE (une invitation d'un expéditeur inconnu non acceptée " +
      "n'est PAS sur votre agenda), ou elle est sur un compte Google non connecté dans ce navigateur."
  } else {
    report.diagnosis =
      `${totalEvents} évènement(s) à venir trouvé(s), dont ${report.summary.interviewLike} de type entretien/test/offre. ` +
      "Si un entretien attendu ne figure pas ci-dessus : il n'est pas (encore) sur l'agenda du/des compte(s) " +
      "connecté(s) — vérifiez qu'il est accepté (rsvp=accepted) et sur le bon compte."
  }

  return report
}
