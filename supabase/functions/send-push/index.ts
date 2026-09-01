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

// Localized digest body (FR default / EN).
function digestBody(nInterview: number, nFollow: number, lang: string): string {
  const en = lang === "en"
  const parts: string[] = []
  if (nInterview) parts.push(en ? `${nInterview} interview${nInterview > 1 ? "s" : ""} coming up` : `${nInterview} entretien${nInterview > 1 ? "s" : ""} à venir`)
  if (nFollow) parts.push(en ? `${nFollow} follow-up${nFollow > 1 ? "s" : ""} to do` : `${nFollow} relance${nFollow > 1 ? "s" : ""} à faire`)
  return parts.join(" · ")
}

serve(async (req) => {
  // Only the scheduler (with the shared secret) may trigger this. Fail CLOSED:
  // if CRON_SECRET isn't configured, reject everything rather than run open.
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
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

    // Prune long-dead tokens (not refreshed in 60d — the device likely dropped
    // it; it re-registers on next open).
    await supabase.from("push_tokens").delete().lt("updated_at", new Date(Date.now() - 60 * 86400000).toISOString())

    // Tokens grouped by user, carrying each device's language. select("*") so a
    // missing lang column (migration 012 not applied yet) doesn't error the run.
    const { data: tokens } = await supabase.from("push_tokens").select("*")
    if (!tokens?.length) return new Response(JSON.stringify({ sent: 0, note: "no tokens" }), { status: 200 })

    const byUser = new Map<string, { token: string; lang: string }[]>()
    for (const t of tokens) byUser.set(t.user_id, [...(byUser.get(t.user_id) || []), { token: t.token, lang: t.lang || "fr" }])
    const userIds = [...byUser.keys()]

    const today = ymd(new Date())
    const soon = ymd(new Date(Date.now() + 2 * 86400000))          // interviews within ~2 days
    const followupCut = ymd(new Date(Date.now() - FOLLOWUP_DAYS * 86400000))
    const CLOSED = new Set(["rejected", "rejected_ats", "cancelled", "archived"])

    // Pull jobs + history and derive each job's status the way the app does
    // (latest timeline entry wins), so we never notify on a stale jobs.status or
    // a candidature that's actually closed. Follow-ups use the LAST activity
    // date, not the application date.
    const [{ data: jobs }, { data: hist }] = await Promise.all([
      supabase.from("jobs").select("id, user_id, status, date").in("user_id", userIds),
      supabase.from("job_history").select("job_id, user_id, status, date").in("user_id", userIds),
    ])

    const histByJob = new Map<string, any[]>()
    for (const h of hist || []) {
      if (!h.date) continue
      histByJob.set(h.job_id, [...(histByJob.get(h.job_id) || []), h])
    }

    const tally = new Map<string, { interview: number; follow: number }>()
    for (const uid of userIds) tally.set(uid, { interview: 0, follow: 0 })

    for (const job of jobs || []) {
      const acc = tally.get(job.user_id)
      if (!acc) continue
      const hs = (histByJob.get(job.id) || []).slice().sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0))
      const latest = hs[hs.length - 1]
      const derived = latest?.status || job.status
      if (CLOSED.has(derived)) continue // dead candidature — never notify
      const lastActivity = latest?.date || job.date
      const upcomingInterview = hs.some((h) => h.status === "interview" && h.date >= today && h.date <= soon)
      if (upcomingInterview) acc.interview++
      else if (PENDING.includes(derived) && lastActivity < followupCut) acc.follow++
    }

    const accessToken = await getAccessToken(sa)
    let sent = 0
    const staleTokens: string[] = []

    for (const uid of userIds) {
      const { interview: nInterview, follow: nFollow } = tally.get(uid)!
      if (nInterview + nFollow === 0) continue

      for (const { token: tok, lang } of byUser.get(uid)!) {
        const res = await sendOne(accessToken, sa.project_id, tok, "SmartJobTracker", digestBody(nInterview, nFollow, lang))
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
