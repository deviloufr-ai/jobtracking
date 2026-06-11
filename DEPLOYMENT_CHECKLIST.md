# JobTrackr v1.0 Deployment Checklist

## Pre-Deployment (One-time Setup)

### 1. Supabase Project Setup
- [ ] Create Supabase project at https://supabase.com
- [ ] Run migrations: `supabase migration up`
  - Alternatively: Copy-paste `supabase/migrations/001_initial_schema.sql` into Supabase SQL editor
- [ ] Verify tables created (user_metadata, jobs, cvs, settings, etc.)
- [ ] Verify RLS policies enabled on all tables

### 2. Google OAuth Configuration
- [ ] Create Google OAuth credentials at https://console.cloud.google.com
  - Project > APIs & Services > Credentials > Create OAuth 2.0 Client ID
  - Type: Web application
- [ ] Add authorized redirect URIs:
  - `https://your-project.supabase.co/auth/v1/callback`
  - `https://jobtracking-three.vercel.app/auth/callback` (production)
  - `http://localhost:5173/auth/callback` (local dev)
- [ ] Copy Client ID and Secret to Supabase Dashboard
  - Authentication > Providers > Google > Enable
  - Paste credentials

### 3. Vercel Environment Variables
Add these to Vercel project settings:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (optional, for future serverless functions)
```

Get these from: Supabase Dashboard > Project Settings > API

### 4. Test Local Build
```bash
npm install
npm run build
# Verify no errors
```

## Deployment Steps

### Step 1: Push to GitHub
```bash
git add -A
git commit -m "chore: Prepare v1.0 Supabase deployment"
git push origin main
```

### Step 2: Vercel Auto-Deploy
- Vercel automatically deploys when code is pushed to main
- Monitor deployment at https://vercel.com/dashboard
- Check build logs if deployment fails

### Step 3: Test in Production
1. **Navigate to**: https://jobtracking-three.vercel.app
2. **Test Auth Flow**:
   - Click "Sign in with Google"
   - Authorize app
   - Should redirect back to app dashboard
3. **Test Data Migration**:
   - If user has existing jobs in localStorage, migration dialog should appear
   - Verify jobs appear in dashboard after migration completes
4. **Test Jobs CRUD**:
   - Add a new job
   - Edit status
   - Verify it persists on page refresh
5. **Test Multi-Device Sync** (optional):
   - Open app on two browsers with same account
   - Edit job on Browser A
   - Browser B should see change within 30 seconds (polling interval)
6. **Test Offline**:
   - Open DevTools > Network > Offline
   - Add/edit jobs (should queue locally)
   - Go back online
   - Verify changes synced to server

## Post-Deployment

### Monitor Production
- [ ] Check Supabase Dashboard for any errors
  - Logs > Edge Logs (if using Supabase functions)
  - Database > Logs
- [ ] Monitor app performance
  - Vercel > your-project > Analytics

### Rollback Plan (if needed)
If critical issues arise:
1. Revert to previous commit: `git revert HEAD`
2. Push to main: `git push origin main`
3. Vercel auto-deploys the revert
4. Users will see previous version within 1-2 minutes

## Monitoring Checklist

### Database Health
- [ ] Check Supabase dashboard for storage usage
- [ ] Monitor RLS policy logs for denials
- [ ] Set up alerts for high error rates

### App Health
- [ ] Monitor Vercel build times (should be <2min)
- [ ] Check for failed API calls in browser console
- [ ] Monitor user feedback for sync issues

### Common Issues & Fixes

**Issue**: "Invalid API Key" error
- **Fix**: Verify `VITE_SUPABASE_ANON_KEY` in Vercel environment variables
- Double-check it's the `anon` public key, not service role key

**Issue**: Users can't see jobs after login
- **Fix**: Check RLS policies in Supabase
- Verify `user_id` column matches authenticated user ID
- Run: `SELECT * FROM jobs WHERE user_id = auth.uid();` in SQL Editor

**Issue**: OAuth redirect fails
- **Fix**: Add origin to Google OAuth authorized redirect URIs
- Check Supabase redirect URL in Auth > Settings > Site URL

**Issue**: Polling not syncing changes
- **Fix**: Check browser console for network errors
- Verify `updated_at` timestamps are being set on mutations
- Check that Supabase queries are using correct filters

## Performance Optimization (Future)

- [ ] Enable Supabase caching headers
- [ ] Implement request deduplication
- [ ] Add query performance monitoring
- [ ] Consider real-time subscriptions (instead of polling) for lower latency

## Notes

- **Polling interval**: 30 seconds (adjustable in `src/services/pollManager.js` if needed)
- **Offline queue**: Unlimited mutations queued, flushed on reconnect with exponential backoff
- **Data retention**: All data persisted in Supabase PostgreSQL (no automatic cleanup)
- **Backup**: Supabase provides automated daily backups (Pro plan and above)

## Support

For issues with:
- **Supabase**: Check https://supabase.com/docs
- **Vercel**: Check https://vercel.com/docs
- **Google OAuth**: Check https://developers.google.com/identity/protocols/oauth2

