-- JobTrackr v1.0 Initial Schema
-- Multi-device sync with offline-first architecture

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Metadata (extends auth.users)
CREATE TABLE IF NOT EXISTS user_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_picture bytea,
  cv_profile_json jsonb,
  migrated_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(user_id)
);

-- Jobs
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company varchar(255) NOT NULL,
  position varchar(255) NOT NULL,
  url text,
  status varchar(50) NOT NULL,
  notes text,
  date date NOT NULL,
  favorite boolean DEFAULT false,
  enriched_at timestamp,

  -- Sync metadata
  version integer DEFAULT 1,
  device_id varchar(255),
  last_modified_at timestamp DEFAULT now(),

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_user_date ON jobs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(user_id, updated_at DESC);

-- Job History Timeline
CREATE TABLE IF NOT EXISTS job_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  status varchar(50),
  note text,
  meeting_link text,
  gmail_id varchar(255),
  gmail_ids text[],
  offer_url text,
  show_cv_button boolean,
  from_email varchar(255),
  from_me boolean,
  source varchar(20),
  raw_start timestamp,

  version integer DEFAULT 1,
  device_id varchar(255),
  last_modified_at timestamp DEFAULT now(),

  created_at timestamp DEFAULT now(),

  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_history_job ON job_history(job_id);
CREATE INDEX IF NOT EXISTS idx_history_user_date ON job_history(user_id, date DESC);

-- Position Checks
CREATE TABLE IF NOT EXISTS position_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  available boolean,
  reason text,
  checked_at timestamp,

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),

  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_position_checks_job ON position_checks(job_id);

-- CVs
CREATE TABLE IF NOT EXISTS cvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  content_raw text,

  version integer DEFAULT 1,
  device_id varchar(255),
  last_modified_at timestamp DEFAULT now(),

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_cvs_user ON cvs(user_id);

-- User Settings
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  weekly_apps integer DEFAULT 5,
  response_rate integer DEFAULT 30,
  monthly_interviews integer DEFAULT 3,

  archive_sent_days integer DEFAULT 60,
  archive_rejected_days integer DEFAULT 90,

  follow_up_sent_days integer DEFAULT 14,
  follow_up_reviewing_days integer DEFAULT 10,
  follow_up_waiting_days integer DEFAULT 7,
  follow_up_offer_days integer DEFAULT 3,

  auto_refresh_hours integer DEFAULT 6,
  gmail_period_months integer DEFAULT 3,

  check_position_after_days integer DEFAULT 14,
  check_position_enabled boolean DEFAULT true,

  version integer DEFAULT 1,
  device_id varchar(255),
  last_modified_at timestamp DEFAULT now(),

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),

  UNIQUE(user_id),
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Deleted Jobs Registry
CREATE TABLE IF NOT EXISTS deleted_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  deleted_at timestamp DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES auth.users(id),
  UNIQUE(user_id, job_id)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type varchar(50),
  message text NOT NULL,
  meta jsonb,
  read boolean DEFAULT false,

  created_at timestamp DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- Notification Log
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario varchar(50),
  job_id uuid,
  metadata jsonb,

  created_at timestamp DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES auth.users(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_notif_log_user_scenario ON notification_log(user_id, scenario);

-- Gmail Accounts
CREATE TABLE IF NOT EXISTS gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  token text NOT NULL,
  token_expiry timestamp,
  user_name varchar(255),
  user_picture text,

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES auth.users(id),
  UNIQUE(user_id, email)
);

CREATE INDEX IF NOT EXISTS idx_gmail_accounts_user ON gmail_accounts(user_id);

-- Sync Metadata
CREATE TABLE IF NOT EXISTS sync_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id varchar(255) NOT NULL,
  last_sync_at timestamp DEFAULT now(),
  local_cache_version integer DEFAULT 0,

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),

  FOREIGN KEY (user_id) REFERENCES auth.users(id),
  UNIQUE(user_id, device_id)
);

-- ========== ROW LEVEL SECURITY POLICIES ==========

-- Enable RLS on all tables
ALTER TABLE user_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;

-- User Metadata RLS
CREATE POLICY "Users can view their own metadata"
  ON user_metadata FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own metadata"
  ON user_metadata FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own metadata"
  ON user_metadata FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Jobs RLS
CREATE POLICY "Users can view their own jobs"
  ON jobs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own jobs"
  ON jobs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own jobs"
  ON jobs FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own jobs"
  ON jobs FOR DELETE
  USING (user_id = auth.uid());

-- Job History RLS
CREATE POLICY "Users can view their own job history"
  ON job_history FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own job history"
  ON job_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own job history"
  ON job_history FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own job history"
  ON job_history FOR DELETE
  USING (user_id = auth.uid());

-- Position Checks RLS
CREATE POLICY "Users can view their own position checks"
  ON position_checks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own position checks"
  ON position_checks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own position checks"
  ON position_checks FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own position checks"
  ON position_checks FOR DELETE
  USING (user_id = auth.uid());

-- CVs RLS
CREATE POLICY "Users can view their own CVs"
  ON cvs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own CVs"
  ON cvs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own CVs"
  ON cvs FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own CVs"
  ON cvs FOR DELETE
  USING (user_id = auth.uid());

-- User Settings RLS
CREATE POLICY "Users can view their own settings"
  ON user_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own settings"
  ON user_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Deleted Jobs RLS
CREATE POLICY "Users can view their own deleted jobs"
  ON deleted_jobs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own deleted jobs"
  ON deleted_jobs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Notifications RLS
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own notifications"
  ON notifications FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Notification Log RLS
CREATE POLICY "Users can view their own notification log"
  ON notification_log FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own notification log"
  ON notification_log FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Gmail Accounts RLS
CREATE POLICY "Users can view their own gmail accounts"
  ON gmail_accounts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own gmail accounts"
  ON gmail_accounts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own gmail accounts"
  ON gmail_accounts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own gmail accounts"
  ON gmail_accounts FOR DELETE
  USING (user_id = auth.uid());

-- Sync Metadata RLS
CREATE POLICY "Users can view their own sync metadata"
  ON sync_metadata FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own sync metadata"
  ON sync_metadata FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sync metadata"
  ON sync_metadata FOR UPDATE
  USING (user_id = auth.uid());
