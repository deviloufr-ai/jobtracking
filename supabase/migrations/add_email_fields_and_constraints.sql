-- Add new fields to job_history for email content preservation
ALTER TABLE job_history
ADD COLUMN IF NOT EXISTS email_body TEXT,
ADD COLUMN IF NOT EXISTS email_subject TEXT,
ADD COLUMN IF NOT EXISTS received_by TEXT;

-- Add unique constraint to prevent duplicate history entries (job_id, date, note are the natural key)
ALTER TABLE job_history
ADD CONSTRAINT job_history_natural_key UNIQUE (job_id, date, note)
ON CONFLICT DO NOTHING;

-- Add index for efficient polling queries
CREATE INDEX IF NOT EXISTS idx_job_history_job_id ON job_history(job_id);
CREATE INDEX IF NOT EXISTS idx_job_history_user_id ON job_history(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);

-- Add index for efficient deduplication queries
CREATE INDEX IF NOT EXISTS idx_job_history_date_note ON job_history(date, note);
