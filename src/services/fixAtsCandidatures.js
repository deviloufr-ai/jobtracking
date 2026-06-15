// ─── ATS-candidature repair ─────────────────────────────────────────────────────
// Problem: ATS / job boards that hide the employer (Jobgether, LinkedIn easy-apply,
// Indeed…) make the parser tag every hidden-employer application with the SAME
// company (e.g. "Jobgether", companyFromAts: true). deduplicateJobs() then collapses
// them into ONE job because they share company + a generic/identical position — so
// several DISTINCT applications (different real positions) show up as a single
// candidature with a long mixed timeline.
//
// Fix: each history entry still carries its source gmailId, so we re-fetch every
// source email, ask Claude to recover the EXACT position (and real employer when
// present), then split the merged job back into one candidature per distinct
// position. Entries with no gmailId (manual notes, calendar meetings) are attached
// to the nearest candidature by date so nothing is ever lost.
//
// Triggered from the browser console as window.fixAtsCandidatures({ dryRun }).
// The durable apply (delete merged row + insert split rows through the sync
// coordinator, with id/history tombstoning) lives in useJobs.applyAtsSplit.

import { fetchEmailRawById } from './gmail'
import { recoverAtsEmployers } from './claude'
import { isJobBoard, normalize } from '../constants/jobBoards'

// Position normalization mirrors deduplicateJobs() in useJobs.js so the split keys
// line up with how the app groups jobs.
function normPos(p) {
  return (p || '').toLowerCase().trim().replace(/\s*\(?[hf]\/[hf]\)?\s*/gi, '').trim()
}

const emailEntries = (job) =>
  (job.history || []).filter(h => h.gmailId && h.source !== 'calendar' && !h.meetingLink)

// A job is a repair candidate when its company is an ATS/job board (employer hidden)
// AND its timeline references ≥2 distinct source emails — the tell-tale of several
// applications collapsed together.
export function isAtsSplitCandidate(job) {
  if (!job || !isJobBoard(job.company)) return false
  const ids = new Set(emailEntries(job).map(h => h.gmailId))
  return ids.size >= 2
}

export function collectAtsCandidates(jobs) {
  return (jobs || []).filter(isAtsSplitCandidate)
}

// Attach an entry that has no usable recovery (manual note / meeting / failed
// recovery) to the group whose entries are nearest in time.
function nearestGroupKey(entry, groups) {
  const t = new Date(entry.date).getTime()
  let bestKey = null, bestDist = Infinity
  for (const [key, g] of groups) {
    for (const e of g.history) {
      const d = Math.abs(new Date(e.date).getTime() - t)
      if (d < bestDist) { bestDist = d; bestKey = key }
    }
  }
  return bestKey
}

// Pure: given a merged job + a recovery map { gmailId → { company, companyFromAts,
// position } }, return the list of distinct candidatures to split into, or null
// when there's nothing to split (fewer than 2 distinct positions recovered).
export function planAtsSplit(job, recovered) {
  const entries = (job.history || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date))

  // Pass 1: cluster the email entries we could recover a position for.
  const groups = new Map() // key → { company, companyFromAts, position, history: [] }
  const leftovers = []

  for (const entry of entries) {
    const rec = entry.gmailId ? recovered[entry.gmailId] : null
    if (!rec || !rec.position) { leftovers.push(entry); continue }

    const pos = normPos(rec.position)
    if (!pos) { leftovers.push(entry); continue }

    // When the real employer is known (companyFromAts === false) it keys the group;
    // otherwise the ATS name keys it and the position does the differentiating.
    const realCompany = !rec.companyFromAts && rec.company ? rec.company : null
    const key = `${normalize(realCompany || job.company)}|||${pos}`

    let g = groups.get(key)
    if (!g) {
      g = { company: realCompany || job.company, companyFromAts: !realCompany, position: rec.position, history: [] }
      groups.set(key, g)
    } else if (realCompany && g.companyFromAts) {
      // Upgrade a previously ATS-only group once a real employer surfaces for it.
      g.company = realCompany
      g.companyFromAts = false
    }
    g.history.push(entry)
  }

  // Nothing meaningful to split — leave the job untouched.
  if (groups.size < 2) return null

  // Pass 2: fold leftovers (manual/meeting/unrecovered) into the nearest group.
  for (const entry of leftovers) {
    const key = nearestGroupKey(entry, groups)
    if (key) groups.get(key).history.push(entry)
  }

  // Finalize each candidature: chronological history, application date = earliest,
  // status = latest entry's status, notes = distinct entry notes.
  return [...groups.values()].map(g => {
    const history = g.history.slice().sort((a, b) => new Date(a.date) - new Date(b.date))
    const notes = [...new Set(history.map(h => (h.note || '').trim()).filter(Boolean))].join(' | ')
    return {
      company: g.company,
      companyFromAts: g.companyFromAts,
      position: g.position,
      status: history[history.length - 1]?.status || job.status,
      date: history[0]?.date || job.date,
      notes,
      history,
    }
  })
}

