import { useState, useEffect, useRef } from 'react'
import { aiFetch } from '../services/apiKey'
import { transcribeBlob, canRecordAudio } from '../services/localSpeech'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
const speechSynthesis = window.speechSynthesis

// Detect language from text
function detectLanguage(text) {
  if (!text) return 'en-US'
  const frenchWords = /\b(bonjour|salut|merci|comment|pourquoi|quoi|je|tu|il|elle|nous|vous|ils|elles|être|avoir|aller|faire|pouvoir|vouloir|devoir|mettre|prendre|venir|dire|savoir|répondre|travailler|entreprise|poste|candidature|expérience|projet)\b/gi
  const matches = text.match(frenchWords) || []
  return matches.length > text.split(/\s+/).length * 0.15 ? 'fr-FR' : 'en-US'
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

export default function MockInterviewChatbot({ job, cv, onClose }) {
  const [messages, setMessages] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [textAnswer, setTextAnswer] = useState('')
  const [speechRate, setSpeechRate] = useState(1)
  const [detectedLanguage, setDetectedLanguage] = useState('en-US')
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

  // Native Web Speech API (Chrome/Edge). When absent we fall back to recording
  // the mic and transcribing with a local WASM Whisper model (Firefox/Safari).
  const nativeSpeechSupported = Boolean(SpeechRecognition)
  const voiceSupported = nativeSpeechSupported || canRecordAudio()

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

  // Release the mic if the modal closes mid-recording.
  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop()
      } catch {
        /* noop */
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
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

  const generateFirstQuestion = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const descContext = job.description
        ? `\n\nJob description:\n${job.description.slice(0, 800)}`
        : ''
      const cvContext = cv ? `\n\nCandidate CV:\n${cv.slice(0, 800)}` : ''
      const response = await aiFetch('/api/claude', {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `Ask ONE opening question for a ${job.position} interview at ${job.company}.${descContext}${cvContext}

Connect the candidate's experience to the role. Output ONLY the question as plain text. No formatting, no bold, no italics, no asterisks, no dashes, no bullet points. Just a natural, conversational question you'd ask if talking to someone in person.`
          }
        ]
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json()
      const rawQuestion = data.content[0]?.text || 'Tell me about your experience.'
      const firstQuestion = stripFormatting(rawQuestion)

      const newMessages = [
        { role: 'interviewer', text: firstQuestion, timestamp: Date.now() }
      ]
      setMessages(newMessages)
      speakText(firstQuestion)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const speakText = (text) => {
    if (!speechSynthesis) {
      setError('Text-to-speech not supported')
      return
    }
    speechSynthesis.cancel()
    setIsSpeaking(true)

    // Auto-detect language and update recognition language
    const lang = detectLanguage(text)
    setDetectedLanguage(lang)
    if (recognitionRef.current) {
      recognitionRef.current.lang = lang
    }

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
    if (nativeSpeechSupported) return startNativeListening()
    return startRecordingFallback()
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
      const systemPrompt = `${descContext}${cvContext}You conduct interviews for this role at ${job.company}. Ask natural follow-up questions that connect the candidate's experience to the role's requirements. Probe specific skills, projects, or experiences from their CV that relate to this position. Output ONLY plain text questions—no formatting, no bold, no italics, no asterisks, no dashes, no bullet points. Just conversational sentences you'd say in person.`

      const response = await aiFetch('/api/claude', {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: conversationHistory
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json()
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
      setIsLoading(false)
    }
  }

  const stopListening = () => {
    if (!nativeSpeechSupported) {
      // Fallback path: stop the recorder; transcription runs in onstop.
      mediaRecorderRef.current?.stop()
      return
    }
    recognitionRef.current?.stop()
    // Use the accumulated final transcript, not the state (which includes interim).
    const finalText = finalTranscriptRef.current.trim()
    if (!finalText) {
      setError('No speech detected. Please try again.')
      return
    }
    submitAnswer(finalText)
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

  const exportTranscript = () => {
    const text = messages
      .map(
        (m) =>
          `${m.role === 'interviewer' ? 'Interviewer' : 'You'}: ${m.text}`
      )
      .join('\n\n')

    const element = document.createElement('a')
    element.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text)
    element.download = `interview-${job.company}-${new Date().toISOString().split('T')[0]}.txt`
    element.click()
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [
          {
            role: 'user',
            content: `You are an expert interviewer. Analyze this mock interview and provide feedback.${descContext}${cvContext}

Interview transcript:
${transcript}

Provide:
1. Score (0-100)
2. Strengths (2-3 bullet points of what went well)
3. Areas for improvement (2-3 bullet points with specific suggestions)
4. One example of a weaker answer and how to improve it

Format as JSON with keys: score, strengths, improvements, example_improvement`
          }
        ]
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json()
      const analysisText = data.content[0]?.text || ''

      try {
        const analysis = JSON.parse(analysisText)
        setFeedback(analysis)
      } catch {
        // If JSON parsing fails, show raw text
        setFeedback({ raw: analysisText })
      }
    } catch (err) {
      setError(`Analysis failed: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-11/12 max-h-[90vh] flex flex-col max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-800">🎤 Mock Interview</h2>
            <p className="text-xs text-gray-500">
              {job.company} – {job.position}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
          {messages.length === 0 && !isLoading && (
            <div className="text-center text-gray-500 py-8">
              <p className="text-sm mb-2">🎯 Interview starting...</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.role === 'interviewer' ? 'justify-start' : 'justify-end'
              }`}
            >
              <div
                className={`max-w-xs px-4 py-3 rounded-lg ${
                  msg.role === 'interviewer'
                    ? 'bg-indigo-100 text-indigo-900'
                    : 'bg-green-100 text-green-900'
                }`}
              >
                <p className="text-sm">{msg.text}</p>
              </div>
            </div>
          ))}

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
                <p className="text-xs text-gray-600">Interview Score</p>
              </div>

              {feedback.strengths && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-green-700 mb-1">✅ Strengths</p>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {Array.isArray(feedback.strengths) ? (
                      feedback.strengths.map((s, i) => <li key={i}>• {s}</li>)
                    ) : (
                      <li>• {feedback.strengths}</li>
                    )}
                  </ul>
                </div>
              )}

              {feedback.improvements && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-orange-700 mb-1">📈 Areas to Improve</p>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {Array.isArray(feedback.improvements) ? (
                      feedback.improvements.map((imp, i) => <li key={i}>• {imp}</li>)
                    ) : (
                      <li>• {feedback.improvements}</li>
                    )}
                  </ul>
                </div>
              )}

              {feedback.example_improvement && (
                <div>
                  <p className="text-xs font-bold text-blue-700 mb-1">💡 Example: Strengthen Your Answer</p>
                  <p className="text-xs text-gray-700">{feedback.example_improvement}</p>
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
            {nativeSpeechSupported
              ? '💡 Tip: Speak after clicking "Record Answer", then "Submit Answer" when done.'
              : '💡 Voice runs a private in-browser model — first use downloads it (~200 MB, once), then each answer takes a few seconds. Prefer speed? Just type below.'}
          </p>
        </div>
      </div>
    </div>
  )
}
