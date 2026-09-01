import { Capacitor } from '@capacitor/core'
import { supabase, resolveAuthUserId } from './supabase'

// Native (Android) FCM push registration. No-op on the web.
//
// Flow: request the POST_NOTIFICATIONS permission (Android 13+), register with
// FCM, and on the 'registration' event store the device token in Supabase
// (push_tokens table) against the signed-in user. A backend Edge Function reads
// those tokens to send pushes. The token is re-saved when the user signs in, so
// a token obtained before login still gets associated once auth is known.

let lastToken = null
let started = false

async function saveToken(token) {
  if (!token) return
  lastToken = token
  try {
    const userId = await resolveAuthUserId()
    if (!userId) return // will retry on the next auth change
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

  try {
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') {
      console.log('push: permission not granted')
      return
    }

    PushNotifications.addListener('registration', (token) => { saveToken(token.value) })
    PushNotifications.addListener('registrationError', (err) => { console.error('push: registration error', err) })
    // Foreground / tap handlers — left minimal; the payload can carry a jobId to
    // deep-link later. For now the OS shows the notification.
    PushNotifications.addListener('pushNotificationReceived', (n) => { console.log('push received', n?.title) })
    PushNotifications.addListener('pushNotificationActionPerformed', (a) => { console.log('push tapped', a?.notification?.title) })

    await PushNotifications.register()

    // A token captured before sign-in gets associated once the user logs in.
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && lastToken) saveToken(lastToken)
    })
  } catch (e) {
    console.error('push: init failed', e)
  }
}