// Orchestrator. For every candidate job: fetch its source emails, recover the real
// position/employer via Claude, plan a split, and either log it (dryRun) or apply
// it durably through `applySplit(jobId, groups)`. Returns a report.
export async function runAtsCandidatureFix(jobs, { dryRun = true, applySplit, onProgress } = {}) {
  const candidates = collectAtsCandidates(jobs)
  const report = { scanned: jobs.length, candidates: candidates.length, plans: [], applied: 0, skipped: 0, errors: [] }

  console.log(`🔧 ATS repair: ${candidates.length} candidate job(s) of ${jobs.length} scanned${dryRun ? ' (dry run)' : ''}`)

  for (const job of candidates) {
    try {
      onProgress?.({ stage: 'fetch', company: job.company, position: job.position })

      // Fetch each distinct source email (dedupe gmailIds, keep its receiving account).
      const seen = new Set()
      const toFetch = emailEntries(job).filter(h => {
        if (seen.has(h.gmailId)) return false
        seen.add(h.gmailId); return true
      })

      const emails = []
      for (const h of toFetch) {
        try {
          emails.push(await fetchEmailRawById(h.gmailId, h.receivedBy || ''))
        } catch (e) {
          console.warn(`  ✗ Could not fetch email ${h.gmailId}:`, e.message)
        }
      }
      if (emails.length < 2) { report.skipped++; continue }

      onProgress?.({ stage: 'analyze', company: job.company, count: emails.length })
      const recovered = await recoverAtsEmployers(emails)
      const groups = planAtsSplit(job, recovered)

      if (!groups) {
        console.log(`  ⏭️  ${job.company} / ${job.position}: only one distinct position — left as is`)
        report.skipped++
        continue
      }

      const plan = {
        jobId: job.id,
        from: { company: job.company, position: job.position, entries: (job.history || []).length },
        into: groups.map(g => ({ company: g.company, position: g.position, status: g.status, date: g.date, entries: g.history.length })),
      }
      report.plans.push(plan)
      console.log(`  ✂️  ${job.company} / ${job.position} → ${groups.length} candidatures:`)
      groups.forEach(g => console.log(`       • ${g.company} — ${g.position} (${g.history.length} étapes, ${g.status}, dès ${g.date})`))

      if (!dryRun && applySplit) {
        await applySplit(job, groups)
        report.applied++
        onProgress?.({ stage: 'applied', company: job.company })
      }
    } catch (e) {
      console.error(`  ✗ Repair failed for ${job.company}:`, e)
      report.errors.push({ jobId: job.id, company: job.company, error: e.message })
    }
  }

  console.log(
    dryRun
      ? `🔍 Dry run complete. ${report.plans.length} job(s) would be split. Run window.fixAtsCandidatures({ dryRun: false }) to apply.`
      : `✅ Repair complete. ${report.applied} job(s) split, ${report.skipped} skipped.`
  )
  return report
}
