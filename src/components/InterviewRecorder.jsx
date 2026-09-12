import { useState, useRef, useEffect } from 'react'
import { CLAUDE_MODEL } from '../constants/aiModel'
import { aiFetch } from '../services/apiKey'
import { transcribeBlob, canRecordAudio } from '../services/localSpeech'
import { parseAnalysisJson } from '../services/rejectionAnalysis'

// Real-interview recorder.
// Captures a live Meet/Zoom call by sharing the call tab's audio + the mic, mixes
// them, transcribes locally with Whisper (no API key / no per-minute cost — same
// engine the mock interview uses), then runs the recruiter analysis and hands the
// finished session back to the candidature's Interview tab.
//
// A paste-transcript path is offered as a fallback for when audio capture isn't
// available (e.g. the native Zoom app, or the user copies Meet's live captions).
export default function InterviewRecorder({ job, cv = '', onClose, onComplete }) {
  const [stage, setStage] = useState('idle')  // idle | recording | transcribing | analyzing | error
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)

  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamsRef = useRef([])
  const audioCtxRef = useRef(null)
  const timerRef = useRef(null)
  const mountedRef = useRef(true)

  const cleanup = () => {
    clearInterval(timerRef.current); timerRef.current = null
    streamsRef.current.forEach(s => s?.getTracks().forEach(t => t.stop()))
    streamsRef.current = []
    try { audioCtxRef.current?.close() } catch { /* already closed */ }
    audioCtxRef.current = null
  }
  useEffect(() => () => { mountedRef.current = false; cleanup() }, [])

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const startRecording = async () => {
    setError('')
    if (!canRecordAudio()) { setError('This browser cannot record audio. Use the paste-transcript option instead.'); setShowPaste(true); return }

    let displayStream = null, micStream = null
    try { displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }) } catch { /* declined / unsupported */ }
    try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { /* mic blocked */ }

    const displayHasAudio = !!displayStream && displayStream.getAudioTracks().length > 0
    if (!displayHasAudio && !micStream) {
      displayStream?.getTracks().forEach(t => t.stop())
      setError('No audio captured. Share the call tab with "Share tab audio" checked, or allow the microphone.')
      setShowPaste(true)
      return
    }

    streamsRef.current = [displayStream, micStream].filter(Boolean)
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioCtx(); audioCtxRef.current = ctx
    const dest = ctx.createMediaStreamDestination()
    if (displayHasAudio) ctx.createMediaStreamSource(new MediaStream(displayStream.getAudioTracks())).connect(dest)
    if (micStream) ctx.createMediaStreamSource(micStream).connect(dest)

    chunksRef.current = []
    const recorder = new MediaRecorder(dest.stream)
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = onRecorded
    recorderRef.current = recorder
    recorder.start()

    // If the user stops sharing the tab from the browser bar, end the recording.
    displayStream?.getVideoTracks()[0]?.addEventListener('ended', () => stopRecording())

    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed((v) => v + 1), 1000)
    setStage('recording')
  }

  const stopRecording = () => {
    clearInterval(timerRef.current); timerRef.current = null
    try { recorderRef.current?.stop() } catch { /* already stopped */ }
  }

  const onRecorded = async () => {
    // Stop mic/tab capture now that we have the audio.
    streamsRef.current.forEach(s => s?.getTracks().forEach(t => t.stop()))
    streamsRef.current = []
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    if (!blob.size) { setError('No audio was recorded.'); setStage('error'); return }

    setStage('transcribing'); setProgress(0)
    try {
      const text = await transcribeBlob(blob, navigator.language, (p) => {
        if (p && p.progress != null && mountedRef.current) setProgress(Math.round(p.progress))
      })
      if (!mountedRef.current) return
      if (!text || !text.trim()) { setError('Transcription came back empty. Try again, or paste the transcript.'); setShowPaste(true); setStage('error'); return }
      await analyze(text)
    } catch (e) {
      setError('Transcription failed: ' + e.message); setShowPaste(true); setStage('error')
    }
  }

  const analyze = async (text) => {
    setStage('analyzing'); setError('')
    try {
      const descContext = job.description ? `\nJob description: ${job.description.slice(0, 600)}` : ''
      const cvContext = cv ? `\n\nCandidate CV: ${cv.slice(0, 600)}` : ''
      const prompt = `You are a senior career coach reviewing the transcript of a REAL job interview the candidate had for a ${job.position || 'role'} at ${job.company || 'a company'}. The transcript may not label who is speaking.${descContext}${cvContext}

Interview transcript:
${text.slice(0, 12000)}

Give honest, specific, actionable feedback to help the candidate improve. Provide:
1. Hire read: would a recruiter move this candidate forward? (Yes/No/Maybe with score 0-100)
2. Strengths (2-3 bullet points)
3. Concerns or weak moments (2-3 bullet points)
4. One specific weak answer: quote it and explain what was missing
5. A stronger way to answer it

Be direct and realistic. Write the feedback text in the same language as the transcript. Keep the JSON keys in English and hire_decision as one of Yes/No/Maybe.

Format as JSON with keys: hire_decision, score, strengths, concerns, weak_example, better_answer`

      const response = await aiFetch('/api/claude', {
        model: CLAUDE_MODEL, max_tokens: 900,
        messages: [{ role: 'user', content: prompt }]
      })
      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json()
      if (!mountedRef.current) return
      const analysisText = data.content?.[0]?.text || ''
      let analysis
      try { analysis = parseAnalysisJson(analysisText) } catch { analysis = { raw: analysisText } }

      onComplete?.({
        type: 'interview',
        kind: 'real',
        date: new Date().toISOString(),
        durationSeconds: elapsed,
        transcriptText: text,
        transcript: [{ role: 'transcript', text }],
        score: analysis.score,
        hire_decision: analysis.hire_decision,
        feedback: analysis
      })
    } catch (e) {
      setError('Analysis failed: ' + e.message)
      setStage('error')
    }
  }

  const btn = 'px-4 py-2 rounded-lg text-sm font-semibold'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={stage === 'recording' ? undefined : onClose}>
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">🎙️ Record real interview</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {stage === 'idle' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Records your live Meet/Zoom call and analyzes it. When prompted, pick the call tab and tick <b>Share tab audio</b> — your mic is added automatically.
            </p>
            <button className={`${btn} w-full bg-red-500 hover:bg-red-600 text-white`} onClick={startRecording}>● Start recording</button>
            <button className="text-xs text-indigo-600 hover:underline w-full text-center" onClick={() => setShowPaste(v => !v)}>
              {showPaste ? 'Hide paste option' : 'Paste a transcript instead'}
            </button>
          </div>
        )}

        {stage === 'recording' && (
          <div className="space-y-4 text-center">
            <div className="text-3xl font-bold text-red-500 tabular-nums">{fmt(elapsed)}</div>
            <p className="text-xs text-gray-500 flex items-center justify-center gap-2">
              <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-ping"></span> Recording…
            </p>
            <button className={`${btn} w-full bg-green-600 hover:bg-green-700 text-white`} onClick={stopRecording}>■ Stop & analyze</button>
          </div>
        )}

        {stage === 'transcribing' && (
          <div className="space-y-2 text-center py-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">Transcribing locally…</p>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="text-xs text-gray-400">First run downloads the speech model (~200&nbsp;MB, cached after).</p>
          </div>
        )}

        {stage === 'analyzing' && (
          <p className="text-sm text-gray-700 dark:text-gray-300 text-center py-6">Analyzing the interview…</p>
        )}

        {stage === 'error' && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}

        {(showPaste || stage === 'error') && stage !== 'recording' && stage !== 'transcribing' && stage !== 'analyzing' && (
          <div className="mt-4 space-y-2">
            {error && stage === 'idle' && <p className="text-xs text-red-600">{error}</p>}
            <textarea
              value={paste} onChange={(e) => setPaste(e.target.value)} rows={5}
              placeholder="Paste the interview transcript here (e.g. copied from Meet captions)…"
              className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-2"
            />
            <button
              className={`${btn} w-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40`}
              disabled={!paste.trim()}
              onClick={() => analyze(paste.trim())}
            >Analyze transcript</button>
          </div>
        )}
      </div>
    </div>
  )
}
