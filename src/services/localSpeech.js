// In-browser speech-to-text fallback for browsers without the Web Speech API
// (Firefox, Safari). Runs a small Whisper model entirely client-side via
// WebAssembly — no API key, no serverless function, no per-minute cost.
//
// The transformers.js library (~heavy) is loaded lazily on first use so it
// never touches the initial app bundle.

let transcriberPromise = null

// `whisper-small` gives a real accuracy jump over base/tiny while staying
// fully in-browser. Cost: ~200 MB one-time download (cached) and slower CPU
// inference per answer — acceptable for occasional interview practice, and
// the typed-answer box remains the fast fallback.
const MODEL_ID = 'Xenova/whisper-small'

// Load (once) and cache the Whisper pipeline. `onProgress` receives the
// library's model-download progress events so the UI can show a loader.
export async function getTranscriber(onProgress) {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers')
      // Pull models straight from the HF CDN; don't look for local files.
      env.allowLocalModels = false
      return pipeline('automatic-speech-recognition', MODEL_ID, {
        progress_callback: onProgress
      })
    })().catch((err) => {
      // Reset so a later attempt can retry instead of reusing a failed promise.
      transcriberPromise = null
      throw err
    })
  }
  return transcriberPromise
}

// Decode a recorded audio Blob into 16 kHz mono Float32 samples — exactly what
// Whisper expects. We decode at the browser's native rate, then resample with
// an OfflineAudioContext (which always honors the target rate) rather than
// trusting `new AudioContext({ sampleRate })`, which several browsers silently
// ignore — leaving 48 kHz audio that Whisper reads ~3× too fast (= gibberish).
async function blobToSamples(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const ctx = new AudioCtx()
  let decoded
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer)
  } finally {
    ctx.close()
  }

  if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) {
    return decoded.getChannelData(0)
  }

  // Resample (and downmix to mono) to 16 kHz.
  const frames = Math.ceil(decoded.duration * 16000)
  const offline = new OfflineAudioContext(1, frames, 16000)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}

// Transcribe a recorded audio Blob. We let Whisper auto-detect the language
// (the speaker may answer in FR or EN regardless of the question's language —
// forcing the wrong one produces garbage). Returns the recognized text.
export async function transcribeBlob(blob, langHint, onProgress) {
  const transcriber = await getTranscriber(onProgress)
  const samples = await blobToSamples(blob)
  const output = await transcriber(samples, {
    task: 'transcribe',
    // Long-form chunking so answers over 30s aren't truncated.
    chunk_length_s: 30,
    stride_length_s: 5,
    // Anti-loop guards: forbid repeating any 3-gram and penalize repetition.
    no_repeat_ngram_size: 3,
    repetition_penalty: 1.2
  })
  return cleanTranscript((output?.text || '').trim())
}

// Clean up the residual repetition Whisper emits on quiet/trailing audio:
//   - collapse immediate duplicate words ("general general" -> "general")
//   - drop consecutive duplicate sentences
//   - keep only the first occurrence of short filler sentences ("It's good.")
function cleanTranscript(text) {
  if (!text) return text

  // 1. Immediate duplicate words.
  const dedupWords = text.replace(/\b(\w+)(\s+\1\b)+/gi, '$1')

  // 2. Sentence-level de-duplication.
  const sentences = dedupWords
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const shortSeen = new Map()
  const out = []
  let prevNorm = null
  for (const s of sentences) {
    const norm = s.toLowerCase()
    if (norm === prevNorm) continue // consecutive duplicate

    // Short filler ("It's good.") that Whisper repeats — keep first only.
    if (norm.split(/\s+/).length <= 4) {
      const seen = (shortSeen.get(norm) || 0) + 1
      shortSeen.set(norm, seen)
      if (seen > 1) {
        prevNorm = norm
        continue
      }
    }

    out.push(s)
    prevNorm = norm
  }
  return out.join(' ')
}

// Whether mic capture is even possible in this browser.
export function canRecordAudio() {
  return Boolean(
    navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.MediaRecorder
  )
}
