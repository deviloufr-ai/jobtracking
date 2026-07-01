-- Sync rich per-job data across devices: generated CVs (cvSaved), cover letters
-- (letterSaved), match scores (score/scoreDetails/scoreSignature), interview
-- practice sessions (interviewSessions), use cases (useCase) and display fields
-- (salaryMin/salaryMax/location/companyAddress/companyFromAts).
--
-- These were previously stripped before upload and had no column, so they never
-- left the device that created them. Stored as a single jsonb blob to avoid a
-- wide schema. RLS on `jobs` already covers every column, so no new policies.
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS extras jsonb;
