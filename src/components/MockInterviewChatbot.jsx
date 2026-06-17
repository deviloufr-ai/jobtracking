import { useState, useEffect, useRef } from 'react'
import { aiFetch } from '../services/apiKey'

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
  const [speechRate, setSpeechRate] = useState(1)
  const [detectedLanguage, setDetectedLanguage] = useState('en-US')
  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)
  const interviewIdRef = useRef(Date.now())

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
      recognition.continuous = false
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
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) {
            setTranscript(t)
          } else {
            interim += t
          }
        }
        if (interim) setTranscript(interim)
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

  // Initialize speech recognition (re-runs when detected language changes)
  useEffect(() => {
    initRecognition()
    return () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        /* noop */
      }
    }
  }, [detectedLanguage])

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
      const response = await aiFetch('/api/claude', {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `Ask ONE opening question for a ${job.position} interview at ${job.company}.

Output ONLY the question as plain text. No formatting, no bold, no italics, no asterisks, no dashes, no bullet points. Just a natural, conversational question you'd ask if talking to someone in person.`
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
    // Lazily (re)build the recognizer if it isn't ready yet.
    const recognition = recognitionRef.current || initRecognition()
    if (!recognition) return // initRecognition already surfaced an error

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

  const stopListening = async () => {
    recognitionRef.current?.stop()
    if (!transcript.trim()) {
      setError('No speech detected. Please try again.')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Build conversation history for Claude
      const conversationHistory = messages
        .map((m) => ({
          role: m.role === 'interviewer' ? 'assistant' : 'user',
          content: m.text
        }))
        .concat([{ role: 'user', content: transcript }])

      const systemPrompt = `You conduct interviews. Ask natural follow-up questions. Output ONLY plain text questions—no formatting, no bold, no italics, no asterisks, no dashes, no bullet points. Just conversational sentences you'd say in person.`

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
        { role: 'candidate', text: transcript, timestamp: Date.now() },
        {
          role: 'interviewer',
          text: nextQuestion,
          timestamp: Date.now()
        }
      ])

      setTranscript('')
      speakText(nextQuestion)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const stopSpeaking = () => {
    speechSynthesis?.cancel()
    setIsSpeaking(false)
  }

  const resetInterview = () => {
    speechSynthesis?.cancel()
    setMessages([])
    setTranscript('')
    setError(null)
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
              {!isRecording && !isLoading && messages.length > 0 && (
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
              {messages.length > 0 && (
                <>
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
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center">
            💡 Tip: Speak clearly after clicking "Record Answer". Click "Submit Answer" when done.
          </p>
        </div>
      </div>
    </div>
  )
}
