import { useState, useEffect, useMemo, useRef } from 'react'
import { loadSettings } from './useSettings'
import { extractUrlsFromEmail, rankUrlsByJobRelevance, checkPositionUrl } from '../services/positionChecker'
import { indexeddb } from '../services/indexeddb'
import { syncManager } from '../services/syncManager'
import { getSyncCoordinator } from '../services/syncCoordinator'
import { supabase, isSupabaseConfigured } from '../services/supabase'
import { getSyncUserIdForSupabase, resolveSyncUserId } from '../services/gmail'
import { deduplicateJobsViaEdgeFunction, formatDeduplicateResult } from '../services/deduplicateService'
import { GENERIC_POSITIONS_SET, isGenericPosition } from '../constants/positions'

const ENRICH_TTL_DAYS = 30

export function isEnriched(job) {
  if (!job?.enrichedAt) return false
  const age = (Date.now() - new Date(job.enrichedAt).getTime()) / (1000 * 60 * 60 * 24)
  return age < ENRICH_TTL_DAYS
}

export function needsEnrichment(job) {
  return !isEnriched(job)
}

const ATS_DOMAINS = [
  'ashbyhq.com', 'greenhouse.io', 'lever.co', 'workable.com',
  'recruitee.com', 'bamboohr.com', 'smartrecruiters.com', 'taleo.net',
  'successfactors.com', 'jobvite.com', 'icims.com', 'myworkdayjobs.com',
  'teamtailor.com', 'breezy.hr', 'pinpoint.com', 'dover.com',
  'comeet.com', 'jazz.co', 'rippling.com', 'notion.so'
]

export function isAtsRejection(notes = '', fromEmail = '') {
  const atsMatch = ATS_DOMAINS.some(d => fromEmail.toLowerCase().includes(d))
  const rejectionKeywords = ['not be moving forward', 'not moving forward', 'not selected',
    'we regret', 'nous avons le regret', 'no longer being considered',
    'decided to move forward with other', 'not an ideal fit', 'filled the position']
  const isRejection = rejectionKeywords.some(k => notes.toLowerCase().includes(k))
  return atsMatch || isRejection
}

// Helper: ensure history is always sorted by date (chronological order)
export function sortJobHistory(job) {
  if (!job?.history?.length) return job
  // Check if already sorted to avoid unnecessary copies
  const isSorted = job.history.every((a, i, arr) => i === 0 || new Date(arr[i-1].date) <= new Date(a.date))
  if (isSorted) return job
  // Create new sorted array only if needed
  return {
    ...job,
    history: [...job.history].sort((a, b) => new Date(a.date) - new Date(b.date))
  }
}

