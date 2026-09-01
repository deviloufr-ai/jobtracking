import { supabase, isSupabaseConfigured, getSession } from './supabase'
import { Capacitor } from '@capacitor/core'

// One-shot sync self-test. Exercises the REAL Supabase read + write path from
// THIS device and returns a plain object to render in Settings → Debug. Built to
// diagnose the native (Android) build, whose webview console isn't reachable, so
// the actual HTTP outcome of a write can be seen on the phone.
//
// Non-destructive: the write test only bumps an existing job's updated_at (which
// simply makes it re-sync). The key signal is `write.rowsAffected`: a write that
// returns 0 rows with NO error means the per-user auth JWT never reached Supabase
// (RLS silently blocked it) — the exact failure behind the missing cross-device
// sync. rowsAffected === 1 means writes work and the problem is elsewhere.
export async function runSyncDiagnostic() {
  const hasWin = typeof window !== 'undefined'
  const report = {
    at: new Date().toISOString(),
    env: {
      native: !!Capacitor?.isNativePlatform?.(),
      platform: Capacitor?.getPlatform?.() || 'web',
      origin: hasWin ? window.location.origin : '(none)',
      // Is Capacitor's original browser fetch present (i.e. CapacitorHttp is
      // active and patched window.fetch)? And is our Supabase bypass in effect?
      capacitorWebFetch: hasWin && typeof window.CapacitorWebFetch === 'function',
      fetchPatched: hasWin && typeof window.CapacitorWebFetch === 'function'
        ? window.fetch !== window.CapacitorWebFetch
        : false,
      supabaseConfigured: isSupabaseConfigured(),
    },
    auth: {},
    read: {},
    write: {},
  }

  if (!isSupabaseConfigured()) {
    report.error = 'Supabase not configured — this build is local-only, nothing syncs.'
    return report
  }

  // ── Auth ──
  let userId = null
  try {
    const session = await getSession()
    userId = session?.user?.id || null
    report.auth = {
      hasSession: !!session,
      userId,
      email: session?.user?.email || null,
      accessTokenPresent: !!session?.access_token,
    }
  } catch (e) {
    report.auth = { error: String(e?.message || e) }
  }

  if (!userId) {
    report.error = 'No Supabase session on this device — not signed in, so nothing can sync.'
    return report
  }

  // ── Read test ──
  let probeJobId = null
  try {
    const t0 = Date.now()
    const { data, error, count } = await supabase
      .from('jobs')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .limit(1)
    report.read = {
      ok: !error,
      count: count ?? (data?.length ?? 0),
      ms: Date.now() - t0,
      error: error ? { message: error.message, code: error.code } : null,
    }
    probeJobId = data?.[0]?.id || null
  } catch (e) {
    report.read = { ok: false, error: String(e?.message || e) }
  }

  // ── Write test (non-destructive: bump updated_at on an existing job) ──
  if (!probeJobId) {
    report.write = { ok: false, skipped: 'no existing job to probe' }
    return report
  }
  try {
    const t0 = Date.now()
    const { data, error, status } = await supabase
      .from('jobs')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', probeJobId)
      .eq('user_id', userId)
      .select('id')
    const rowsAffected = data?.length ?? 0
    report.write = {
      ok: !error && rowsAffected > 0,
      rowsAffected,
      httpStatus: status,
      ms: Date.now() - t0,
      probeJobId,
      error: error ? { message: error.message, code: error.code } : null,
    }
    if (!error && rowsAffected === 0) {
      report.write.diagnosis =
        'WRITE AFFECTED 0 ROWS WITH NO ERROR → the auth JWT is not reaching Supabase (RLS blocked the update). This is the sync bug.'
    } else if (report.write.ok) {
      report.write.diagnosis = 'Writes work on this device. If sync still lags, the issue is on the merge/propagation side, not the write.'
    }
  } catch (e) {
    report.write = { ok: false, error: String(e?.message || e) }
  }

  return report
}
