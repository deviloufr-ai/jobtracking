// In-browser speech-to-text fallback for browsers without the Web Speech API
// (Firefox, Safari). Runs a small Whisper model entirely client-side via
// WebAssembly — no API key, no serverless function, no per-minute cost.
//
// The transformers.js library (~heavy) is loaded lazily on first use so it
// never touches the initial app bundle.

let transcriberPromise = null

// Load (once) and cache the Whisper pipeline. `onProgress` receives the
// library's model-download progress events so the UI can show a loader.
export async function getTranscriber(onProgress) {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers')
      // Pull models straight from the HF CDN; don't look for local files.
      env.allowLocalModels = false
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
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

// Decode a recorded audio Blob into the 16 kHz mono Float32 samples Whisper
// expects. Setting the AudioContext sample rate makes decodeAudioData resample.
async function blobToSamples(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const ctx = new AudioCtx({ sampleRate: 16000 })
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer)
    return decoded.getChannelData(0)
  } finally {
    ctx.close()
  }
}

// Transcribe a recorded audio Blob. `langHint` is a BCP-47 tag like 'fr-FR';
// we map it to the Whisper language name so French answers aren't forced to
// English. Returns the recognized text (trimmed).
export async function transcribeBlob(blob, langHint, onProgress) {
  const transcriber = await getTranscriber(onProgress)
  const samples = await blobToSamples(blob)
  const language = langHint?.toLowerCase().startsWith('fr') ? 'french' : 'english'
  const output = await transcriber(samples, { language, task: 'transcribe' })
  return (output?.text || '').trim()
}

// Whether mic capture is even possible in this browser.
export function canRecordAudio() {
  return Boolean(
    navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.MediaRecorder
  )
}
