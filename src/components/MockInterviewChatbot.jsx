import { useState, useEffect, useRef } from 'react'
import { aiFetch } from '../services/apiKey'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
const speechSynthesis = window.speechSynthesis

export default function MockInterviewChatbot({ job, cv, onClose }) {
  const [messages, setMessages] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [speechRate, setSpeechRate] = useState(1)
  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)
  const interviewIdRef = useRef(Date.now())

  // Initialize speech recognition
  useEffect(() => {
    if (!SpeechRecognition) {
      setError('Speech Recognition not supported in this browser')
      return
    }
    recognitionRef.current = new SpeechRecognition()
    recognitionRef.current.continuous = false
    recognitionRef.current.interimResults = true
    recognitionRef.current.lang = 'en-US'

    recognitionRef.current.onstart = () => setIsRecording(true)
    recognitionRef.current.onend = () => setIsRecording(false)
    recognitionRef.current.onerror = (e) => setError(`Speech error: ${e.error}`)
    recognitionRef.current.onresult = (e) => {
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
      const response = await aiFetch('/api/claude', {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `You are an experienced technical interview coach. The candidate is interviewing for the position of "${job.position}" at "${job.company}".

Here is their CV:
${cv}

Here is the job description:
${job.jobDescription || job.notes || 'No specific description provided'}

Ask your FIRST interview question to evaluate their fit for this role. Be direct, ask ONE clear question. Keep it conversational and friendly. The candidate will respond via speech.`
          }
        ]
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json()
      const firstQuestion = data.content[0]?.text || 'Tell me about your experience.'

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

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = speechRate
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = (e) => {
      setError(`Speech synthesis error: ${e.error}`)
      setIsSpeaking(false)
    }
    speechSynthesis.speak(utterance)
  }

  const startListening = () => {
    if (!recognitionRef.current) {
      setError('Speech Recognition not initialized')
      return
    }
    setTranscript('')
    setError(null)
    recognitionRef.current.start()
  }

  const stopListening = async () => {
    recognitionRef.current.stop()
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

      const systemPrompt = `You are an experienced technical interview coach conducting an interview for the position of "${job.position}" at "${job.company}".

Candidate's CV:
${cv}

Job description:
${job.jobDescription || job.notes || 'No specific description provided'}

You've asked them questions to evaluate their fit. Their last response was about a topic they brought up. Now ask a thoughtful follow-up question OR provide brief feedback and move to the next topic. Keep it conversational. Ask ONE clear question at a time. After 5-6 exchanges, offer brief closing feedback.`

      const response = await aiFetch('/api/claude', {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: conversationHistory
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json()
      const nextQuestion = data.content[0]?.text || 'Great answer. Tell me more.'

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
