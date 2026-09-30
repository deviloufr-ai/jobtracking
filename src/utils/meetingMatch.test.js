import { describe, it, expect } from 'vitest'
import { matchEventToJob, textMatchesPosition, schedulingTool } from './meetingMatch'

// The real case: a La Fourche interview booked via Calendly lands on the calendar
// without the company name, organised from the recruiter's own mailbox.
const calendlyEvent = {
  id: 'evt1',
  title: 'Alexandre Leblanc et Maher EL OUAER',
  date: '2026-10-14',
  rawStart: '2026-10-14T14:30:00+02:00',
  created: '2026-09-30T10:12:00Z',
  location: 'https://calendly.com/events/8707f476-2495-40bb-b366-c9e4d6c656e5/microsoft_teams',
  description: "Nom d'événement 30' Meeting\nVeuillez partager tout ce qui pourra être utile à la préparation de notre réunion.: Candidature au poste de Product Manager\nAlimenté par Calendly\nRéunion Microsoft Teams https://teams.microsoft.com/meet/351114723754187?p=zaycVMCHkHrq92XFzv",
  organizerEmail: 'maher.elouaer@bpifrance.fr',
  attendeeEmails: [],
  type: 'event',
}

const laFourche = {
  id: 'lf', company: 'La Fourche', position: 'Product Manager', status: 'interview',
  history: [
    { date: '2026-09-25', status: 'todo', note: 'Offre trouvée' },
    { date: '2026-09-25', status: 'reviewing', source: 'email', note: 'Candidature reçue', from: 'Équipe RH de La Fourche <lf-b98b@candidates.welcomekit.co>' },
    { date: '2026-09-30', status: 'interview', source: 'email', note: "Invitation à un premier entretien visio de 30 minutes via Calendly", from: 'Équipe RH de La Fourche <lf-b98b@candidates.welcomekit.co>' },
  ],
}

const sentPm = {
  id: 'other', company: 'Qonto', position: 'Product Manager', status: 'sent',
  history: [{ date: '2026-09-20', status: 'sent', source: 'email', note: 'Candidature envoyée' }],
}

describe('matchEventToJob', () => {
  it('links a Calendly booking without company name to the one pending interview', () => {
    expect(matchEventToJob(calendlyEvent, [sentPm, laFourche])).toEqual({ job: laFourche, reason: 'pending-invite' })
  })

  it('prefers the organizer domain when it names a tracked company', () => {
    const bpi = { id: 'bpi', company: 'Bpifrance', position: 'PM', status: 'sent', history: [] }
    expect(matchEventToJob(calendlyEvent, [laFourche, bpi])?.job).toBe(bpi)
  })

  it('does not treat invite boilerplate (Microsoft Teams URL) as a company', () => {
    const ms = { id: 'ms', company: 'Microsoft', position: 'Designer', status: 'sent', history: [] }
    expect(matchEventToJob(calendlyEvent, [ms, laFourche])?.job).toBe(laFourche)
  })

  it('links nothing once the candidature already has its calendar meeting', () => {
    const linked = { ...laFourche, history: [...laFourche.history, { date: '2026-10-01T10:00', status: 'interview', source: 'calendar', note: '📅 x' }] }
    expect(matchEventToJob(calendlyEvent, [linked])).toBeNull()
  })

  it('links nothing when two pending interviews fit equally', () => {
    const twin = { ...laFourche, id: 'twin', company: 'Alan' }
    expect(matchEventToJob(calendlyEvent, [laFourche, twin])).toBeNull()
  })

  it('narrows ambiguous pending interviews by position', () => {
    const designer = { ...laFourche, id: 'd', company: 'Alan', position: 'Product Designer' }
    expect(matchEventToJob(calendlyEvent, [designer, laFourche])?.job).toBe(laFourche)
  })

  it('ignores an invitation older than the booking window', () => {
    const stale = { ...laFourche, history: laFourche.history.map(h => h.status === 'interview' ? { ...h, date: '2026-08-01' } : h) }
    expect(matchEventToJob(calendlyEvent, [stale])).toBeNull()
  })

  it('ignores personal events', () => {
    const dentist = { id: 'x', title: 'Dentiste', date: '2026-10-02', rawStart: '2026-10-02T09:00:00Z', created: '2026-09-30T08:00:00Z', type: 'event' }
    expect(matchEventToJob(dentist, [laFourche])).toBeNull()
  })

  it('matches on a known contact email', () => {
    const withContact = { ...sentPm, contacts: [{ email: 'Maher.Elouaer@bpifrance.fr' }] }
    expect(matchEventToJob(calendlyEvent, [withContact])).toEqual({ job: withContact, reason: 'contact' })
  })
})

describe('helpers', () => {
  it('textMatchesPosition matches a whole phrase', () => {
    expect(textMatchesPosition('Candidature au poste de Product Manager', 'Product Manager')).toBe(true)
    expect(textMatchesPosition('Senior Product Managers', 'Product Manager')).toBe(false)
  })
  it('schedulingTool detects Calendly', () => {
    expect(schedulingTool(calendlyEvent.location)).toBe('calendly')
    expect(schedulingTool('Entretien RH')).toBeNull()
  })
})
