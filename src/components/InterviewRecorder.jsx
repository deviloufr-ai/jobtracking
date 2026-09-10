import { useState, useEffect } from 'react';

// Interview Recorder Component
// Floating button for recording interviews during Meet/Zoom calls
export default function InterviewRecorder() {
  const [recordingActive, setRecordingActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // Clear interval when component unmounts
  useEffect(() => {
    return () => clearInterval(timerId);
  }, []);
  
  let timerId;
  
  // Start recording
  const startRecording = async () => {
    console.log('🎤 [INTERVIEW RECORDER] Starting recording...');
    setRecordingActive(true);
    setElapsedSeconds(0);
    
    // TODO Phase 2: Connect to AssemblyAI WebSocket here
    // await connectToAssemblyAIStream();
    
    console.log('[INTERVIEW RECORDER] Recording active');
  };
  
  // Stop recording
  const stopRecording = async () => {
    console.log('🛑 [INTERVIEW RECORDER] Stopping recording...');
    
    // Clear the timer immediately
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
      console.log('[INTERVIEW RECORDER] Timer cleared');
    }
    
    // Update state to stop recording
    setRecordingActive(false);
    
    // Small delay to ensure cleanup happens before UI update
    setTimeout(() => {
      setElapsedSeconds(0);
      console.log('✅ [INTERVIEW RECORDER] Recording stopped successfully');
    }, 50);
  };
  
  // Update timer when recording is active
  useEffect(() => {
    if (recordingActive) {
      const tick = () => {
        setElapsedSeconds(prev => prev + 1);
      };
      
      timerId = setInterval(tick, 1000);
      
      return () => {
        if (timerId) {
          clearInterval(timerId);
          console.log('[INTERVIEW RECORDER] Timer cleared on unmount');
        }
      };
    }
  }, [recordingActive]);
  
  // Render the UI
  if (!recordingActive) {
    return (
      <button
        onClick={startRecording}
        className="fixed bottom-4 right-4 z-50 bg-red-500 hover:bg-red-600 text-white p-3 rounded-full shadow-lg animate-pulse"
        title="Record Interview"
        aria-label="Start recording interview"
        style={{ minWidth: '48px', height: '48px' }}
      >
        🎤
      </button>
    );
  }
  
  // Rendering the recording panel
  return (
    <div className="fixed bottom-16 right-4 z-50 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-700">
      <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
        🎤 Live Transcript
        <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
      </h3>
      
      <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400">
        <span>{elapsedSeconds}s</span>
        <span>|</span>
        <span>Recording in progress...</span>
      </div>
      
      <div className="h-32 overflow-y-auto mb-3 text-sm font-mono bg-gray-50 dark:bg-gray-900 rounded p-2">
        <p className="text-gray-400 italic text-center py-4">
          Click "Stop & Save" when done recording
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
  );
}