import { useState, useEffect, useRef } from 'react'

const NOTIF_KEY = 'jobtrackr_notif_permission'
const SEEN_KEY = 'jobtrackr_seen_jobs'

export function useNotifications() {
  const [permission, setPermission] = useState(() => {
    if (typeof Notification === 'undefined') return 'unsupported'
    return Notification.permission
  })

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }

  const notify = (title, body, icon = '🎯') => {
    if (permission !== 'granted') return
    try {
      const n = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: title, // prevent duplicates
      })
      n.onclick = () => { window.focus(); n.close() }
    } catch (e) {
      console.warn('Notification failed:', e)
    }
  }

  return { permission, requestPermission, notify }
}

// Track job status changes and notify
export function useJobNotifications(jobs, notify) {
  const prevJobsRef = useRef(null)

  useEffect(() => {
    if (!jobs || jobs.length === 0) return

    const prev = prevJobsRef.current
    if (!prev) {
      prevJobsRef.current = jobs
      return
    }

    // Detect status changes
    jobs.forEach(job => {
      const prevJob = prev.find(p => p.id === job.id)
      if (!prevJob) {
        // New job added
        return
      }

      if (prevJob.status !== job.status) {
        const messages = {
          interview:    { title: `📞 Entretien — ${job.company}`, body: `Ton profil a été retenu pour un entretien chez ${job.company} !` },
          offer:        { title: `🎉 Offre reçue — ${job.company}`, body: `Tu as reçu une offre pour le poste de ${job.position} !` },
          rejected:     { title: `❌ Refus — ${job.company}`, body: `Ta candidature chez ${job.company} n'a pas été retenue.` },
          rejected_ats: { title: `🤖 Refus ATS — ${job.company}`, body: `Refus automatique reçu de ${job.company}. Optimise ton CV !` },
          reviewing:    { title: `👀 En cours — ${job.company}`, body: `Ton profil est en cours d'examen chez ${job.company}.` },
          waiting:      { title: `⏳ En attente — ${job.company}`, body: `${job.company} va revenir vers toi prochainement.` },
          archived:     { title: `📦 Archivée — ${job.company}`, body: `La candidature chez ${job.company} a été archivée automatiquement.` },
        }
        const msg = messages[job.status]
        if (msg) notify(msg.title, msg.body)
      }

      // Detect new history entries (new emails/events)
      if ((job.history?.length || 0) > (prevJob.history?.length || 0)) {
        const newEntry = job.history[job.history.length - 1]
        if (newEntry?.source === 'email' && newEntry?.note) {
          notify(`📧 Nouveau message — ${job.company}`, newEntry.note.slice(0, 80))
        }
      }
    })

    prevJobsRef.current = jobs
  }, [jobs])
}
