-- Interview Transcripts Table
-- Stores full transcripts of video calls (Meet/Zoom) + AI analysis
CREATE TABLE IF NOT EXISTS interview_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_history_id UUID REFERENCES job_history(id) ON DELETE CASCADE,
  
  -- Call metadata
  platform VARCHAR(10) CHECK (platform IN ('meet', 'zoom')),
  meeting_link TEXT,
  
  -- Transcript content
  transcript_text TEXT,
  transcript_chunks JSONB DEFAULT '[]'::jsonb, -- For real-time streaming
  
  -- AI Analysis (populated after recording stops)
  structured_qa JSONB DEFAULT '{}'::jsonb,       -- Extracted Q&A pairs
  skills_mentioned JSONB DEFAULT '{}'::jsonb,     -- Skills/topics extracted
  sentiment_analysis JSONB DEFAULT '{}'::jsonb,   -- Confidence scores
  response_quality_score INTEGER,                  -- 1-10 rating
  
  -- Metadata
  start_time TIMESTAMPTZ,
  duration_seconds INTEGER,
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('recording', 'processing', 'completed', 'failed')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Sync metadata
  version INTEGER DEFAULT 1,
  device_id VARCHAR(255)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_interview_job_history ON interview_transcripts(job_history_id);
CREATE INDEX IF NOT EXISTS idx_interview_platform_link ON interview_transcripts(platform, meeting_link);
CREATE INDEX IF NOT EXISTS idx_interview_created_at ON interview_transcripts(created_at DESC);