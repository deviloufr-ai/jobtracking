import { useState, useEffect } from 'react';

// Interview Recorder Component
// Floating button for recording interviews during Meet/Zoom calls
export default function InterviewRecorder() {
  // Use a ref to track internal timer state (bypasses React render cycle issues)
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  
  // Force re-render key for UI updates
  const [, setTick] = useState(0);

  // Timer interval - cleanup is CRITICAL here
  useEffect(() => {
    let intervalId = null;
    
    if (isRecording) {
      intervalId = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    
    // Cleanup function - MUST run when isRecording changes to false
    return () => {
      console.log('[INTERVIEW RECORDER] Cleanup: clearing interval');
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    console.log('[INTERVIEW RECORDER] 🎤 Starting recording...');
    
    // Reset state immediately
    setIsRecording(true);
    setDuration(0);
    
    // Force immediate re-render to show recording state
    setTick(prev => prev + 1);
    
    // TODO Phase 2: Connect to AssemblyAI WebSocket here
  };
  
  const stopRecording = async () => {
    console.log('[INTERVIEW RECORDER] 🛑 Stopping recording...');
    console.log('[INTERVIEW RECORDER] Current duration:', duration, 'seconds');
    
    // Step 1: Immediately clear the interval (before any state updates)
    const cleanup = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('[INTERVIEW RECORDER] Interval cleared');
      }
    };
    
    // Access intervalId through a ref-like pattern using useEffect cleanup
    cleanup();

    // Step 2: Stop recording state
    setIsRecording(false);
    
    // Step 3: Clear duration immediately
    setDuration(0);
    
    console.log('[INTERVIEW RECORDER] Recording stopped, state cleared');
  };

  const [transcriptText, setTranscriptText] = useState('');

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
            {transcriptText ? (
              transcriptText.split('\n').map((line, i) => (
                <p key={i} className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {line}
                </p>
              ))
            ) : (
              <p className="text-gray-400 italic text-center py-4">
                Transcript will appear here...
              </p>
            )}
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
