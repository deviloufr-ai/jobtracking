import { Capacitor } from '@capacitor/core'
import { supabase, resolveAuthUserId } from './supabase'

// Native (Android) FCM push registration. No-op on the web.
//
// We only request the POST_NOTIFICATIONS permission and register once the user
// is signed in — prompting on a cold, pre-login open is jarring and a denial
// there is wasted. On the 'registration' event the device token is stored in
// Supabase (push_tokens) against the signed-in user.

let lastToken = null
let started = false
let registered = false

async function saveToken(token) {
  if (!token) return
  lastToken = token
  try {
    const userId = await resolveAuthUserId()
    if (!userId) return // retried on the next auth change
    await supabase.from('push_tokens').upsert(
      { token, user_id: userId, platform: Capacitor.getPlatform(), updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    )
  } catch (e) {
    console.error('push: saveToken failed', e)
  }
}

export async function initPushNotifications() {
  if (started || !Capacitor.isNativePlatform()) return
  started = true

  let PushNotifications
  try {
    ({ PushNotifications } = await import('@capacitor/push-notifications'))
  } catch (e) {
    console.error('push: plugin unavailable', e)
    return
  }

  PushNotifications.addListener('registration', (token) => { saveToken(token.value) })
  PushNotifications.addListener('registrationError', (err) => { console.error('push: registration error', err) })
  // Foreground / tap handlers — left minimal; the payload can carry a jobId to
  // deep-link later. For now the OS shows the notification.
  PushNotifications.addListener('pushNotificationReceived', (n) => { console.log('push received', n?.title) })
  PushNotifications.addListener('pushNotificationActionPerformed', (a) => { console.log('push tapped', a?.notification?.title) })

  // Request permission + register once (gated on being signed in).
  const requestAndRegister = async () => {
    if (registered) return
    try {
      let perm = await PushNotifications.checkPermissions()
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions()
      }
      if (perm.receive !== 'granted') { console.log('push: permission not granted'); return }
      registered = true
      await PushNotifications.register()
    } catch (e) {
      console.error('push: register failed', e)
    }
  }

  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session) requestAndRegister()
  } catch { /* ignore */ }

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      requestAndRegister()
      if (lastToken) saveToken(lastToken)
    }
  })
}
