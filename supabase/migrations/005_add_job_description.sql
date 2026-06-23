-- Persist the full job description captured at import time (Firefox extension,
-- Adzuna/job-search import). Without this column the JD was stripped on every
-- Supabase sync, so after a reload the CV generator could no longer find it and
-- fell back to the "no_jd" manual-paste step.
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS job_description TEXT;
