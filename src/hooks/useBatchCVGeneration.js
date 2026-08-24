import { useMemo, useRef, useState } from 'react'
import { TrialExhaustedError } from '../services/apiKey'
import { generateCVForJob } from '../services/cvGeneration'

// Shared batch CV-generation engine. Runs `generateCVForJob` sequentially over a
// set of target candidatures, tracking per-job status + overall progress, and
// saves each generated CV straight onto the job via `onUpdateJob`.
//
// Extracted from BatchCVGenerator so BOTH entry points — the Settings panel
// ("generate for every application without a CV") and the selection-driven modal
// ("generate for the rows I ticked") — share the exact same run logic and error
// handling (TrialExhaustedError stops the whole batch, NO_JD marks a row skipped).
export function useBatchCVGeneration({ onUpdateJob, t = (k) => k }) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState({}) // id -> { status, atsScore, error }
  const [batchError, setBatchError] = useState(null)
  const cancelRef = useRef(false)

  const run = async ({ targets = [], baseCV, language = 'auto', template = 'standard', skillsMode = 'none' }) => {
    if (!baseCV || targets.length === 0) return

    setRunning(true)
    setBatchError(null)
    cancelRef.current = false
    setProgress({ done: 0, total: targets.length })
    setResults(Object.fromEntries(targets.map(j => [j.id, { status: 'pending' }])))

    for (const job of targets) {
      if (cancelRef.current) break
      setResults(prev => ({ ...prev, [job.id]: { status: 'running' } }))
      try {
        const { markdown, atsScore, filename } = await generateCVForJob({
          job, cvText: baseCV.text, language, template, skillsMode,
        })
        onUpdateJob(job.id, {
          cvSaved: { markdown, template, filename, savedAt: new Date().toISOString(), atsScore: atsScore ?? null },
        })
        setResults(prev => ({ ...prev, [job.id]: { status: 'done', atsScore } }))
      } catch (err) {
        if (err instanceof TrialExhaustedError || err?.code === 'TRIAL_EXHAUSTED') {
          // Shared-key free trial spent — stop the whole batch and prompt for a key.
          setResults(prev => ({ ...prev, [job.id]: { status: 'error', error: 'trial' } }))
          setBatchError(t('batchCV.trialExhausted'))
          break
        }
        if (err?.code === 'NO_JD') {
          setResults(prev => ({ ...prev, [job.id]: { status: 'skipped' } }))
        } else {
          setResults(prev => ({ ...prev, [job.id]: { status: 'error', error: err?.message || 'error' } }))
        }
      }
      setProgress(prev => ({ ...prev, done: prev.done + 1 }))
    }
    setRunning(false)
  }

  const stop = () => { cancelRef.current = true }
  const reset = () => { setResults({}); setProgress({ done: 0, total: 0 }); setBatchError(null) }

  const resultCounts = useMemo(() => {
    const vals = Object.values(results)
    return {
      done: vals.filter(r => r.status === 'done').length,
      skipped: vals.filter(r => r.status === 'skipped').length,
      error: vals.filter(r => r.status === 'error').length,
    }
  }, [results])
  const finished = !running && progress.total > 0 && progress.done >= progress.total
  const anyResult = Object.keys(results).length > 0

  return { run, stop, reset, running, progress, results, batchError, finished, anyResult, resultCounts }
}
