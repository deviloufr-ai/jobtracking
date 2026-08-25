// CandidatureDrawer — full candidature detail for the E layout's right drawer.
//
// The classic desktop panel (JobCandidaturePanel, the 4 tabs Overview / CV /
// Cover Letter / Interview + the CV, cover-letter and mock-interview generators)
// lives inside JobRow's expanded row with a large local controller. JobCard
// (what the drawer used before) is the lighter mobile card and omits the cover
// letter + mock interview. This ports the minimal controller JobRow feeds the
// panel (add-step form, use-case toggle, cover-letter + mock-interview modals) so
// the drawer exposes the SAME feature set. Contacts/address/enrichment props are
// optional (the panel defaults them) and left off here.
import { useState } from 'react'
import JobCandidaturePanel from '../JobCandidaturePanel'
import UseCasePanel from '../UseCasePanel'
import MotivationLetterGenerator from '../MotivationLetterGenerator'
import MockInterviewChatbot from '../MockInterviewChatbot'
import CVViewer from '../CVViewer'
import { isNoReply } from '../EmailDraft'

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const nowStep = (status) => {
  const n = new Date()
  return {
    status,
    note: '',
    date: n.toISOString().split('T')[0],
    time: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`,
  }
}

export default function CandidatureDrawer({
  job,
  onEdit,
  onDelete,
  onUpdateJob,
  onAddStep,
  onUpdateHistory,
  onGenerateCV,
  onViewSavedCV,
  t = (k) => k,
}) {
  const history = job.history || []
  const displayStatus = history.length ? (history[history.length - 1].status || job.status) : job.status

  const [showAddStep, setShowAddStep] = useState(false)
  const [showUseCase, setShowUseCase] = useState(false)
  const [showMockInterview, setShowMockInterview] = useState(false)
  const [showMotivationLetter, setShowMotivationLetter] = useState(false)
  const [newStep, setNewStep] = useState(() => nowStep(displayStatus))

  // Recruiter + contacts, derived from inbound emails (mirrors JobRow).
  const recruiterContact = (() => {
    for (const h of history) {
      if (h.fromMe || !h.from) continue
      const raw = h.from.trim()
      const m = raw.match(/^([^<]+)<([^>]+)>/)
      if (m) return { name: m[1].trim(), email: m[2].trim() }
      if (raw.includes('@')) return { name: raw.split('@')[0], email: raw }
    }
    return null
  })()
  const allContacts = (() => {
    const seen = new Map()
    for (const h of history) {
      if (h.fromMe || !h.from) continue
      const raw = h.from.trim()
      const m = raw.match(/^([^<]+)<([^>]+)>/)
      const email = m ? m[2].trim() : (raw.includes('@') ? raw : null)
      if (!email || isNoReply(email)) continue
      if (!seen.has(email)) {
        seen.set(email, { name: m ? m[1].trim() : raw.split('@')[0], email, date: h.date, receivedBy: h.receivedBy || null })
      }
    }
    return [...seen.values()]
  })()
  const upcomingEvents = history
    .filter(h => h.source === 'calendar' && h.isUpcoming && new Date(h.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  const handleAddStepSubmit = () => {
    if (!newStep.note.trim()) return
    const step = { ...newStep, date: newStep.time ? `${newStep.date}T${newStep.time}:00` : newStep.date }
    onAddStep?.(job.id, step)
    setNewStep(nowStep(job.status))
    setShowAddStep(false)
  }

  return (
    <>
      <JobCandidaturePanel
        job={job}
        onGenerateCV={() => onGenerateCV?.(job)}
        onViewSavedCV={onViewSavedCV}
        onEdit={() => onEdit?.(job)}
        onDelete={() => onDelete?.(job)}
        onUpdateJob={onUpdateJob}
        onAddStep={onAddStep}
        onUpdateHistory={onUpdateHistory}
        enriching={false}
        enrichResult={null}
        onSync={null}
        history={history}
        showAddStep={showAddStep}
        onToggleAddStep={() => setShowAddStep(v => !v)}
        newStep={newStep}
        setNewStep={setNewStep}
        onAddStepSubmit={handleAddStepSubmit}
        onCheckPosition={null}
        positionStatus={null}
        checkingPosition={false}
        onUseCase={() => { setShowUseCase(v => !v); setShowAddStep(false) }}
        showUseCase={showUseCase}
        formatDate={formatDate}
        upcomingEvents={upcomingEvents}
        recruiterContact={recruiterContact}
        allContacts={allContacts}
        companyAddr={''}
        onFetchAddress={null}
        fetchingAddr={false}
        addrError={null}
        onStartMockInterview={() => setShowMockInterview(true)}
        onGenerateCoverLetter={() => setShowMotivationLetter(true)}
        CVViewerComponent={job.cvSaved ? <CVViewer job={job} onClose={() => {}} inline onUpdate={onUpdateJob} t={t} /> : null}
        t={t}
      />

      {(showUseCase || job.useCase?.title) && onUpdateJob && (
        <UseCasePanel job={job} onUpdate={onUpdateJob} />
      )}

      {showMotivationLetter && (
        <MotivationLetterGenerator
          job={job}
          cvText={job.cvSaved?.markdown || ''}
          initialContent={job.letterSaved?.content || ''}
          onClose={() => setShowMotivationLetter(false)}
          onSaveLetter={onUpdateJob}
        />
      )}

      {showMockInterview && (
        <MockInterviewChatbot
          job={job}
          cv={job.cvSaved?.markdown || ''}
          onClose={() => setShowMockInterview(false)}
          onInterviewComplete={(result) => {
            const session = {
              type: 'interview',
              date: new Date().toISOString(),
              score: result.score,
              hire_decision: result.hire_decision,
              feedback: result.feedback,
              transcript: result.transcript,
            }
            onUpdateJob?.({
              ...job,
              interviewSessions: [...(job.interviewSessions || []), session],
              updated_at: new Date().toISOString(),
            })
            setShowMockInterview(false)
          }}
        />
      )}
    </>
  )
}