export const STATUSES = [
  { key: 'todo',         label: 'To do',         color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400' },
  { key: 'sent',         label: 'Sent',           color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  { key: 'reviewing',    label: 'Reviewing',  color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  { key: 'interview',    label: 'Interview',  color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  { key: 'done',         label: 'Accepted',              color: 'bg-teal-100 text-teal-700',     dot: 'bg-teal-500' },
  { key: 'waiting',      label: 'Waiting',          color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  { key: 'offer',        label: 'Offer received',         color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  { key: 'rejected',     label: 'Rejected',             color: 'bg-red-100 text-red-700',       dot: 'bg-red-400' },
  { key: 'rejected_ats', label: 'Rejected (ATS)',           color: 'bg-rose-100 text-rose-600',     dot: 'bg-rose-400' },
  { key: 'cancelled',    label: 'Cancelled',             color: 'bg-gray-100 text-gray-500',     dot: 'bg-gray-400' },
  { key: 'archived',    label: 'Archived',            color: 'bg-slate-100 text-slate-400',   dot: 'bg-slate-300' },
]

export function getStatus(key) {
  return STATUSES.find(s => s.key === key) || STATUSES[0]
}

export function getStatusLabel(key, t = (key) => key) {
  const status = getStatus(key)
  return t(`status.${key}`) || status.label
}

function normalizeCompany(name = '') {
  return name.toLowerCase()
    .replace(/\s+(sas|sasu|sarl|sa|srl|inc|ltd|llc|gmbh|bv|nv|ag|spa|oy|ab)\.?\s*$/i, '')
    .replace(/\.(io|com|fr|co|net|org|eu|de|uk|be|ch|ca|us|tech|dev)\s*$/i, '')
    .replace(/\b(technologies|digital|solutions|group|labs|studio|hq|services|consulting|innovation|ventures|project|projects)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

const STATUS_PRIORITY = {
  cancelled: 0, sent: 1, reviewing: 2, waiting: 3,
  interview: 4, done: 4, offer: 5, rejected: 6, rejected_ats: 6
}

// Import all the deduplication/processing functions from original useJobs
// (These are pure functions, no changes needed)
export function deduplicateJobs(jobs) {
  // Early exit: if few jobs, deduplication is cheap
  if (jobs.length <= 2) return jobs

  const normPos = p => (p || '').toLowerCase().trim().replace(/\s*\(?[hf]\/[hf]\)?\s*/gi, '').trim()
  const isGenericPos = p => GENERIC_POSITIONS_SET.has(normPos(p))

  const groups = new Map()
  for (const job of jobs) {
    const co = normalizeCompany(job.company)
    const pos = normPos(job.position)
    const key = isGenericPos(job.position) ? co : `${co}|||${pos}`
    if (!groups.has(key)) {
      groups.set(key, [job])
    } else {
      groups.get(key).push(job)
    }
  }

  const realGroups = new Map()
  const genericByCompany = new Map()
  for (const [key, group] of groups) {
    if (key.includes('|||')) {
      realGroups.set(key, group)
    } else {
      const existing = genericByCompany.get(key)
      genericByCompany.set(key, existing ? [...existing, ...group] : group)
    }
  }

  for (const [co, genericJobs] of genericByCompany) {
    let merged = false
    for (const [key, realJobs] of realGroups) {
      if (key.startsWith(co + '|||')) {
        realJobs.push(...genericJobs)
        merged = true
        break
      }
    }
    if (!merged) {
      realGroups.set(co, genericJobs)
    }
  }
  groups.clear()
  for (const [key, group] of realGroups) {
    groups.set(key, group)
  }

  const result = []
  for (const [, group] of groups) {
    if (group.length === 1) {
      result.push(group[0])
      continue
    }

    group.sort((a, b) => {
      // Prefer most recently updated (manual edits)
      const timeA = new Date(a.updated_at || a.date).getTime()
      const timeB = new Date(b.updated_at || b.date).getTime()
      if (timeA !== timeB) return timeB - timeA

      // If same time, prefer higher priority status
      const pa = STATUS_PRIORITY[a.status] ?? 1
      const pb = STATUS_PRIORITY[b.status] ?? 1
      if (pb !== pa) return pb - pa

      return new Date(b.date) - new Date(a.date)
    })

    const realPositions = [...new Set(group.map(j => normPos(j.position)).filter(p => !GENERIC_POSITIONS_SET.has(p)))]
    if (realPositions.length > 1) {
      group.forEach(j => result.push(j))
      continue
    }

    const TERMINAL = ['rejected', 'rejected_ats', 'cancelled']
    const hasTerminal = group.some(j => TERMINAL.includes(j.status))
    if (group.length > 1) {
      const dates = group.map(j => new Date(j.date).getTime())
      const span = (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24)
      const threshold = hasTerminal ? 60 : 90
      if (span > threshold) {
        group.forEach(j => result.push(j))
        continue
      }
    }

    const primary = group[0]

    const bestPosition = group
      .map(j => j.position || '')
      .find(p => !isGenericPosition(p))
      || primary.position

    const allHistory = group.flatMap(j => j.history || [])
    allHistory.sort((a, b) => new Date(a.date) - new Date(b.date))

    const seenHistory = new Set()
    const mergedHistory = allHistory.filter(h => {
      const normNote = (h.note || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100)
      const k = `${h.date}_${normNote}`
      if (seenHistory.has(k)) return false
      seenHistory.add(k)
      return true
    })

    const allNotes = mergeNotes(...group.map(j => j.notes))

    const latestEnrichedAt = group
      .map(j => j.enrichedAt)
      .filter(Boolean)
      .sort()
      .pop()

    const merged = { ...primary }
    for (const job of group.slice(1)) {
      for (const [key, value] of Object.entries(job)) {
        if (['id', 'position', 'notes', 'history', 'enrichedAt', 'updatedAt'].includes(key)) continue
        if (!merged[key] && value) {
          merged[key] = value
        }
      }
    }

    result.push({
      ...merged,
      position: bestPosition,
      notes: allNotes || primary.notes,
      history: mergedHistory,
      enrichedAt: latestEnrichedAt || primary.enrichedAt,
      _merged: group.length > 1 ? group.length : undefined,
      _mergedIds: group.length > 1 ? group.map(g => g.id) : undefined
    })
  }

  return result
}

// Physically reconcile duplicate jobs. deduplicateJobs() only hides duplicates
// at render time — the loser rows live on in IndexedDB + Supabase and get
// re-fetched on every poll, so they keep coming back (Bug: doublon). This merges
// the group (losers' history is already folded into the keeper by
// deduplicateJobs), then DELETES the loser rows everywhere and tombstones their
// IDs so polling can't resurrect them. Returns the deduped, _merged-stripped list.
export function reconcileDuplicateJobs(jobs) {
  const deduped = deduplicateJobs(jobs)
  const keptIds = new Set(deduped.map(j => j.id))
  const droppedIds = jobs.filter(j => !keptIds.has(j.id)).map(j => j.id)

  if (droppedIds.length > 0) {
    const coordinator = getSyncCoordinator()
    droppedIds.forEach(id => {
      markJobIdAsDeleted(id)
      if (coordinator) {
        coordinator.mutate('jobs', 'delete', { id })
          .catch(err => console.error('Failed to delete merged duplicate from Supabase:', err))
      } else {
        indexeddb.deleteJob(id).catch(err => console.warn('Failed to delete merged duplicate locally:', err))
      }
    })
    // Re-sync keepers that absorbed history so the merge is durable remotely.
    if (coordinator) {
      deduped.forEach(job => {
        if (job._merged) {
          const { _merged, _mergedIds, ...clean } = job
          coordinator.mutate('jobs', 'update', clean, { syncHistory: true })
            .catch(err => console.error('Failed to sync merged keeper:', err))
        }
      })
    }
    console.log(`🧹 Reconciled ${droppedIds.length} duplicate job(s) — removed loser rows`)
  }

  return deduped.map(({ _merged, _mergedIds, ...j }) => j)
}

function splitPipeNotes(jobs) {
  return jobs.map(j => {
    if (!j.history) return j
    const expanded = []
    for (const entry of j.history) {
      if (entry.note && entry.note.includes(' | ')) {
        const parts = entry.note.split(' | ').map(p => p.trim()).filter(Boolean)
        const allMeaningful = parts.every(p => p.length >= 10)
        if (allMeaningful && parts.length >= 2) {
          parts.forEach(part => expanded.push({ ...entry, note: part }))
        } else {
          expanded.push(entry)
        }
      } else {
        expanded.push(entry)
      }
    }
    return { ...j, history: expanded }
  })
}

function deduplicateMeetings(meetings) {
  if (meetings.length <= 1) return meetings

  const normTitle = (note = '') => {
    const clean = note
      .toLowerCase()
      .replace(/^📅\s*/, '')
      .replace(/\(à venir\)|upcoming|today|aujourd'hui|demain|tomorrow/gi, '')
      .replace(/—.*$/, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return clean
  }

  const byDateTitle = new Map()
  for (const meeting of meetings) {
    const key = `${meeting.date}_${normTitle(meeting.note)}`
    if (!byDateTitle.has(key)) {
      byDateTitle.set(key, [meeting])
    } else {
      byDateTitle.get(key).push(meeting)
    }
  }

  const deduped = []
  for (const [, group] of byDateTitle) {
    if (group.length === 1) {
      deduped.push(group[0])
      continue
    }

    const primary = group[0]
    const gmailIds = []
    let bestLink = primary.meetingLink

    for (const m of group) {
      if (m.gmailId && !gmailIds.includes(m.gmailId)) gmailIds.push(m.gmailId)
      if (!bestLink && m.meetingLink) bestLink = m.meetingLink
    }

    deduped.push({
      ...primary,
      meetingLink: bestLink || primary.meetingLink,
      gmailId: gmailIds[0] || primary.gmailId,
      gmailIds: gmailIds.length > 1 ? gmailIds : primary.gmailIds,
    })
  }

  return deduped
}

function mergeSameDateEntries(jobs) {
  return jobs.map(j => {
    if (!j.history || j.history.length <= 1) return j

    // Check if entry is a real meeting (has meetingLink or is calendar event)
    const isRealMeeting = h => h.meetingLink || h.source === 'calendar' || (h.note && h.note.includes('📅'))

    // Group entries by date
    const byDate = new Map()
    for (const entry of j.history) {
      if (!byDate.has(entry.date)) {
        byDate.set(entry.date, [])
      }
      byDate.get(entry.date).push(entry)
    }

    // Merge entries with same date
    const merged = []
    for (const [date, entries] of byDate) {
      if (entries.length === 1) {
        merged.push(entries[0])
        continue
      }

      // Separate real meetings from regular entries
      const meetings = entries.filter(isRealMeeting)
      const regularEntries = entries.filter(e => !isRealMeeting(e))

      // Keep meetings separate, deduplicate if needed
      if (meetings.length > 0) {
        const deduped = deduplicateMeetings(meetings)
        merged.push(...deduped)
      }

      // Merge regular entries with same date into one
      if (regularEntries.length > 0) {
        const primary = regularEntries[0]
        const allNotes = regularEntries
          .map(e => e.note)
          .filter(Boolean)
          .join(' | ')

        merged.push({
          ...primary,
          note: allNotes || primary.note
        })
      }
    }

    return { ...j, history: merged.sort((a, b) => new Date(a.date) - new Date(b.date)) }
  })
}

function normalizeForComparison(text = '') {
  return (text || '')
    .toLowerCase()
    .replace(/[àâäæéèêëïîôöùûüœç]/g, c => {
      const map = { 'à': 'a', 'â': 'a', 'ä': 'a', 'æ': 'ae', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'ï': 'i', 'î': 'i', 'ô': 'o', 'ö': 'o', 'ù': 'u', 'û': 'u', 'ü': 'u', 'œ': 'oe', 'ç': 'c' }
      return map[c] || c
    })
    .split(/[\s|,.-]+/)
    .filter(w => w.length > 3)
}

function notesAreSimilar(wordsA, wordsB) {
  if (wordsA.length === 0 || wordsB.length === 0) return false
  const setB = new Set(wordsB)
  const matches = wordsA.filter(w => setB.has(w)).length
  const minLength = Math.min(wordsA.length, wordsB.length)
  return minLength > 0 && matches / minLength > 0.3
}

// Merge a list of notes into a single ' | '-joined note WITHOUT nesting.
// Notes are split into atomic parts first, so re-merging an already-joined
// note ("A | B") with one of its parts ("A") yields "A | B" — not "A | B | A".
// This makes note merging idempotent and stops history notes from growing.
function dedupeNoteParts(notes) {
  const parts = []
  const seen = new Set()
  for (const note of notes) {
    for (const raw of (note || '').split(' | ')) {
      const part = raw.trim()
      const norm = part.toLowerCase()
      if (part && !seen.has(norm)) {
        seen.add(norm)
        parts.push(part)
      }
    }
  }
  return parts.join(' | ')
}

// Collapse entries that share a canonical identity (same gmailId, or same
// date+status+note) regardless of where they sit in the timeline. This runs
// BEFORE the same-date clustering below so that re-imported emails whose notes
// were mutated (e.g. a trailing "✓") or whose status changed (reviewing→done)
// no longer survive as separate repeated entries. When two copies collide we
// keep the richer one (more populated fields) and merge their gmailIds.
function collapseByCanonicalKey(history) {
  const byKey = new Map()
  for (const entry of history) {
    const key = historyEntryKey(entry)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, entry)
      continue
    }
    // Prefer the entry carrying more metadata (meetingLink/from/body/longer note)
    const score = e => (e.meetingLink ? 2 : 0) + (e.from ? 1 : 0) + (e.body ? 1 : 0) + (e.note || '').length / 1000
    const winner = score(entry) > score(existing) ? entry : existing
    const loser = winner === entry ? existing : entry
    // Preserve any gmailIds from the discarded copy
    const ids = new Set([
      ...(winner.gmailIds || (winner.gmailId ? [winner.gmailId] : [])),
      ...(loser.gmailIds || (loser.gmailId ? [loser.gmailId] : [])),
    ])
    const mergedWinner = { ...winner }
    if (ids.size > 1) mergedWinner.gmailIds = [...ids]
    byKey.set(key, mergedWinner)
  }
  return [...byKey.values()]
}

// Calendar/meeting entries describing the SAME event can survive canonical-key
// dedup when their `date` differs only in time granularity — e.g. an all-day
// "Interview with Yubo" copy at 2026-06-15 vs the timed instance at
// 2026-06-15T10:30:00 — or when the same event is synced from two Google
// accounts (different event ids). Because historyEntryKey embeds the full date
// string, those collapse to DIFFERENT keys and both survive, producing the
// visible doublon in the timeline. This pass collapses meetings that share the
// same calendar DAY + normalized title regardless of time component, keeping
// the richest copy (timed date + meetingLink), and merging gmailIds. Idempotent.
function meetingDayTitleKey(note = '') {
  return (note || '')
    .toLowerCase()
    .replace(/📅|🗓️?/g, '')
    .replace(/\(à venir\)|upcoming|today|aujourd'hui|demain|tomorrow/gi, '')
    .replace(/—.*$/, '')            // drop trailing location/time suffix
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function collapseMeetingsByDayTitle(history) {
  const isMeeting = h => h.meetingLink || h.source === 'calendar' || (h.note || '').includes('📅')
  const groups = new Map()    // dayTitleKey -> index into result
  const result = []
  // Prefer the copy with a time component in its date, then a meetingLink, then
  // the most advanced status (done > interview > upcoming), then a longer note.
  const score = e =>
    ((e.date || '').toString().includes('T') ? 8 : 0) +
    (e.meetingLink ? 4 : 0) +
    (e.status === 'done' ? 2 : 0) +
    (e.note || '').length / 1000

  for (const entry of history) {
    if (!isMeeting(entry)) { result.push(entry); continue }
    const day = (entry.date || '').toString().split('T')[0]
    const titleKey = meetingDayTitleKey(entry.note)
    if (!titleKey) { result.push(entry); continue }
    const key = `${day}|||${titleKey}`
    const idx = groups.get(key)
    if (idx === undefined) {
      groups.set(key, result.length)
      result.push(entry)
      continue
    }
    const existing = result[idx]
    const winner = score(entry) >= score(existing) ? entry : existing
    const loser = winner === entry ? existing : entry
    const merged = { ...winner }
    if (!merged.meetingLink && loser.meetingLink) {
      merged.meetingLink = loser.meetingLink
      merged.meetingPlatform = loser.meetingPlatform
      merged.meetingEmoji = loser.meetingEmoji
    }
    const ids = new Set([
      ...(merged.gmailIds || (merged.gmailId ? [merged.gmailId] : [])),
      ...(loser.gmailIds || (loser.gmailId ? [loser.gmailId] : [])),
    ])
    if (ids.size > 1) merged.gmailIds = [...ids]
    result[idx] = merged
  }
  return result
}

export function deduplicateHistory(jobs) {
  return jobs.map(j => {
    if (!j.history || j.history.length <= 1) return j

    // Pass 0: global collapse by canonical key (gmailId-first). Idempotent.
    // Pass 0b: collapse calendar/meeting duplicates that differ only in date
    // time-granularity or originate from a second Google account.
    const collapsed = collapseMeetingsByDayTitle(collapseByCanonicalKey(j.history))

    // Group by date
    const byDate = new Map()
    for (const entry of collapsed) {
      if (!byDate.has(entry.date)) {
        byDate.set(entry.date, [])
      }
      byDate.get(entry.date).push(entry)
    }

    const deduped = []

    // Process each date group
    for (const [date, entries] of byDate) {
      if (entries.length === 1) {
        deduped.push(entries[0])
        continue
      }

      // First pass: remove exact duplicates
      const seen = new Map()
      const withoutExactDupes = []
      for (const entry of entries) {
        const normNote = (entry.note || '').trim().toLowerCase()
        if (!seen.has(normNote)) {
          seen.set(normNote, entry)
          withoutExactDupes.push(entry)
        }
      }

      // If all were exact dupes, just keep the first one
      if (withoutExactDupes.length === 1) {
        deduped.push(withoutExactDupes[0])
        continue
      }

      // Second pass: cluster similar entries on same date WITH SAME STATUS
      // Skip expensive similarity clustering if few entries remain
      if (withoutExactDupes.length <= 2) {
        deduped.push(...withoutExactDupes)
        continue
      }

      // Never merge entries with different statuses—they're different events
      const clusters = []
      const used = new Set()
      const normalizedCache = new Map()

      for (let i = 0; i < withoutExactDupes.length; i++) {
        if (used.has(i)) continue

        const cluster = [i]
        used.add(i)
        const baseEntry = withoutExactDupes[i]
        const baseWords = normalizedCache.get(i) || normalizeForComparison(baseEntry.note)
        normalizedCache.set(i, baseWords)
        const baseStatus = baseEntry.status

        for (let j = i + 1; j < withoutExactDupes.length; j++) {
          if (used.has(j)) continue
          const compareEntry = withoutExactDupes[j]
          // Only cluster if same status AND similar notes
          if (compareEntry.status !== baseStatus) continue

          const compareWords = normalizedCache.get(j) || normalizeForComparison(compareEntry.note)
          normalizedCache.set(j, compareWords)

          if (notesAreSimilar(baseWords, compareWords)) {
            cluster.push(j)
            used.add(j)
          }
        }

        clusters.push(cluster)
      }

      // Merge similar entries in each cluster (idempotent: parts are de-nested)
      for (const cluster of clusters) {
        const primary = withoutExactDupes[cluster[0]]
        const note = dedupeNoteParts(cluster.map(idx => withoutExactDupes[idx].note))
        // Reuse the primary object when nothing changed to avoid needless re-renders;
        // also cleans up previously-nested notes on single entries ("A | B | A" → "A | B").
        if (cluster.length === 1 && note === (primary.note || '')) {
          deduped.push(primary)
        } else {
          deduped.push({ ...primary, note })
        }
      }
    }

    return { ...j, history: deduped.sort((a, b) => new Date(a.date) - new Date(b.date)) }
  })
}

// ─── Same-day topic consolidation ─────────────────────────────────────────────
// deduplicateHistory only merges entries that share the SAME date AND status.
// This collapses entries on the SAME DATE that describe the SAME TOPIC even when
// their status or sender differs (e.g. several emails about the "test technique"
// or a back-and-forth about "négociation salariale" on one day). Calendar/meeting
// entries are never merged. Topic similarity uses 5-char stem prefixes of
// significant words so morphological variants (salaire/salarial/salariale) still
// cluster. Idempotent: re-running on already-merged history is stable.
const TOPIC_STOPWORDS = new Set([
  'pour', 'avec', 'dans', 'vous', 'nous', 'votre', 'notre', 'cette', 'etre',
  'sont', 'elle', 'plus', 'tout', 'tous', 'mais', 'donc', 'cela', 'leur', 'sans',
  'this', 'that', 'with', 'your', 'have', 'from', 'will', 'would', 'about',
  'offre', 'poste', 'email', 'mail', 'recu', 'recue',
])

function topicStems(note = '') {
  const stems = new Set()
  for (const w of normalizeForComparison(note)) {
    if (TOPIC_STOPWORDS.has(w)) continue
    stems.add(w.slice(0, 5))
  }
  return stems
}

function sharedStemCount(a, b) {
  let n = 0
  for (const s of a) if (b.has(s)) n++
  return n
}

// Join notes into one ' · '-separated string with no duplicate/nested parts.
// Splits on existing ' · ' / ' | ' separators first so re-merging stays idempotent.
function combineTopicNotes(notes) {
  const parts = []
  const seen = new Set()
  for (const note of notes) {
    for (const raw of (note || '').split(/ · | \| /)) {
      const part = raw.trim()
      const norm = part.toLowerCase()
      if (part && !seen.has(norm)) { seen.add(norm); parts.push(part) }
    }
  }
  return parts.join(' · ')
}

const TOPIC_STATUS_ORDER = ['todo', 'sent', 'reviewing', 'interview', 'waiting', 'done', 'offer', 'rejected', 'rejected_ats', 'cancelled', 'archived']

function mergeTopicGroup(group) {
  // Representative = entry carrying the most metadata, then the longest note.
  const score = e => (e.body ? 2 : 0) + (e.from ? 1 : 0) + (e.note || '').length / 1000
  const rep = group.reduce((a, b) => (score(b) > score(a) ? b : a))
  const note = combineTopicNotes(group.map(e => e.note))

  // Status = the most frequent status in the group (the dominant stage),
  // tie-broken by the most advanced status. Per-entry status is cosmetic
  // (timeline dot) and does not change the job's top-level status.
  const counts = new Map()
  for (const e of group) counts.set(e.status, (counts.get(e.status) || 0) + 1)
  let status = group[0].status, bestN = -1
  for (const [s, n] of counts) {
    if (n > bestN || (n === bestN && TOPIC_STATUS_ORDER.indexOf(s) > TOPIC_STATUS_ORDER.indexOf(status))) {
      status = s; bestN = n
    }
  }

  const ids = new Set()
  for (const e of group) {
    if (e.gmailId) ids.add(e.gmailId)
    for (const id of e.gmailIds || []) ids.add(id)
  }
  const merged = { ...rep, note, status }
  if (ids.size > 1) merged.gmailIds = [...ids]
  else if (ids.size === 1) { merged.gmailId = [...ids][0]; delete merged.gmailIds }
  return merged
}

export function mergeHistoryBySameDayTopic(history) {
  if (!Array.isArray(history) || history.length <= 1) return history
  const isMeeting = h => h.meetingLink || h.source === 'calendar' || (h.note || '').includes('📅')

  const byDate = new Map()
  for (const e of history) {
    const d = e.date || 'unknown'
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d).push(e)
  }

  const out = []
  for (const [, entries] of byDate) {
    // Meetings are always preserved untouched.
    const meetings = entries.filter(isMeeting)
    const regular = entries.filter(e => !isMeeting(e))
    out.push(...meetings)

    if (regular.length <= 1) { out.push(...regular); continue }

    // Transitively cluster entries that share >= 2 topic stems.
    const stems = regular.map(e => topicStems(e.note))
    const cluster = new Array(regular.length).fill(-1)
    let next = 0
    for (let i = 0; i < regular.length; i++) {
      if (cluster[i] !== -1) continue
      cluster[i] = next
      let grew = true
      while (grew) {
        grew = false
        for (let j = 0; j < regular.length; j++) {
          if (cluster[j] !== -1) continue
          for (let k = 0; k < regular.length; k++) {
            if (cluster[k] !== next) continue
            if (sharedStemCount(stems[j], stems[k]) >= 2) { cluster[j] = next; grew = true; break }
          }
        }
      }
      next++
    }

    const groups = new Map()
    regular.forEach((e, i) => {
      if (!groups.has(cluster[i])) groups.set(cluster[i], [])
      groups.get(cluster[i]).push(e)
    })
    for (const [, group] of groups) {
      out.push(group.length === 1 ? group[0] : mergeTopicGroup(group))
    }
  }

  return out.sort((a, b) => new Date(a.date) - new Date(b.date))
}

function revalidateArchives(jobs) {
  const settings = loadSettings()
  return jobs.map(j => {
    if (j.status === 'archived') return j

    const daysSince = (date) => (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
    const isSent = ['sent', 'reviewing', 'waiting'].includes(j.status)
    const isRejected = ['rejected', 'rejected_ats', 'cancelled'].includes(j.status)

    if (isSent && daysSince(j.date) > settings.archiveSentDays) {
      return { ...j, status: 'archived' }
    }
    if (isRejected && daysSince(j.date) > settings.archiveRejectedDays) {
      return { ...j, status: 'archived' }
    }

    return j
  })
}

// Notes accumulate ` | `-joined segments across repeated auto-refresh merges.
// Split, trim, dedupe (case-insensitive) and cap total length so a job's notes
// field can't grow unbounded across syncs (was reaching 200k+ tokens).
const MAX_NOTES_LEN = 2000
export function mergeNotes(...noteStrings) {
  const seen = new Set()
  const segments = []
  for (const ns of noteStrings) {
    if (!ns) continue
    for (const seg of String(ns).split(' | ')) {
      const s = seg.trim()
      if (!s) continue
      const k = s.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      segments.push(s)
    }
  }
  let out = segments.join(' | ')
  if (out.length > MAX_NOTES_LEN) {
    out = out.slice(0, MAX_NOTES_LEN).replace(/\s*\|[^|]*$/, '').trim() + ' …'
  }
  return out
}

function deduplicateExactMatches(jobs) {
  const seen = new Map()
  const result = []

  for (const job of jobs) {
    const co = normalizeCompany(job.company)
    const pos = (job.position || '').toLowerCase().trim()
    const date = job.date
    const status = job.status

    const key = `${co}|||${pos}|||${date}|||${status}`

    if (seen.has(key)) {
      // Merge with existing: combine notes and history
      const existing = seen.get(key)
      if (job.notes) {
        existing.notes = mergeNotes(existing.notes, job.notes)
      }
      if (job.history && job.history.length > 0) {
        const existingHistoryKeys = new Set(
          (existing.history || []).map(h => `${h.date}_${(h.note || '').slice(0, 50)}`)
        )
        const newEntries = job.history.filter(h => {
          const k = `${h.date}_${(h.note || '').slice(0, 50)}`
          return !existingHistoryKeys.has(k)
        })
        existing.history = [...(existing.history || []), ...newEntries].sort((a, b) => new Date(a.date) - new Date(b.date))
      }
    } else {
      // Normalize notes on first insert so existing bloated data gets cleaned,
      // not just jobs that happen to merge this pass.
      const normalized = job.notes ? { ...job, notes: mergeNotes(job.notes) } : job
      seen.set(key, normalized)
      result.push(normalized)
    }
  }

  return result
}

function autoStale(jobs) {
  return revalidateArchives(deduplicateExactMatches(jobs))
}

// Helper to check if a job was previously deleted by ID (prevents re-sync from remote)
const DELETED_JOB_IDS_KEY = 'jobtrackr_deleted_job_ids'
const DELETED_HISTORY_ENTRIES_KEY = 'jobtrackr_deleted_history_entries'

export function isDeletedJobId(jobId) {
  const deleted = JSON.parse(localStorage.getItem(DELETED_JOB_IDS_KEY) || '[]')
  return deleted.includes(jobId)
}

function markJobIdAsDeleted(jobId) {
  const deleted = JSON.parse(localStorage.getItem(DELETED_JOB_IDS_KEY) || '[]')
  if (!deleted.includes(jobId)) {
    deleted.push(jobId)
    localStorage.setItem(DELETED_JOB_IDS_KEY, JSON.stringify(deleted))
  }
}

// ─── Canonical history-entry identity ─────────────────────────────────────────
// ONE key used by every dedup + tombstone path. Previously each path keyed
// differently (date_note(100), date_status, date||status||note, date_note(80)),
// so an entry deduped by one path was re-admitted by another. A Gmail email is
// uniquely identified by its gmailId; everything else falls back to a normalized
// date+status+note. Note normalization strips the trailing "✓" that
// autoCompletePastMeetings used to append, so a re-imported email and its
// auto-completed copy collapse to the same key.
export function normalizeNoteForKey(note = '') {
  return (note || '')
    .replace(/\s*✓\s*$/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

export function historyEntryKey(entry) {
  if (!entry) return ''
  if (entry.gmailId) return `gmail:${entry.gmailId}`
  const date = (entry.date || '').toString()
  return `${date}||${entry.status || ''}||${normalizeNoteForKey(entry.note)}`
}

// Track deleted history entries so they can never be re-imported from Supabase
// or re-added by the additive poll merge. Keyed by jobId + canonical entry key.
export function isDeletedHistoryEntry(jobId, entry) {
  const deleted = JSON.parse(localStorage.getItem(DELETED_HISTORY_ENTRIES_KEY) || '[]')
  return deleted.includes(`${jobId}::${historyEntryKey(entry)}`)
}

export function markHistoryEntryAsDeleted(jobId, entry) {
  const deleted = JSON.parse(localStorage.getItem(DELETED_HISTORY_ENTRIES_KEY) || '[]')
  const key = `${jobId}::${historyEntryKey(entry)}`
  if (!deleted.includes(key)) {
    deleted.push(key)
    // Keep only last 1000 deletions to prevent localStorage overflow
    if (deleted.length > 1000) deleted.splice(0, 100)
    localStorage.setItem(DELETED_HISTORY_ENTRIES_KEY, JSON.stringify(deleted))
  }
}

// Drop any tombstoned entries from a history array (used in every merge path).
export function filterDeletedHistory(jobId, history) {
  if (!Array.isArray(history) || history.length === 0) return history
  const deleted = JSON.parse(localStorage.getItem(DELETED_HISTORY_ENTRIES_KEY) || '[]')
  if (deleted.length === 0) return history
  const deletedSet = new Set(deleted)
  return history.filter(entry => !deletedSet.has(`${jobId}::${historyEntryKey(entry)}`))
}

// Keep old functions for backwards compatibility with auto-refresh
export function isDeletedJob(company, position) {
  // Legacy: company/position-based deletion (for Gmail re-import)
  const deleted = JSON.parse(localStorage.getItem('jobtrackr_deleted_jobs') || '[]')
  const normalized = `${normalizeCompany(company)}_${(position || '').toLowerCase().trim()}`
  return deleted.includes(normalized)
}

function markJobAsDeleted(company, position) {
  const deleted = JSON.parse(localStorage.getItem('jobtrackr_deleted_jobs') || '[]')
  const normalized = `${normalizeCompany(company)}_${(position || '').toLowerCase().trim()}`
  if (!deleted.includes(normalized)) {
    deleted.push(normalized)
    localStorage.setItem('jobtrackr_deleted_jobs', JSON.stringify(deleted))
  }
}

// Check if a job with same company+position already exists (for form validation)
export function findDuplicateJob(jobs, company, position) {
  const targetCo = normalizeCompany(company)
  const targetPos = (position || '').toLowerCase().trim()

  for (const job of jobs) {
    const jobCo = normalizeCompany(job.company)
    if (jobCo !== targetCo) continue

    const jobPos = (job.position || '').toLowerCase().trim()
    if (jobPos === targetPos) return job

    // Also check for generic positions (if both are generic, consider it same)
    if (GENERIC_POSITIONS_SET.has(targetPos) && GENERIC_POSITIONS_SET.has(jobPos)) return job
  }

  return null
}

// NOTE: The legacy syncLocalJobsToSupabase() full fetch+upload was retired in
// favour of a single sync path: SyncCoordinator → pollManager.poll() (fetch+merge,
// first poll is a full sync) + syncManager (per-mutation push + one-time
// pushAllJobs bulk upload on coordinator init). Running both paths in parallel
// caused the races behind the doublon / deleted-history bugs.

// Main hook
export function useJobs() {
  const [rawJobs, setJobs] = useState([])
  const [settingsKey, setSettingsKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const saveTimeoutRef = useRef(null)

  // Load from IndexedDB on mount + when synced from other devices
  useEffect(() => {
    const loadJobs = async () => {
      try {
        // Clear old/broken deletion tracking on first load to prevent stale deletions
        const deletedKey = DELETED_HISTORY_ENTRIES_KEY
        const stored = localStorage.getItem(deletedKey)
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            if (!Array.isArray(parsed) || parsed.length === 0) {
              localStorage.removeItem(deletedKey)
              console.log('🧹 Cleared empty/invalid deleted entries tracking')
            }
          } catch (e) {
            localStorage.removeItem(deletedKey)
            console.log('🧹 Cleared corrupted deleted entries tracking')
          }
        }

        await indexeddb.init()
        const cachedJobs = await indexeddb.getAllJobs()

        // Validate jobs don't contain corrupted oversized data
        // (prevents allocation overflow from huge notes/history)
        const isValidJob = (job) => {
          try {
            const notes = job.notes || ''
            const history = job.history || []
            // Reject jobs with notes > 1MB or history > 5000 entries (very conservative)
            // These are extreme thresholds that only catch truly corrupted data
            if (notes.length > 1048576) {
              console.warn(`Job ${job.id} has oversized notes (${notes.length} chars), clearing`)
              return false
            }
            if (history.length > 5000) {
              console.warn(`Job ${job.id} has oversized history (${history.length} entries), clearing`)
              return false
            }
            return true
          } catch {
            return false
          }
        }

        const validJobs = (cachedJobs || []).filter(isValidJob)
        if (validJobs.length < (cachedJobs?.length || 0)) {
          console.warn(`Filtered out corrupted jobs. Before: ${cachedJobs?.length}, After: ${validJobs.length}`)
          console.warn('⚠️ IMPORTANT: Corrupted data detected. Force syncing to Supabase before clearing...')

          // Back up ALL cached jobs (including corrupted ones) to Supabase before
          // clearing, so corrupted records aren't lost permanently.
          try {
            const syncUserId = await resolveSyncUserId().catch(() => getSyncUserIdForSupabase())
            if (cachedJobs && cachedJobs.length > 0) {
              console.log('📤 Backing up', cachedJobs.length, 'jobs to Supabase before clearing...')
              await syncManager.pushAllJobs(syncUserId, cachedJobs)
            }
          } catch (e) {
            console.warn('Failed to backup to Supabase:', e)
          }

          // NOW clear the corrupted data from IndexedDB after sync attempt
          try {
            await indexeddb.clear()
          } catch (e) {
            console.warn('Failed to clear IndexedDB:', e)
          }
        }

        // Ensure all loaded jobs have sorted history
        let sortedJobs = validJobs.map(job => sortJobHistory(job))

        // Drop tombstoned entries, then deduplicate semantic duplicates
        sortedJobs = sortedJobs.map(job => {
          if (!job.history || job.history.length <= 1) return job

          const filtered = filterDeletedHistory(job.id, job.history)
          const deduped = deduplicateHistory([{ ...job, history: filtered }])[0].history
          if (deduped.length < job.history.length) {
            console.log(`📊 Deduped ${job.company}: ${job.history.length} → ${deduped.length} entries`)
          }
          return { ...job, history: deduped }
        })

        setJobs(sortedJobs)
      } catch (err) {
        console.error('Failed to load jobs from IndexedDB:', err)
        // On allocation error, clear IndexedDB and retry
        if (err.message?.includes('allocation') || err.name === 'RangeError') {
          console.warn('⚠ Allocation error detected, clearing IndexedDB...')
          try {
            await indexeddb.clear()
          } catch (e) {
            console.error('Failed to clear IndexedDB:', e)
          }
        }
        setJobs([])
      } finally {
        setLoading(false)
      }
    }
    loadJobs()

    // Listen for data sync events from polling (multi-device sync)
    const handleSync = (event) => {
      console.log('Data synced from Supabase, reloading...', event.detail)
      loadJobs().then(() => {
        // Auto-reconcile after sync: physically remove duplicate rows (not just
        // hide them) so they don't return on the next poll.
        console.log('🔄 Auto-reconciling duplicate jobs after sync...')
        setJobs(prev => reconcileDuplicateJobs(prev))
      })
    }
    window.addEventListener('jobtrackr:datasync', handleSync)

    // Remote fetch + upload is owned entirely by the SyncCoordinator
    // (initialized in App.jsx once the user is logged in): its first poll does a
    // full fetch+merge and fires `jobtrackr:datasync`, which loadJobs() above
    // reacts to. No separate sync kick-off needed here anymore.

    return () => window.removeEventListener('jobtrackr:datasync', handleSync)
  }, [])

  // One-time cleanup: consolidate same-day same-topic history entries on already
  // stored jobs and re-sync the merged result to Supabase. Guarded by a version
  // flag so it runs once. Future refreshes keep history clean via useAutoRefresh.
  useEffect(() => {
    if (loading || rawJobs.length === 0) return
    const FLAG = 'jobtrackr_topic_merge_v1'
    if (localStorage.getItem(FLAG)) return
    localStorage.setItem(FLAG, '1')

    const coordinator = getSyncCoordinator()
    const merged = []
    for (const job of rawJobs) {
      if (!job.history || job.history.length <= 1) continue
      const newHistory = mergeHistoryBySameDayTopic(job.history)
      if (newHistory.length >= job.history.length) continue
      const updated = { ...job, history: newHistory, updated_at: new Date().toISOString() }
      merged.push(updated)
      indexeddb.saveJob(updated).catch(err => console.warn('topic-merge local save failed:', err))
      if (coordinator) {
        coordinator.mutate('jobs', 'update', updated, { syncHistory: true })
          .catch(err => console.error('topic-merge re-sync failed:', err))
      }
    }
    if (merged.length > 0) {
      const byId = new Map(merged.map(j => [j.id, j]))
      setJobs(prev => prev.map(j => byId.get(j.id) || j))
      console.log(`🧹 Topic-merge cleanup: consolidated history for ${merged.length} job(s)`)
    }
  }, [loading, rawJobs])

  // Apply processing pipeline: dedup jobs first, then history, then archive validation
  const jobs = useMemo(() => {
    try {
      return deduplicateJobs(deduplicateHistory(autoStale(rawJobs)))
    } catch (err) {
      console.error('❌ Error in jobs processing pipeline:', err)
      // If allocation error during processing, return raw jobs unprocessed
      if (err.message?.includes('allocation') || err.name === 'RangeError') {
        console.warn('⚠ Allocation error in pipeline, returning unprocessed jobs')
        return rawJobs
      }
      throw err
    }
  }, [rawJobs, settingsKey])

  // Debounce IndexedDB saves to avoid blocking on every mutation
  useEffect(() => {
    if (loading) return

    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      indexeddb.saveJobs(jobs).catch(err => console.error('Failed to save jobs:', err))
    }, 500)

    return () => clearTimeout(saveTimeoutRef.current)
  }, [jobs, loading])

  // Listen for settings changes to re-evaluate archives
  useEffect(() => {
    const handleSettingsChange = () => {
      setSettingsKey(k => k + 1)
    }
    window.addEventListener('jobtrackr-settings-changed', handleSettingsChange)
    return () => window.removeEventListener('jobtrackr-settings-changed', handleSettingsChange)
  }, [])

  // Mutations using syncManager for offline support
  const addJob = (data) => {
    const status = (data.status === 'rejected' && isAtsRejection(data.notes || '', data._fromEmail || ''))
      ? 'rejected_ats'
      : data.status

    let historyNote = data.notes || 'Offre ajoutée'
    if (status === 'todo') {
      historyNote = data.url
        ? `Offre trouvée — prête à postuler`
        : 'Offre ajoutée — à postuler'
    }

    let positionLinks = []
    if (data._emailBody) {
      const allUrls = extractUrlsFromEmail(data._emailBody)
      const ranked = rankUrlsByJobRelevance(allUrls)
      positionLinks = ranked.slice(0, 3)
    }

    const job = {
      ...data,
      status,
      id: crypto.randomUUID(),
      updated_at: new Date().toISOString(),
      sentAt: ['sent','reviewing','waiting'].includes(status) ? (data.date || new Date().toISOString().split('T')[0]) : undefined,
      positionLinks: positionLinks || [],
      positionChecks: {},
      history: data._history || [{
        date: data.date,
        status,
        note: historyNote,
        offerUrl: status === 'todo' ? (data.url || '') : undefined,
        showCVButton: status === 'todo',
        gmailId: data._gmailId || undefined,
        from: data._fromEmail || undefined,
        fromMe: data._fromMe || false,
        source: data._gmailId ? 'email' : undefined,
      }]
    }
    delete job._gmailId
    delete job._fromEmail
    delete job._fromMe
    delete job._history
    delete job._emailBody

    setJobs(prev => [job, ...prev])

    // Sync to coordinator if available, otherwise will sync on next batch
    const coordinator = getSyncCoordinator()
    if (coordinator) {
      coordinator.mutate('jobs', 'insert', job).catch(err => console.error('Failed to sync job:', err))
    } else {
      // Fallback: save to IndexedDB immediately so it syncs on next auto-sync
      indexeddb.saveJob(job).catch(err => console.warn('Failed to save job to IndexedDB:', err))
    }
    return job
  }

  const updateJob = (id, data) => {
    // Extract job BEFORE state update to avoid race condition
    const job = jobs.find(j => j.id === id)
    if (!job) return

    // If history shrank, tombstone the removed entries so the additive poll
    // merge / Supabase re-fetch can never resurrect them. Without this, a
    // deleted timeline entry reappears on the next sync (Bug: "deleted on
    // historic not working").
    if (data.history && Array.isArray(job.history)) {
      const newKeys = new Set(data.history.map(historyEntryKey))
      for (const oldEntry of job.history) {
        if (!newKeys.has(historyEntryKey(oldEntry))) {
          markHistoryEntryAsDeleted(id, oldEntry)
        }
      }
    }

    const updated = { ...job, ...data, updated_at: new Date().toISOString() }
    const final = data.history ? sortJobHistory(updated) : updated

    // Update local state
    setJobs(prev => prev.map(j => j.id !== id ? j : final))

    // Save to IndexedDB immediately (fallback if coordinator not ready)
    indexeddb.saveJob(final).catch(err => console.warn('Failed to save job:', err))

    // Sync to Supabase. Only rewrite remote history when this update actually
    // touched history — otherwise we needlessly delete+reinsert the whole timeline.
    const coordinator = getSyncCoordinator()
    if (coordinator) {
      coordinator.mutate('jobs', 'update', final, { syncHistory: !!data.history })
        .catch(err => console.error('Failed to sync job:', err))
    }
  }

  const deleteJob = (id) => {
    const job = jobs.find(j => j.id === id)
    if (job) {
      // Track deletion by ID to prevent re-sync from remote
      markJobIdAsDeleted(id)
      // Also track by company/position for Gmail re-import prevention
      markJobAsDeleted(job.company, job.position)
    }
    setJobs(prev => prev.filter(j => j.id !== id))
    const coordinator = getSyncCoordinator()
    if (coordinator) {
      coordinator.mutate('jobs', 'delete', { id }).catch(err => console.error('Failed to sync deletion:', err))
    }
  }

  const updateStatus = (id, status) => {
    const job = jobs.find(j => j.id === id)
    if (!job || job.status === status) return

    const st = STATUSES.find(s => s.key === status)
    const newJob = sortJobHistory({
      ...job,
      status,
      updated_at: new Date().toISOString(),
      history: [...(job.history || []), {
        date: new Date().toISOString().split('T')[0],
        status,
        note: st ? `Statut mis à jour → ${st.label}` : 'Statut mis à jour',
      }]
    })

    setJobs(prev => prev.map(j => j.id !== id ? j : newJob))

    const coordinator = getSyncCoordinator()
    if (coordinator) {
      coordinator.mutate('jobs', 'update', newJob).catch(err => console.error('Failed to sync status:', err))
    }
  }

  const addHistoryEntry = (id, entry) => {
    const job = jobs.find(j => j.id === id)
    if (!job) return

    // Resolve history entry status if interview is in the past, but don't change job status
    const entryDate = new Date(entry.date)
    const isPast = entryDate < new Date()
    const entryStatusResolved = entry.status === 'interview' && isPast ? 'done' : entry.status

    const newJob = sortJobHistory({
      ...job,
      updated_at: new Date().toISOString(),
      history: [...(job.history || []), { ...entry, status: entryStatusResolved }]
    })

    setJobs(prev => prev.map(j => j.id !== id ? j : newJob))

    const coordinator = getSyncCoordinator()
    if (coordinator) {
      coordinator.mutate('jobs', 'update', newJob).catch(err => console.error('Failed to sync history:', err))
    }
  }

  const markEnriched = (id) => {
    const job = jobs.find(j => j.id === id)
    if (!job) return

    const updated = { ...job, enrichedAt: new Date().toISOString() }
    setJobs(prev => prev.map(j => j.id === id ? updated : j))

    const coordinator = getSyncCoordinator()
    if (coordinator) {
      coordinator.mutate('jobs', 'update', updated, { syncHistory: false }).catch(err => console.error('Failed to sync enrichment:', err))
    }
  }

  const clearEnriched = (id) => {
    const job = jobs.find(j => j.id === id)
    if (!job) return

    const updated = { ...job, enrichedAt: undefined }
    setJobs(prev => prev.map(j => j.id === id ? updated : j))

    const coordinator = getSyncCoordinator()
    if (coordinator) {
      coordinator.mutate('jobs', 'update', updated, { syncHistory: false }).catch(err => console.error('Failed to sync enrichment clear:', err))
    }
  }

  const mergeDuplicates = () => {
    setJobs(prev => reconcileDuplicateJobs(prev))
  }

  const toggleFavorite = (id) => {
    const currentJob = jobs.find(j => j.id === id)
    if (!currentJob) return

    const newFavoriteValue = !currentJob.favorite
    const updated = { ...currentJob, favorite: newFavoriteValue, updated_at: new Date().toISOString() }

    setJobs(prev => prev.map(j => j.id === id ? updated : j))

    console.log('Toggling favorite:', id, 'new value:', updated.favorite)
    const coordinator = getSyncCoordinator()
    if (coordinator) {
      coordinator.mutate('jobs', 'update', updated, { syncHistory: false }).catch(err => console.error('Failed to sync favorite:', err))
    }
  }

  const clearAllJobs = async () => {
    // Mark all current jobs as deleted to prevent re-sync
    rawJobs.forEach(job => {
      markJobIdAsDeleted(job.id)
      markJobAsDeleted(job.company, job.position)
    })

    // Clear IndexedDB immediately (before Supabase to prevent re-sync from restoring)
    try {
      await indexeddb.clearJobs()
      console.log('✓ Cleared IndexedDB')
    } catch (err) {
      console.error('Failed to clear IndexedDB:', err.message)
    }

    // Clear local state
    setJobs([])

    // Delete all jobs from Supabase for this user
    try {
      const syncUserId = await resolveSyncUserId()
      if (syncUserId && isSupabaseConfigured()) {
        console.log('Deleting all jobs from Supabase for user:', syncUserId)
        const { error, count } = await supabase
          .from('jobs')
          .delete()
          .eq('user_id', syncUserId)

        if (error) {
          console.error('Failed to delete jobs from Supabase:', error)
        } else {
          console.log('✓ All jobs deleted from Supabase (count:', count, ')')
        }
      }
    } catch (err) {
      console.error('Failed to delete jobs from Supabase:', err.message)
    }
  }

  const reprocessJobs = () => {
    setJobs(prev => {
      const revalidated = revalidateArchives(prev)
      // Skip mergeSameDateEntries - it was causing pipe concatenation of history entries
      // Keep history entries separate per date/status combination
      const processed = autoStale(deduplicateJobs(splitPipeNotes(deduplicateHistory(revalidated))))

      return processed.map(job => {
        const hasHelloWorkResponse = (job.notes || '').includes('Réponse reçue de l\'entreprise via HelloWork') ||
                                     (job.notes || '').includes('Response received from company')
        const hasPositiveKeywords = /entretien|interview|call|visio|meeting|next steps|interested|pleased/i.test(job.notes || '')

        if (hasHelloWorkResponse && !hasPositiveKeywords && job.status === 'reviewing') {
          return { ...job, status: 'rejected' }
        }
        return job
      })
    })
  }

  const checkPosition = async (jobId, url) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return null

    const result = await checkPositionUrl(url)

    let updatedJob = {
      ...job,
      positionChecks: {
        ...(job.positionChecks || {}),
        [url]: result
      }
    }

    if (result.available === false && !['rejected', 'rejected_ats', 'cancelled', 'archived'].includes(job.status)) {
      updatedJob = {
        ...updatedJob,
        status: 'rejected',
        history: [
          ...(job.history || []),
          {
            date: new Date().toISOString().split('T')[0],
            status: 'rejected',
            note: `🔍 Poste fermé — détecté: ${result.reason || 'Position not available'}`,
          }
        ]
      }
    }

    setJobs(prev => prev.map(j => j.id !== jobId ? j : updatedJob))

    const coordinator = getSyncCoordinator()
    if (coordinator) {
      coordinator.mutate('jobs', 'update', updatedJob).catch(err => console.error('Failed to sync position check:', err))
    }

    return result
  }

  const checkAllPositions = async (jobId, topN = 1) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job || !job.positionLinks?.length) return []

    const urlsToCheck = job.positionLinks.slice(0, topN)
    const results = []
    for (const url of urlsToCheck) {
      const result = await checkPosition(jobId, url)
      results.push(result)
    }
    return results
  }

  const clearDeletedJobs = () => {
    localStorage.removeItem(DELETED_JOB_IDS_KEY)
    console.log('✓ Cleared deleted jobs list — auto-refresh will re-import them')
  }

  const cleanupHistoryDuplicates = () => {
    console.log('🧹 Starting history cleanup for all jobs...')
    let cleanedCount = 0

    setJobs(prev => {
      const cleaned = prev.map(job => {
        if (!job.history || job.history.length <= 1) return job

        const originalLength = job.history.length
        const deduped = deduplicateHistory([job])[0].history

        if (deduped.length < originalLength) {
          cleanedCount++
          console.log(`  ✓ ${job.company}: ${originalLength} → ${deduped.length} entries`)
          return { ...job, history: deduped, updated_at: new Date().toISOString() }
        }
        return job
      })

      console.log(`✓ Cleanup complete: ${cleanedCount} jobs cleaned`)
      return cleaned
    })

    // Re-sync all jobs to Supabase
    const coordinator = getSyncCoordinator()
    if (coordinator) {
      setTimeout(() => {
        console.log('📤 Re-syncing cleaned jobs to Supabase...')
        jobs.forEach(job => {
          coordinator.mutate('jobs', 'update', job).catch(err => console.error('Failed to sync:', err))
        })
      }, 500)
    }
  }

  const deduplicateViaServer = async () => {
    try {
      console.log('📤 Calling server-side deduplication...')
      const result = await deduplicateJobsViaEdgeFunction()
      console.log(formatDeduplicateResult(result))

      // Reload jobs after server-side dedup
      const coordinator = getSyncCoordinator()
      if (coordinator) {
        setTimeout(() => coordinator.poll(), 1000)
      }

      return result
    } catch (error) {
      console.error('Server deduplication failed:', error)
      throw error
    }
  }

  return { jobs, addJob, updateJob, deleteJob, clearAllJobs, updateStatus, addHistoryEntry, mergeDuplicates, toggleFavorite, markEnriched, clearEnriched, reprocessJobs, checkPosition, checkAllPositions, clearDeletedJobs, cleanupHistoryDuplicates, deduplicateViaServer, loading, findDuplicateInList: (co, pos) => findDuplicateJob(jobs, co, pos) }
}
