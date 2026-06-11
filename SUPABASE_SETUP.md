# Supabase Setup Guide - JobTrackr v1.0

This guide walks through setting up Supabase for multi-device sync with offline-first architecture.

## Prerequisites

- Supabase account (free tier OK): https://supabase.com
- Supabase CLI: `npm install -g supabase`
- Node.js 18+

## Step 1: Create Supabase Project

1. Go to https://supabase.com and sign in
2. Click "New project"
3. Choose a name (e.g., "jobtrackr") and region
4. Save the database password securely
5. Wait for project to be provisioned (2-5 minutes)

## Step 2: Get API Keys

1. In Supabase dashboard, go to **Project Settings** → **API**
2. Copy these values to `.env` file:
   - `VITE_SUPABASE_URL`: Project URL (e.g., `https://abc123.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY`: `anon` public key
   - `SUPABASE_SERVICE_ROLE_KEY`: Service role key (for backend only)

```bash
# .env file (local only, not committed)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

## Step 3: Run Database Migrations

```bash
# Install Supabase CLI globally (if not already)
npm install -g supabase

# Login to Supabase (first time only)
supabase login

# Navigate to project directory
cd jobtracking

# Link to your Supabase project
supabase link --project-ref your-project-ref

# Run migrations
supabase migration up

# Or run migrations directly via Supabase SQL editor:
# 1. Go to Supabase Dashboard → SQL Editor
# 2. Open: supabase/migrations/001_initial_schema.sql
# 3. Copy-paste all SQL
# 4. Click "Run"
```

## Step 4: Configure Google OAuth

1. Go to **Authentication** → **Providers** → **Google**
2. Enable the provider
3. Enter your Google OAuth credentials:
   - Client ID: (from Google Cloud Console)
   - Client Secret: (from Google Cloud Console)
4. Add redirect URL: `https://your-project.supabase.co/auth/v1/callback`

### Get Google OAuth Credentials

1. Go to https://console.cloud.google.com
2. Create a new project (or use existing)
3. Enable Google+ API
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Choose "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:5173/auth/callback` (development)
   - `https://jobtracking-three.vercel.app/auth/callback` (production)
   - `https://your-project.supabase.co/auth/v1/callback` (Supabase)
7. Copy Client ID and Secret to Supabase dashboard

## Step 5: Set Up Row-Level Security (RLS)

The migration file includes RLS policies. Verify they're enabled:

1. Go to **Database** → **Tables**
2. For each table (jobs, cvs, user_settings, etc.):
   - Click the table
   - Click **RLS** button
   - Verify policies are listed (should see "Users can view/update their own...")

If policies aren't showing, run the RLS policy creation statements from the migration file in the SQL editor.

## Step 6: Verify Schema

```bash
# In Supabase SQL Editor, run:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

You should see these tables:
- user_metadata
- jobs
- job_history
- position_checks
- cvs
- user_settings
- deleted_jobs
- notifications
- notification_log
- gmail_accounts
- sync_metadata

## Step 7: Update Vercel Environment Variables

Add these to Vercel project settings (not in .env file):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>  (for API functions if needed)
```

## Testing Supabase Connection

```javascript
// src/services/supabase.js will test this on app load
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

// Test connection
const { data, error } = await supabase.auth.getSession()
console.log('Connected to Supabase:', { data, error })
```

## Troubleshooting

### "Invalid API Key"
- Check `VITE_SUPABASE_ANON_KEY` in `.env`
- Make sure it's the `anon` public key, not service role key

### "Failed to run migrations"
- Run migrations manually in Supabase SQL editor
- Check for syntax errors in migration file
- Verify database hasn't been tampered with

### "RLS denying access"
- Check auth context is set up (useAuth hook)
- Verify RLS policies reference `auth.uid()`
- Test policies in Supabase dashboard

### "Connection timeout"
- Check internet connection
- Verify Supabase project is running (check status page)
- Try `supabase status` command

## Local Development vs Production

### Local Development
```bash
# Run local Supabase instance
supabase start

# This starts local PostgreSQL + Supabase emulator
# Use localhost URLs in .env.local
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Production (Vercel)
```bash
# Uses cloud Supabase instance
# URLs configured in Vercel project settings
```

## Next Steps

1. Phase 2: Implement Gmail OAuth in React (src/hooks/useAuth.js)
2. Phase 3: Build localStorage → Supabase migration script
3. Phase 4: Implement IndexedDB cache and sync queue
4. Phase 5: Implement 30-second polling

## References

- [Supabase Docs](https://supabase.com/docs)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Google OAuth Setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
