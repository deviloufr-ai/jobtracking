import { useState, useEffect, useRef } from 'react'
import { CLAUDE_MODEL } from '../constants/aiModel'
import AIPanelBoundary from './AIPanelBoundary'
import { aiFetch } from '../services/apiKey'
import { transcribeBlob, canRecordAudio } from '../services/localSpeech'
import { deliverText } from '../services/fileSave'
import { trackMockInterviewCompleted } from '../services/analytics'
import { useDragDock } from '../hooks/useDragDock'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition as NativeSpeech } from '@capacitor-community/speech-recognition'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
const speechSynthesis = window.speechSynthesis

// Voice input has three backends, chosen at runtime:
//   • Native Android shell   → Android's own speech-to-text via the
//     @capacitor-community/speech-recognition plugin (NativeSpeech). No 200 MB
//     model download, and the plugin manages the RECORD_AUDIO permission itself.
//     The WebView exposes neither Web Speech recognition nor a usable getUserMedia
//     mic grant, so this is the only path that works inside the app.
//   • Chrome/Edge on the web → the Web Speech API (SpeechRecognition below).
//   • Firefox/Safari on web  → record the mic and transcribe with a local WASM
//     Whisper model (localSpeech.js).
const isNativeShell = Boolean(Capacitor?.isNativePlatform?.())

// Languages the mock interview can be run in. `code` is the BCP-47 tag used for
// speech recognition + synthesis; `ai` is the English language name injected
// into the Claude prompt so the interviewer asks its questions in that language.
const LANGUAGES = [
  { code: 'fr-FR', label: 'Français', ai: 'French' },
  { code: 'en-US', label: 'English', ai: 'English' },
  { code: 'es-ES', label: 'Español', ai: 'Spanish' },
  { code: 'de-DE', label: 'Deutsch', ai: 'German' },
  { code: 'it-IT', label: 'Italiano', ai: 'Italian' },
  { code: 'pt-PT', label: 'Português', ai: 'Portuguese' },
  { code: 'nl-NL', label: 'Nederlands', ai: 'Dutch' },
  { code: 'ja-JP', label: '日本語', ai: 'Japanese' },
]

// English name of a language code, for the AI prompt. Falls back to English.
const aiLangName = (code) => LANGUAGES.find((l) => l.code === code)?.ai || 'English'

// Default interview language: follow the app's UI language (jobtrackr_language),
// then the browser locale, then English.
function defaultInterviewLang() {
  try {
    const appLang = localStorage.getItem('jobtrackr_language')
    if (appLang) {
      const byApp = LANGUAGES.find((l) => l.code.startsWith(appLang))
      if (byApp) return byApp.code
    }
    const bl = (navigator.language || '').slice(0, 2)
    const byBrowser = LANGUAGES.find((l) => l.code.startsWith(bl))
    if (byBrowser) return byBrowser.code
  } catch {
    /* noop */
  }
  return 'en-US'
}

