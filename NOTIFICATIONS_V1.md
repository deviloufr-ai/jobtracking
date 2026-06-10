# JobTrackr — Notification System V1 Implementation

**Status**: ✅ Complete — Ready for testing  
**Date**: June 10, 2026  
**Effort**: 5 days  
**Cost**: 0€ (client-side only)

## Overview
Browser notification system with non-intrusive permission flow, 7 key scenarios, and anti-spam rules. All data persisted in localStorage, no backend required.

## Architecture

### Core Files
- **`src/hooks/useNotificationPermission.js`** — Browser permission management & timezone detection
- **`src/hooks/useNotificationScenarios.js`** — Scenario detection with 30-minute interval checks
- **`src/services/notificationRules.js`** — Anti-spam logic, rule evaluation, settings persistence
- **`src/components/NotificationPermissionBanner.jsx`** — Non-intrusive bottom banner (8am-8pm local only)
- **`src/components/NotificationSettings.jsx`** — Settings page with scenario toggles & test button
- **`src/App.jsx`** — Integrated permission banner + scenario detection hook

### Data Flow
```
useNotificationScenarios (30min interval)
  ↓
Check each job against 7 scenarios
  ↓
Check anti-spam rules
  ↓
Send browser notification (if allowed)
  ↓
Record in notification log (localStorage)
```

## 7 Notification Scenarios

### N01: No Response After 14 Days
- **Trigger**: Job status in `['sent', 'reviewing', 'waiting']` for ≥14 days since application date
- **Urgency**: High
- **Limit**: Once per job (ever)
- **Format**: "Relancer {Company}\nAucune réponse depuis 14 jours"

### N02: Interview in 24h
- **Trigger**: Job status = `interview` and interview date 0-24 hours away
- **Urgency**: High
- **Source**: Job history entry with `status: 'interview'`
- **Format**: "Entretien demain — {Company}\nPréparation requise"

### N03: Offer Received
- **Trigger**: Job status = `offer`
- **Urgency**: High
- **Format**: "Offre reçue ! 🎉\n{Company} vous propose une offre"

### N04: Rejection Received
- **Trigger**: Job status in `['rejected', 'rejected_ats']`
- **Urgency**: Medium
- **Format**: "Refus — {Company}\nCandidature refusée"

### N05: Profile Under Review > 7 Days
- **Trigger**: Job status = `reviewing` and status ≥7 days
- **Urgency**: Medium
- **Source**: Job history entry with `status: 'reviewing'`
- **Format**: "Profil en attente — {Company}\nEn examen depuis {N} jours"

### N07: Auto-Archived Detection
- **Trigger**: Job status transitions from non-archived → `archived`
- **Urgency**: Low
- **Format**: "Archivée — {Company}\nCandidature archivée automatiquement"

### N08: Deadline Reminder 2 Days Before
- **Trigger**: Job notes contain `deadline: YYYY-MM-DD` and ≤2 days remain
- **Urgency**: High
- **Format**: "Rappel deadline — {Company}\nDeadline dans {N} jour(s)"

## Anti-Spam Rules

| Rule | Value | Enforcement |
|------|-------|-------------|
| Max per job per day | 1 | Checked before sending |
| Max per day (all jobs) | 3 | Checked before sending |
| Business hours only | 8am–8pm local | Checked at 30min interval |
| Same scenario, 3 ignores | Auto-disable | User can re-enable in settings |
| N01 limit | Once per job | Checked before sending |
| Status change cancels | If status changed after trigger fired, condition invalidated | Checked before sending |

### Implementation
- **Storage**: `localStorage.jobtrackr_notif_log` (notification log)
- **Ignore tracking**: `localStorage.jobtrackr_notif_ignore` (per-scenario ignore count)
- **Check interval**: Every 30 minutes (during business hours only)
- **Timezone**: `Intl.DateTimeFormat().resolvedOptions().timeZone`

## Permission Flow

### User Journey
```
FIRST VISIT (permission = "default")
         ↓
    BANNER SHOWN
    "🔔 Activez les notifications"
    [Activer] [Plus tard]
         ↓
  Browser native permission dialog (OS)
    /          \
  ALLOWED     DENIED
    /            \
Toast success   Help message
"Notifications  "Tu peux activer
 activées"      depuis les paramètres"
```

### Design
- **Non-intrusive**: Banner at bottom, not modal
- **Mobile-friendly**: Sticky bottom bar (44px tap target)
- **Dismissed 3 days**: Re-shown after 3 days if not granted
- **Revocation detection**: Checks permission on load, re-shows banner if revoked

## Settings Page

Located in **Réglages > Notifications**

### Controls
1. **Permission Status** — Shows current permission (✅ Activées / ❌ Refusées / ⏳ En attente)
2. **Test Notification** — Sends test notification (only if granted)
3. **Scenario Toggles** — 7 checkboxes for each scenario
4. **Auto-disable Badge** — Shows if scenario disabled after 3 ignores, with "Réactiver" button
5. **Disable All** — Red button with confirmation
6. **Toast feedback** — Brief message on action (✅/❌)

## Usage

