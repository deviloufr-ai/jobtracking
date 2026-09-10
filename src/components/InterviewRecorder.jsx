import { useState, useEffect, useRef } from 'react';

export default function InterviewRecorder() {
  // Use a single source of truth for recording state
  const [recordingState, setRecordingState] = useState({
    isRecording: false,
    duration: 0,
    chunks: [],
  });
  
  const timerRef = useRef(null);
  const stopTimeoutRef = useRef(null);
  
  // Timer for duration tracking
  useEffect(() => {
    if (recordingState.isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingState(prev => ({ ...prev, duration: prev.duration + 1 }));
      }, 1000);
      
      console.log('🎤 Recording started');
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [recordingState.isRecording]);
  
  const handleStart = async () => {
    try {
      console.log('🎤 Starting interview recording...');
      setRecordingState(prev => ({ 
        ...prev, 
        isRecording: true,
        chunks: [],
        duration: 0
      }));
      
      // TODO Phase 2: Connect to AssemblyAI WebSocket here
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      setRecordingState(prev => ({ ...prev, isRecording: false }));
    }
  };
  
  const handleStop = async () => {
    try {
      console.log('🛑 Stopping recording, saving transcript...');
      
      // Clear timer immediately
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Force re-render after cleanup
      setRecordingState(prev => ({ 
        ...prev,
        isRecording: false,
        chunks: [],
        duration: 0
      }));
      
      console.log('✅ Recording stopped successfully');
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
      // Still try to clear timer on error
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };
  
  const { isRecording, duration, chunks } = recordingState;
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isRecording ? (
        <button
          onClick={handleStart}
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
          
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{duration}s</span>
            <span>|</span>
            <span>Waiting for audio...</span>
          </div>
          
          <div className="h-32 overflow-y-auto mb-3 text-sm font-mono bg-gray-50 dark:bg-gray-900 rounded p-2">
            {chunks.length === 0 ? (
              <p className="text-gray-400 italic text-center py-4">
                Click "Stop & Save" when done recording
              </p>
            ) : (
              chunks.map((chunk, i) => (
                <div key={i} className="mb-1 text-gray-800 dark:text-gray-200 border-b dark:border-gray-700 pb-1">
                  {chunk.text}
                </div>
              ))
            )}
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={handleStop}
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