// Strip markdown formatting for cleaner speech output
function stripFormatting(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
    .replace(/\*(.+?)\*/g, '$1')    // Remove italics
    .replace(/___(.+?)___/g, '$1')  // Remove bold italics
    .replace(/__(.+?)__/g, '$1')    // Remove bold
    .replace(/_(.+?)_/g, '$1')      // Remove italics
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
    .replace(/^[-*+] /gm, '')       // Remove bullet points
    .replace(/^### /gm, '')         // Remove headers
    .replace(/^## /gm, '')
    .replace(/^# /gm, '')
    .replace(/---/g, '')            // Remove horizontal rules
    .replace(/`+(.+?)`+/g, '$1')    // Remove code blocks
    .trim()
}

export default function MockInterviewChatbot(props) {
  return (
    <AIPanelBoundary label="L'entretien blanc" onClose={props.onClose}>
      <MockInterviewChatbotPanel {...props} />
    </AIPanelBoundary>
  )
}

function MockInterviewChatbotPanel({ job, cv, round, roundName, roundFocus, onClose, onInterviewComplete }) {
  // Optional interview-level steering: when the caller trains for a specific round
  // (technical, manager, final…), roundFocus is the English instruction that makes
  // the interviewer focus on that level's content/approach. Blank = general.
  // Worded as a hard constraint so the AI truly runs THIS interview type and does
  // not drift into other stages' questions.
  const focusLine = roundFocus
    ? `\n\nINTERVIEW STAGE — You are conducting ONLY this specific interview stage: ${roundName ? `the "${roundName}" round. ` : ''}${roundFocus} Every question you ask must belong to this stage and match this focus; do NOT ask questions that belong to a different interview type (e.g. do not ask deep technical questions in a recruiter screen, or vice-versa).`
    : ''
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 672 })
  const [messages, setMessages] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [textAnswer, setTextAnswer] = useState('')
  const [speechRate, setSpeechRate] = useState(1)
  // The interview language (BCP-47). Drives speech recognition, text-to-speech,
  // and the language Claude conducts the interview in. User-selectable in the header.
  const [detectedLanguage, setDetectedLanguage] = useState(defaultInterviewLang)
  const [transcribing, setTranscribing] = useState(false)
  const [modelStatus, setModelStatus] = useState(null) // loader text while WASM model downloads
  const [feedback, setFeedback] = useState(null) // interview analysis & score
  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)
  const interviewIdRef = useRef(Date.now())
  // Track final vs. interim results separately so we accumulate all final
  // transcript parts instead of overwriting.
  const finalTranscriptRef = useRef('')
  // In-browser (WASM Whisper) fallback recording state
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const mediaStreamRef = useRef(null)
  // False once the modal has unmounted, so in-flight AI calls don't setState after teardown.
  const mountedRef = useRef(true)

  // Native Web Speech API (Chrome/Edge). When absent we fall back to recording
  // the mic and transcribing with a local WASM Whisper model (Firefox/Safari).
  // Web Speech API (Chrome/Edge) — desktop/web only; absent in the native WebView.
  const nativeSpeechSupported = !isNativeShell && Boolean(SpeechRecognition)
  // Voice is offered when we have a backend: the native plugin, the Web Speech API,
  // or mic recording for the WASM fallback.
  const voiceSupported = isNativeShell || nativeSpeechSupported || canRecordAudio()

  // Build (or rebuild) the speech recognition instance.
  // Returns the instance, or null if the browser can't provide one.
  const initRecognition = () => {
    if (!SpeechRecognition) {
      setError(
        'Speech recognition isn’t supported in this browser. Try Chrome or Edge for voice answers.'
      )
      return null
    }
    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = detectedLanguage

      recognition.onstart = () => setIsRecording(true)
      recognition.onend = () => setIsRecording(false)
      recognition.onerror = (e) => {
        setIsRecording(false)
        setError(`Speech error: ${e.error}`)
      }
      recognition.onresult = (e) => {
        let interim = ''
        // Accumulate all final results; show interim as a live preview.
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) {
            finalTranscriptRef.current += t + ' '
          } else {
            interim += t
          }
        }
        // Show the accumulated final transcript + any interim preview.
        const display = (finalTranscriptRef.current + interim).trim()
        setTranscript(display)
      }

      recognitionRef.current = recognition
      return recognition
    } catch (err) {
      recognitionRef.current = null
      setError(
        'Voice input couldn’t start in this browser. Try Chrome or Edge for voice answers.'
      )
      return null
    }
  }

  // Initialize the native recognizer when available (re-runs on language
  // change). When it's absent we silently rely on the WASM fallback instead
  // of surfacing a "not supported" error on load.
  useEffect(() => {
    if (nativeSpeechSupported) initRecognition()
    return () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        /* noop */
      }
    }
  }, [detectedLanguage])

  // Release the mic + stop any text-to-speech if the modal closes mid-session, and
  // mark unmounted so in-flight AI calls don't setState after teardown. Without the
  // speechSynthesis.cancel() the interviewer's voice kept talking after the modal closed.
  useEffect(() => {
    return () => {
      mountedRef.current = false
      try { speechSynthesis?.cancel() } catch { /* noop */ }
      try {
        mediaRecorderRef.current?.stop()
      } catch {
        /* noop */
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
      if (isNativeShell) {
        try { NativeSpeech.removeAllListeners() } catch { /* noop */ }
        try { NativeSpeech.stop() } catch { /* noop */ }
      }
    }
  }, [])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Start with first question on mount
  useEffect(() => {
    if (messages.length === 0 && !isLoading) {
      generateFirstQuestion()
    }
  }, [])

  const generateFirstQuestion = async (langCode = detectedLanguage) => {
    setIsLoading(true)
    setError(null)
    try {
      const descContext = job.description
        ? `\n\nJob description:\n${job.description.slice(0, 800)}`
        : ''
      const cvContext = cv ? `\n\nCandidate CV:\n${cv.slice(0, 800)}` : ''
      const langLine = `\n\nLANGUAGE — Conduct this entire interview in ${aiLangName(langCode)}. Ask every question in ${aiLangName(langCode)}, phrased naturally the way a native ${aiLangName(langCode)} speaker would.`
      const response = await aiFetch('/api/claude', {
        model: CLAUDE_MODEL,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `You are a senior recruiter at ${job.company} evaluating a candidate for a ${job.position} role. Ask ONE probing opening question that reveals their fit for the role and their thought process.${descContext}${cvContext}${focusLine}${langLine}

Connect the candidate's experience to the role. Be direct and realistic—ask what you'd actually ask in a real interview. Stay strictly within the interview focus above when one is given. Output ONLY the question as plain text. No formatting, no bold, no italics, no asterisks, no dashes, no bullet points. Just a natural, conversational question you'd ask if talking to someone in person.`
          }
        ]
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json()
      if (!mountedRef.current) return
      const rawQuestion = data.content[0]?.text || 'Tell me about your experience.'
      const firstQuestion = stripFormatting(rawQuestion)

      const newMessages = [
        { role: 'interviewer', text: firstQuestion, timestamp: Date.now() }
      ]
      setMessages(newMessages)
      speakText(firstQuestion, langCode)
    } catch (err) {
      setError(err.message)
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }

  const speakText = (text, lang = detectedLanguage) => {
    // Text-to-speech is a nice-to-have. Some WebViews (incl. the native shell)
    // expose no speechSynthesis — skip it silently rather than surfacing a
    // blocking error on every interviewer question.
    if (!speechSynthesis) {
      setIsSpeaking(false)
      return
    }
    speechSynthesis.cancel()
    setIsSpeaking(true)

    // Speak in the user-selected interview language (recognition stays in sync
    // via the initRecognition effect keyed on detectedLanguage).
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = speechRate
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = (e) => {
      setError(`Speech synthesis error: ${e.error}`)
      setIsSpeaking(false)
    }
    speechSynthesis.speak(utterance)
  }

  const startListening = () => {
    if (isNativeShell) return startNativeSpeechListening()
    if (nativeSpeechSupported) return startNativeListening()
    return startRecordingFallback()
  }

  // --- Native Android speech-to-text (Capacitor plugin) ---
  // Uses the OS SpeechRecognizer: live partial results, no model download. The
  // recognizer ends the session itself after a pause, so we drive the UI from its
  // events and also expose the manual "Submit Answer" button.
  const startNativeSpeechListening = async () => {
    try {
      const { available } = await NativeSpeech.available()
      if (!available) {
        setError('Speech recognition isn’t available on this device. You can type your answer instead.')
        return
      }
      let perm = await NativeSpeech.checkPermissions()
      if (perm.speechRecognition !== 'granted') {
        perm = await NativeSpeech.requestPermissions()
      }
      if (perm.speechRecognition !== 'granted') {
        setError('Microphone permission was denied. Allow it in settings, or type your answer instead.')
        return
      }

      finalTranscriptRef.current = ''
      setTranscript('')
      setError(null)

      await NativeSpeech.removeAllListeners()
      await NativeSpeech.addListener('partialResults', (data) => {
        const text = data?.matches?.[0]
        if (text) {
          finalTranscriptRef.current = text
          setTranscript(text)
        }
      })
      // The engine stops on its own after silence — mirror that in the UI so the
      // button flips back from "Submit Answer" to "Record Answer".
      await NativeSpeech.addListener('listeningState', (data) => {
        if (data?.status === 'stopped') setIsRecording(false)
      })

      await NativeSpeech.start({
        language: detectedLanguage,
        maxResults: 2,
        partialResults: true,
        popup: false
      })
      setIsRecording(true)
    } catch (err) {
      setError(`Voice input couldn’t start: ${err?.message || err}. You can type your answer instead.`)
      setIsRecording(false)
    }
  }

  const stopNativeSpeechListening = async () => {
    try {
      await NativeSpeech.stop()
    } catch {
      /* already stopped by the engine */
    }
    try {
      await NativeSpeech.removeAllListeners()
    } catch {
      /* noop */
    }
    setIsRecording(false)
    const text = (finalTranscriptRef.current || transcript).trim()
    if (!text) {
      setError('No speech detected. Please try again or type your answer.')
      return
    }
    submitAnswer(text)
  }

  // --- Native Web Speech path (Chrome/Edge) ---
  const startNativeListening = () => {
    // Lazily (re)build the recognizer if it isn't ready yet.
    const recognition = recognitionRef.current || initRecognition()
    if (!recognition) return // initRecognition already surfaced an error

    finalTranscriptRef.current = ''
    setTranscript('')
    setError(null)
    try {
      recognition.start()
    } catch (err) {
      // start() throws if already running — reset state cleanly.
      setError('Voice input is already active. Please wait a moment and retry.')
      setIsRecording(false)
    }
  }

  // --- WASM Whisper fallback path (Firefox/Safari) ---
  const startRecordingFallback = async () => {
    if (!canRecordAudio()) {
      setError('Voice input isn’t available in this browser. You can type your answer instead.')
      return
    }
    setTranscript('')
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      audioChunksRef.current = []

      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = handleRecordingStopped
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch (err) {
      setError('Microphone access was blocked. Allow the mic, or type your answer instead.')
      setIsRecording(false)
    }
  }

  const handleRecordingStopped = async () => {
    setIsRecording(false)
    // Release the mic.
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    mediaStreamRef.current = null

    const chunks = audioChunksRef.current
    audioChunksRef.current = []
    if (!chunks.length) {
      setError('No audio captured. Please try again.')
      return
    }

    const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' })
    setTranscribing(true)
    setError(null)
    try {
      const text = await transcribeBlob(blob, detectedLanguage, (p) => {
        if (p?.status === 'progress' && typeof p.progress === 'number') {
          setModelStatus(`Loading voice model… ${Math.round(p.progress)}%`)
        } else if (p?.status === 'ready' || p?.status === 'done') {
          setModelStatus(null)
        }
      })
      setModelStatus(null)
      if (!text) {
        setError('Couldn’t make out any speech. Please try again or type your answer.')
        return
      }
      setTranscript(text)
      submitAnswer(text)
    } catch (err) {
      setModelStatus(null)
      setError(`Transcription failed: ${err.message}. You can type your answer instead.`)
    } finally {
      setTranscribing(false)
    }
  }

  // Shared answer pipeline used by both voice and typed input.
  const submitAnswer = async (answerText) => {
    const answer = answerText.trim()
    if (!answer) return

    setIsLoading(true)
    setError(null)

    try {
      // Build conversation history for Claude
      const conversationHistory = messages
        .map((m) => ({
          role: m.role === 'interviewer' ? 'assistant' : 'user',
          content: m.text
        }))
        .concat([{ role: 'user', content: answer }])

      const descContext = job.description
        ? `Role: ${job.description.slice(0, 600)}\n\n`
        : ''
      const cvContext = cv
        ? `Candidate background: ${cv.slice(0, 600)}\n\n`
        : ''
      const systemPrompt = `${descContext}${cvContext}You are a senior recruiter at ${job.company} evaluating a candidate for this role.${focusLine ? ` ${focusLine.trim()} Keep every question within this focus.` : ''} Ask natural, probing follow-up questions that uncover whether they're truly fit for this position. Connect their experience to the role's requirements. Push for specific details—ask about challenges they faced, decisions they made, and lessons learned. Be realistic and direct, like you'd be in a real interview. Don't be overly nice; ask questions that matter. Always speak in ${aiLangName(detectedLanguage)}, regardless of the language the candidate answers in. Output ONLY plain text questions—no formatting, no bold, no italics, no asterisks, no dashes, no bullet points. Just conversational sentences you'd say in person.`

      const response = await aiFetch('/api/claude', {
        model: CLAUDE_MODEL,
        max_tokens: 500,
        system: systemPrompt,
        messages: conversationHistory
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json()
      if (!mountedRef.current) return
      const rawQuestion = data.content[0]?.text || 'Great answer. Tell me more.'
      const nextQuestion = stripFormatting(rawQuestion)

      setMessages((prev) => [
        ...prev,
        { role: 'candidate', text: answer, timestamp: Date.now() },
        {
          role: 'interviewer',
          text: nextQuestion,
          timestamp: Date.now()
        }
      ])

      setTranscript('')
      setTextAnswer('')
      speakText(nextQuestion)
    } catch (err) {
      setError(err.message)
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }

  const stopListening = () => {
    if (isNativeShell) return stopNativeSpeechListening()
    if (!nativeSpeechSupported) {
      // Fallback path: stop the recorder; transcription runs in onstop.
      mediaRecorderRef.current?.stop()
      return
    }
    recognitionRef.current?.stop()
    // Use whatever is currently displayed (final + interim combined).
    const displayedText = transcript.trim()
    if (!displayedText) {
      setError('No speech detected. Please try again.')
      return
    }
    submitAnswer(displayedText)
  }

  const submitTextAnswer = () => {
    if (!textAnswer.trim()) return
    submitAnswer(textAnswer)
  }

  const stopSpeaking = () => {
    speechSynthesis?.cancel()
    setIsSpeaking(false)
  }

  const resetInterview = () => {
    speechSynthesis?.cancel()
    setMessages([])
    setTranscript('')
    setTextAnswer('')
    setError(null)
    setFeedback(null)
    interviewIdRef.current = Date.now()
    generateFirstQuestion()
  }

  // Switching the interview language restarts the session so the interviewer
  // (and its first question) come back in the newly chosen language. Pass the
  // new code straight to generateFirstQuestion to avoid the async-state lag.
  const changeLanguage = (code) => {
    if (!code || code === detectedLanguage) return
    setDetectedLanguage(code)
    speechSynthesis?.cancel()
    try { recognitionRef.current?.abort() } catch { /* noop */ }
    if (isNativeShell) {
      try { NativeSpeech.stop() } catch { /* noop */ }
    }
    setIsRecording(false)
    setMessages([])
    setTranscript('')
    setTextAnswer('')
    setError(null)
    setFeedback(null)
    interviewIdRef.current = Date.now()
    generateFirstQuestion(code)
  }

  const exportTranscript = async () => {
    const text = messages
      .map(
        (m) =>
          `${m.role === 'interviewer' ? 'Interviewer' : 'You'}: ${m.text}`
      )
      .join('\n\n')

    // deliverText handles the native shell (share sheet); on web it's a download.
    await deliverText(text, `interview-${job.company}-${new Date().toISOString().split('T')[0]}.txt`, 'text/plain')
  }

  const analyzeInterview = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const transcript = messages
        .map((m) => `${m.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${m.text}`)
        .join('\n')

      const descContext = job.description ? `\nJob description: ${job.description.slice(0, 600)}` : ''
      const cvContext = cv ? `\n\nCandidate CV: ${cv.slice(0, 600)}` : ''

      const response = await aiFetch('/api/claude', {
        model: CLAUDE_MODEL,
        max_tokens: 800,
        messages: [
          {
            role: 'user',
            content: `You are a senior recruiter evaluating this candidate's interview performance for a ${job.position} role at ${job.company}. Be honest and realistic—score like you would in real hiring (don't inflate scores).${descContext}${cvContext}${focusLine ? `${focusLine} Judge the answers against THIS interview level's expectations.` : ''}

Interview transcript:
${transcript}

Provide:
1. Hire Decision: Would you move this candidate forward? (Yes/No/Maybe with score 0-100)
2. Strengths (2-3 bullet points: what demonstrated real competence)
3. Red flags or concerns (2-3 bullet points: what worried you)
4. One specific example: Quote their weak answer and explain exactly what was missing or wrong
5. How to fix it: Concrete reframe of that answer

Be direct. A 70 means "solid but has gaps". An 85+ means "seriously considering". Be critical.

Write all feedback text (strengths, concerns, weak_example, better_answer) in ${aiLangName(detectedLanguage)}. Keep the JSON keys in English and keep hire_decision as one of the English values Yes/No/Maybe.

Format as JSON with keys: hire_decision, score, strengths, concerns, weak_example, better_answer`
          }
        ]
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json()
      if (!mountedRef.current) return
      const analysisText = data.content[0]?.text || ''

      let analysis
      try {
        analysis = JSON.parse(analysisText)
        setFeedback(analysis)
      } catch {
        // If JSON parsing fails, show raw text
        analysis = { raw: analysisText }
        setFeedback(analysis)
      }

      // Analytics — Voice Interview Coach session completed (time-to-value +
      // retention signal). Voice-first tool, so live_voice unless voice is
      // unavailable in this browser.
      try {
        trackMockInterviewCompleted({
          applicationId: job.id,
          interviewMode: voiceSupported ? 'live_voice' : 'practice',
          questionsCoveredCount: messages.filter((m) => m.role === 'interviewer').length,
        })
      } catch { /* ignore */ }

      // Notify parent so they can save results and potentially close modal
      if (onInterviewComplete) {
        onInterviewComplete({
          jobId: job.id,
          company: job.company,
          position: job.position,
          date: new Date().toISOString(),
          round: round || null,
          score: analysis.score,
          hire_decision: analysis.hire_decision,
          transcript: messages.map((m) => ({ role: m.role, text: m.text })),
          feedback: analysis
        })
      }
    } catch (err) {
      setError(`Analysis failed: ${err.message}`)
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      {snapPreview}
      <div className="bg-white rounded-2xl shadow-2xl w-11/12 max-h-[90vh] flex flex-col max-w-2xl" style={panelStyle}>
        {/* Header */}
        <div onPointerDown={startDrag} className="flex items-center justify-between p-4 border-b border-gray-200 cursor-move select-none">
          <div>
            <h2 className="text-lg font-bold text-gray-800">🎤 {roundName ? `${roundName} — mock interview` : 'Mock Interview'}</h2>
            <p className="text-xs text-gray-500">
              {job.company} – {job.position}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={detectedLanguage}
              onChange={(e) => changeLanguage(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              title="Interview language — changing it restarts the interview"
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  🌐 {l.label}
                </option>
              ))}
            </select>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
          {messages.length === 0 && !isLoading && (
            <div className="text-center text-gray-500 py-8">
              <p className="text-sm mb-2">🎯 Interview starting...</p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isInterviewer = msg.role === 'interviewer'
            return (
              <div key={idx} className={`flex items-end gap-2 ${isInterviewer ? 'justify-start' : 'flex-row-reverse'}`}>
                <span
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base ${isInterviewer ? 'bg-indigo-100 border border-indigo-200' : 'bg-green-100 border border-green-200'}`}
                  title={isInterviewer ? 'Interviewer' : 'You'}
                  aria-hidden
                >
                  {isInterviewer ? '🧑‍💼' : '🙋'}
                </span>
                <div className={`max-w-xs px-4 py-3 rounded-2xl ${isInterviewer ? 'bg-indigo-100 text-indigo-900 rounded-bl-sm' : 'bg-green-100 text-green-900 rounded-br-sm'}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            )
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-indigo-100 text-indigo-900 px-4 py-3 rounded-lg">
                <div className="flex gap-2 items-center">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"></div>
                  <span className="text-sm">Listening...</span>
                </div>
              </div>
            </div>
          )}

          {transcript && !isLoading && (
            <div className="flex justify-end">
              <div className="max-w-xs px-4 py-3 rounded-lg bg-yellow-100 text-yellow-900">
                <p className="text-sm text-gray-600">
                  <span className="text-xs font-semibold">Transcript:</span>
                </p>
                <p className="text-sm">{transcript}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-center">
              <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm">
                ⚠️ {error}
              </div>
            </div>
          )}

          {feedback && (
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg p-4 mt-4">
              <div className="text-center mb-4">
                <div className="text-5xl font-bold text-purple-600">{feedback.score || '—'}</div>
                <p className="text-xs text-gray-600">Recruiter Score</p>
                {feedback.hire_decision && (
                  <p className={`text-xs font-bold mt-1 ${
                    feedback.hire_decision === 'Yes' ? 'text-green-700' :
                    feedback.hire_decision === 'No' ? 'text-red-700' :
                    'text-orange-700'
                  }`}>
                    {feedback.hire_decision === 'Yes' ? '✅ Move Forward' :
                     feedback.hire_decision === 'No' ? '❌ Not Ready' :
                     '⏳ On The Fence'}
                  </p>
                )}
              </div>

              {feedback.strengths && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-green-700 mb-1">✅ What Impressed Me</p>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {Array.isArray(feedback.strengths) ? (
                      feedback.strengths.map((s, i) => <li key={i}>• {s}</li>)
                    ) : (
                      <li>• {feedback.strengths}</li>
                    )}
                  </ul>
                </div>
              )}

              {feedback.concerns && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-red-700 mb-1">⚠️ Concerns</p>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {Array.isArray(feedback.concerns) ? (
                      feedback.concerns.map((c, i) => <li key={i}>• {c}</li>)
                    ) : (
                      <li>• {feedback.concerns}</li>
                    )}
                  </ul>
                </div>
              )}

              {feedback.weak_example && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-orange-700 mb-1">📍 Weak Moment</p>
                  <p className="text-xs text-gray-700 italic">"{feedback.weak_example}"</p>
                </div>
              )}

              {feedback.better_answer && (
                <div>
                  <p className="text-xs font-bold text-blue-700 mb-1">💡 Better Way to Say It</p>
                  <p className="text-xs text-gray-700">{feedback.better_answer}</p>
                </div>
              )}

              {feedback.raw && (
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{feedback.raw}</p>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Controls */}
        <div className="border-t border-gray-200 bg-white p-4 space-y-3">
          {/* Speech rate slider */}
          {messages.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-600">
                Speech Rate:
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={speechRate}
                onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-gray-500 w-8">{speechRate.toFixed(1)}x</span>
            </div>
          )}

          {/* Main action buttons */}
          <div className="flex gap-2 flex-wrap justify-between">
            <div className="flex gap-2">
              {voiceSupported &&
                !isRecording &&
                !isLoading &&
                !transcribing &&
                messages.length > 0 && (
                  <>
                    <button
                      onClick={startListening}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                    >
                      🎤 Record Answer
                    </button>
                    {isSpeaking && (
                      <button
                        onClick={stopSpeaking}
                        className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                      >
                        ⏸ Stop
                      </button>
                    )}
                  </>
                )}

              {isRecording && (
                <button
                  onClick={stopListening}
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  ⏹ Submit Answer
                </button>
              )}

              {transcribing && (
                <button
                  disabled
                  className="flex items-center gap-2 bg-indigo-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
                >
                  ✍️ {modelStatus || 'Transcribing…'}
                </button>
              )}

              {isLoading && (
                <button
                  disabled
                  className="flex items-center gap-2 bg-gray-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
                >
                  ⏳ Processing...
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {messages.length > 0 && !feedback && (
                <>
                  <button
                    onClick={analyzeInterview}
                    disabled={isLoading || isRecording || transcribing}
                    className="text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg disabled:opacity-40 transition-colors"
                  >
                    📊 End & Analyze
                  </button>
                  <button
                    onClick={exportTranscript}
                    className="text-xs text-gray-600 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100"
                  >
                    📥 Export
                  </button>
                  <button
                    onClick={resetInterview}
                    className="text-xs text-gray-600 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100"
                  >
                    🔄 Reset
                  </button>
                </>
              )}
              {feedback && (
                <button
                  onClick={resetInterview}
                  className="text-xs text-gray-600 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100"
                >
                  🔄 New Interview
                </button>
              )}
            </div>
          </div>

          {/* Typed-answer safety net (works even if transcription fails) */}
          {messages.length > 0 && !isRecording && !transcribing && !isLoading && (
            <div className="flex gap-2 items-end">
              <textarea
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submitTextAnswer()
                  }
                }}
                rows={1}
                placeholder="…or type your answer"
                className="flex-1 resize-none text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button
                onClick={submitTextAnswer}
                disabled={!textAnswer.trim()}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                Send
              </button>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center">
            {isNativeShell
              ? '💡 Tap “Record Answer” and speak — Android transcribes it live. Then “Submit Answer”, or just type below.'
              : nativeSpeechSupported
              ? '💡 Tip: Speak after clicking "Record Answer", then "Submit Answer" when done.'
              : '💡 Voice runs a private in-browser model — first use downloads it (~200 MB, once), then each answer takes a few seconds. Prefer speed? Just type below.'}
          </p>
        </div>
      </div>
    </div>
  )
}
