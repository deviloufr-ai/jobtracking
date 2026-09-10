import { useState, useEffect } from 'react';

// Interview Recorder Component
// Floating button for recording interviews during Meet/Zoom calls
export default function InterviewRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);

  // Timer interval cleanup
  useEffect(() => {
    let intervalId;
    
    if (isRecording) {
      intervalId = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isRecording]);

  const startRecording = async () => {
    console.log('🎤 [RECORDER] Starting recording...');
    setIsRecording(true);
    setDuration(0);
    
    // TODO Phase 2: Connect to AssemblyAI WebSocket here
  };
  
  const stopRecording = async () => {
    console.log('🛑 [RECORDER] Stopping recording...');
    setIsRecording(false);
    
    if (!isRecording) {
      console.log('[RECORDER] Already stopped, nothing to do');
      return;
    }

    try {
      const newTranscript = {
        transcript_text: 'No transcript generated yet',
        duration_seconds: duration,
        status: 'completed',
        start_time: new Date().toISOString(),
      };

      console.log('[RECORDER] Saving transcript:', JSON.stringify(newTranscript));
    } catch (error) {
      console.error('[RECORDER] Error saving transcript:', error);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isRecording ? (
        <button
          onClick={startRecording}
          className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full shadow-lg animate-pulse"
          title="Record Interview"
          aria-label="Start recording interview"
        >
          🎤
        </button>
      ) : (
        <div className="absolute bottom-14 right-0 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
            🎤 Live Transcript
            <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
          </h3>
          
          <div className="flex items-center justify-between mb-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{duration}s</span>
            <span>• Recording in progress...</span>
          </div>
          
          <div className="h-32 overflow-y-auto mb-3 text-sm font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
            <p className="text-gray-400 italic text-center py-4">
              Transcript will appear here...
            </p>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={stopRecording}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded text-sm font-medium"
            >
              ✅ Stop & Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}