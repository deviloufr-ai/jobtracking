// send-push — Supabase Edge Function that delivers Android FCM notifications.
//
// Invoke on a schedule (see the cron setup in the PR notes). For each user with
// a registered device token it builds a small digest — interviews in the next
// ~2 days and applications due for a follow-up — and pushes it via FCM HTTP v1.
//
// Required secrets (supabase secrets set ...):
//   FCM_SERVICE_ACCOUNT  – the Firebase service-account JSON (one line)
//   CRON_SECRET          – shared secret the scheduler sends as x-cron-secret
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const CRON_SECRET = Deno.env.get("CRON_SECRET") || ""

const PENDING = ["sent", "reviewing", "waiting"]
const FOLLOWUP_DAYS = 7

// ── FCM v1 auth (service account → OAuth2 access token) ──────────────────────
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s))

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")
  const bin = atob(body)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

async function getAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }
  const unsigned = `${b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64urlStr(JSON.stringify(claim))}`
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)))
  const jwt = `${unsigned}.${b64url(sig)}`
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  })
  const j = await res.json()
  if (!j.access_token) throw new Error("FCM token exchange failed: " + JSON.stringify(j))
  return j.access_token
}

async function sendOne(accessToken: string, projectId: string, token: string, title: string, body: string) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        android: { priority: "HIGH", notification: { channel_id: "default" } },
        data: { deeplink: "open" },
      },
    }),
  })
  return res
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

serve(async (req) => {
  // Only the scheduler (with the shared secret) may trigger this.
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
  }

  try {
    const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") || "{}")
    if (!sa.project_id || !sa.private_key) {
      return new Response(JSON.stringify({ error: "FCM_SERVICE_ACCOUNT not configured" }), { status: 500 })
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

    // Manual test: POST { "test_all": true } (all registered devices),
    // { "test_user_id": "<uuid>" }, or { "test_token": "..." } to push a one-off
    // notification and verify the pipeline before the cron is live. Optional
    // "message" overrides the body text.
    const body = await req.json().catch(() => ({} as any))
    if (body.test_all || body.test_user_id || body.test_token) {
      const accessToken = await getAccessToken(sa)
      let toks: string[] = body.test_token ? [body.test_token] : []
      if (body.test_user_id) {
        const { data } = await supabase.from("push_tokens").select("token").eq("user_id", body.test_user_id)
        toks = (data || []).map((r: any) => r.token)
      } else if (body.test_all) {
        const { data } = await supabase.from("push_tokens").select("token")
        toks = (data || []).map((r: any) => r.token)
      }
      let n = 0
      for (const t of toks) {
        const r = await sendOne(accessToken, sa.project_id, t, "SmartJobTracker", body.message || "Test push ✅")
        if (r.ok) n++
      }
      return new Response(JSON.stringify({ test: true, sent: n, tokens: toks.length }), {
        status: 200, headers: { "Content-Type": "application/json" },
      })
    }

    // Tokens grouped by user.
    const { data: tokens } = await supabase.from("push_tokens").select("token, user_id")
    if (!tokens?.length) return new Response(JSON.stringify({ sent: 0, note: "no tokens" }), { status: 200 })

    const byUser = new Map<string, string[]>()
    for (const t of tokens) byUser.set(t.user_id, [...(byUser.get(t.user_id) || []), t.token])
    const userIds = [...byUser.keys()]

    const today = new Date()
    const soon = new Date(today.getTime() + 2 * 86400000) // interviews within ~2 days
    const followupBefore = new Date(today.getTime() - FOLLOWUP_DAYS * 86400000)

    // Upcoming interviews per user (future-dated interview timeline entries).
    const { data: interviews } = await supabase
      .from("job_history")
      .select("user_id, date")
      .eq("status", "interview")
      .gte("date", ymd(today))
      .lte("date", ymd(soon))
      .in("user_id", userIds)

    // Applications still pending past the follow-up window.
    const { data: followups } = await supabase
      .from("jobs")
      .select("user_id")
      .in("status", PENDING)
      .lt("date", ymd(followupBefore))
      .in("user_id", userIds)

    const count = (rows: any[] | null, uid: string) => (rows || []).filter((r) => r.user_id === uid).length

    const accessToken = await getAccessToken(sa)
    let sent = 0
    const staleTokens: string[] = []

    for (const uid of userIds) {
      const nInterview = count(interviews, uid)
      const nFollow = count(followups, uid)
      if (nInterview + nFollow === 0) continue

      const parts: string[] = []
      if (nInterview) parts.push(`${nInterview} entretien${nInterview > 1 ? "s" : ""} à venir`)
      if (nFollow) parts.push(`${nFollow} relance${nFollow > 1 ? "s" : ""} à faire`)
      const body = parts.join(" · ")

      for (const tok of byUser.get(uid)!) {
        const res = await sendOne(accessToken, sa.project_id, tok, "SmartJobTracker", body)
        if (res.ok) sent++
        else if (res.status === 404 || res.status === 400) staleTokens.push(tok) // UNREGISTERED / invalid
      }
    }

    if (staleTokens.length) await supabase.from("push_tokens").delete().in("token", staleTokens)

    return new Response(JSON.stringify({ sent, users: userIds.length, pruned: staleTokens.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error("send-push error", e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