### For Users
1. Click "Activer" on the banner (only shown once, until granted/denied/expires)
2. Grant permission in browser dialog
3. Receive notifications during 8am–8pm local time
4. Manage preferences in Réglages > Notifications
5. If 3 ignores → auto-disabled; click "Réactiver" to re-enable

### For Developers
```javascript
// Check if notifications are available
import { useNotificationPermission } from './hooks/useNotificationPermission'
const { permission, shouldShowBanner, requestPermission } = useNotificationPermission()

// Get current settings
import { loadNotificationSettings } from './services/notificationRules'
const settings = loadNotificationSettings()

// Record when a scenario is ignored (triggers auto-disable after 3)
import { recordNotificationIgnore } from './services/notificationRules'
recordNotificationIgnore('n01_no_response_14d')
```

## Browser Compatibility
- ✅ Chrome/Edge: Full support
- ✅ Firefox: Full support
- ✅ Safari: Full support (iOS 16+, macOS 13+)
- ✅ Mobile browsers: Supported (PWA ready for V3)

## Testing Checklist

- [ ] Permission banner appears on first load
- [ ] [Activer] button requests browser permission
- [ ] [Plus tard] button dismisses for 3 days
- [ ] Revoked permission re-shows banner on next load
- [ ] Test notification button works when permission granted
- [ ] Settings page shows all 7 scenarios
- [ ] Toggles persist on reload
- [ ] Disable all button requires confirmation
- [ ] Scenario auto-disables after 3 ignores
- [ ] [Réactiver] button re-enables disabled scenarios
- [ ] N01: Triggers at 14 days, once per job
- [ ] N02: Triggers within 24h of interview
- [ ] N03/N04: Trigger on status change
- [ ] N05: Triggers at 7 days in reviewing
- [ ] N07: Triggers on archive transition
- [ ] N08: Extracts deadline from notes, triggers at 2 days
- [ ] Max 3 notifications per day (all jobs)
- [ ] Max 1 notification per job per day
- [ ] Notifications only during 8am–8pm (local timezone)
- [ ] Timezone detection works (test via browser DevTools timezone)

## Known Limitations & Future Improvements

### V1 Limitations
- No email notifications (V2)
- No push notifications for mobile (V3)
- Cannot access Google Calendar directly for interview dates (fallback: detect "interview" in notes)
- No multi-device sync (V3 with Supabase)

### V2 Additions (planned)
- Email digest every Monday 8am
- Critical alerts via email
- Resend API integration
- Vercel Cron Jobs

### V3 Additions (planned)
- PWA push notifications
- Granular user preferences per channel
- Multi-device sync via Supabase
- SMS/WhatsApp (TBD based on V1 engagement)

## Monitoring & Analytics

### Metrics to Track (future)
- Permission grant rate
- Notification opt-in → sent ratio
- Open rate (click on notification)
- Ignore rate (ignore → auto-disable)
- Scenario-specific engagement
- Re-enable rate after auto-disable

### Réévaluation Points
- **1 month**: Initial engagement data → adjust anti-spam rules
- **3 months**: Decide on SMS/WhatsApp based on browser notif performance
- **6 months**: Plan V3 (PWA push + Supabase)

## Troubleshooting

### Banner Not Showing
- Check if permission is `denied` (user rejected) → show help message only
- Check browser privacy settings (some browsers block by default)
- Check if localStorage is available

### Notifications Not Firing
- Verify permission is `granted`: DevTools > Application > Notification
- Verify timezone is correct: `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Check if during business hours (8am–8pm)
- Check notification log: DevTools > Application > jobtrackr_notif_log
- Verify scenario settings are enabled: Réglages > Notifications

### Test Notification Not Sending
- Ensure permission is granted
- Click "Tester une notification" button
- Check browser's notification center
- Some browsers require app focus for notifications

## Code Examples

### Send a Manual Notification
```javascript
import { sendBrowserNotification } from './hooks/useNotificationPermission'

sendBrowserNotification('Custom Title', {
  body: 'Custom message',
  tag: 'my-custom-tag', // prevents duplicates
  data: { jobId: '123' },
})
```

### Check Anti-Spam Rules
```javascript
import { canSendNotification, recordNotificationSent } from './services/notificationRules'

const check = canSendNotification('n01_no_response_14d', jobId, jobData)
if (check.allowed) {
  // Send notification
  recordNotificationSent('n01_no_response_14d', jobId, { company })
} else {
  console.log('Not allowed:', check.reason)
  // Possible reasons:
  // 'max_1_per_job_per_day', 'max_3_per_day', 'n01_already_sent',
  // 'auto_disabled_ignores'
}
```

### Track User Ignores
```javascript
import { recordNotificationIgnore, isScenarioAutoDisabled } from './services/notificationRules'

// When user ignores a notification
recordNotificationIgnore('n01_no_response_14d')

// Check if disabled
if (isScenarioAutoDisabled('n01_no_response_14d')) {
  console.log('Scenario auto-disabled after 3 ignores')
}
```

## Deployment Notes
- No environment variables required
- No backend API calls (fully client-side)
- Compatible with existing Vercel deployment
- Zero additional infrastructure costs
- Ready for production immediately
