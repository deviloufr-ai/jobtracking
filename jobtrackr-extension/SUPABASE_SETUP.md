# Supabase Multi-Device Sync Setup

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → Sign up (or login)
2. Click **"New project"**
3. Fill in:
   - **Name:** `jobtrackr` (or whatever you prefer)
   - **Password:** Create a strong password (for database access)
   - **Region:** Pick closest to you
4. Click **"Create new project"** and wait ~2 min for setup

## Step 2: Create Database Tables

Once your project is created:

1. Go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Paste this entire SQL script and click **"Run"**:

```sql
-- Create job_applications table
CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  status TEXT DEFAULT 'prospect',
  date_applied DATE,
  url TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create user_profiles table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  title TEXT,
  experience TEXT,
  skills TEXT[],
  languages TEXT,
  education TEXT,
  ai_experience TEXT,
  recent_project TEXT,
  motivation_default TEXT,
  cv_text TEXT,
  cv_name TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies — users see only their own data
CREATE POLICY "Users see own jobs" ON job_applications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users add own jobs" ON job_applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own jobs" ON job_applications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own jobs" ON job_applications
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users see own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id);
```

4. You should see **"Success"** messages — all tables are created! ✓

## Step 3: Get Your Credentials

1. Go to **Settings** → **API** (in left sidebar)
2. Copy these two values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **Anon Key** (starts with `eyJhbG...`)
3. Keep them safe — you'll need them next

## Step 4: Configure the Extension

1. Open the JobTrackr extension popup
2. Scroll down to **☁️ Sync Supabase** (new section)
3. Enter:
   - **URL Supabase:** Paste your Project URL
   - **Clé Anon Supabase:** Paste your Anon Key
4. Click **"Configurer"** ✓

Now you'll see the **Auth** section appear!

## Step 5: Create Your Account

1. In the **Auth** section, enter:
   - **Email:** Your email
   - **Mot de passe:** Create a password
2. Click **"Créer compte"** to sign up
3. Once created, click **"Se connecter"** with same email/password
4. You'll see **✓ Connecté** — success!

## Step 6: Test Multi-Device Sync

Now your jobs sync automatically! Here's how:

### On Device 1 (e.g., laptop):
1. Open a job posting
2. Click the extension → Fill details → Click "Ajouter à JobTrackr"
3. Job syncs to Supabase automatically ✓

### On Device 2 (e.g., phone):
1. Install the extension (same account)
2. Configure Supabase with **same credentials**
3. Sign in with **same email/password**
4. Open your JobTrackr app — you'll see the job from Device 1!

## How It Works

- When you add a job: syncs to Supabase + local storage
- When you open the app on another device: fetches latest jobs from Supabase
- All data is encrypted and only you can see it (Row-Level Security)
- Works offline — syncs when you're back online

## Troubleshooting

**"Supabase non configuré"?**
- Make sure you entered the URL and Anon Key correctly
- They're in Settings → API

**"Non authentifié"?**
- Sign up and sign in from the extension first

**Jobs not showing across devices?**
- Make sure you signed in with the **same email on both devices**
- Try refreshing the app

**Forgot your password?**
- In Supabase → Authentication → Users → Find your email → "Reset password link"

## Security Notes

✓ Your data is **private** — only you can see it (RLS policies enforce this)  
✓ Passwords are **encrypted** by Supabase  
✓ Anon Key is **public** — it's safe to store (doesn't expose your data due to RLS)  

---

Now you can use JobTrackr on all your devices! 🎉
