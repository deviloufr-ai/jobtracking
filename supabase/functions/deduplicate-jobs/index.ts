import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""

serve(async (req) => {
  try {
    // Get user ID from auth header
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401 }
      )
    }

    const token = authHeader.replace("Bearer ", "")
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    // Get current user from JWT token
    let userId: string
    try {
      const jwt = token
      // Decode JWT to get user ID (sub claim)
      const parts = jwt.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid token format')
      }

      const decoded = JSON.parse(
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
      )
      userId = decoded.sub

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Invalid token: no user ID" }),
          { status: 401 }
        )
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: `Token decode failed: ${e.message}` }),
        { status: 401 }
      )
    }
    console.log(`🔄 Deduplicating jobs for user: ${userId}`)

    // Fetch all jobs for this user
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("*")
      .eq("user_id", userId)

    if (jobsError) {
      throw new Error(`Failed to fetch jobs: ${jobsError.message}`)
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No jobs found",
          deduped: 0,
          deleted: 0,
          duplicateGroups: []
        })
      )
    }

    console.log(`📦 Found ${jobs.length} total jobs`)

    // Helper functions (same as client-side)
    const normalizeCompany = (name = "") =>
      name
        .toLowerCase()
        .replace(
          /\s+(sas|sasu|sarl|sa|srl|inc|ltd|llc|gmbh|bv|nv|ag|spa|oy|ab)\.?\s*$/i,
          ""
        )
        .replace(/\.(io|com|fr|co|net|org|eu|de|uk|be|ch|ca|us|tech|dev)\s*$/i, "")
        .replace(
          /\b(technologies|digital|solutions|group|labs|studio|hq|services|consulting|innovation|ventures|project|projects)\b/gi,
          ""
        )
        .replace(/[^a-z0-9]/g, "")

    const normPos = (p) =>
      (p || "")
        .toLowerCase()
        .trim()
        .replace(/\s*[hf]\/[hf]\s*/gi, "")
        .trim()

    const GENERIC_POS = [
      "unknown",
      "unknown position",
      "poste non précisé",
      "non spécifié",
      "inconnu",
      "",
    ]
    const isGenericPos = (pos) =>
      GENERIC_POS.includes((pos || "").toLowerCase().trim())

    // Group jobs by company + position
    const groups = new Map()
    for (const job of jobs) {
      const co = normalizeCompany(job.company)
      const pos = normPos(job.position)
      const key = isGenericPos(job.position) ? co : `${co}|||${pos}`
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key).push(job)
    }

    console.log(`🏢 Found ${groups.size} unique company/position combinations`)

    // Find duplicates (groups with more than 1 job)
    const duplicates = []
    const toDelete = []

    for (const [key, group] of groups) {
      if (group.length > 1) {
        console.log(
          `  └─ ${key}: ${group.length} duplicates found`
        )

        // Sort by updated_at (most recent first) - keep the newest
        group.sort(
          (a, b) =>
            new Date(b.updated_at || b.date).getTime() -
            new Date(a.updated_at || a.date).getTime()
        )

        const primary = group[0]
        const secondaryIds = group.slice(1).map((j) => j.id)

        duplicates.push({
          company: primary.company,
          position: primary.position,
          primaryId: primary.id,
          primaryStatus: primary.status,
          primaryUpdatedAt: primary.updated_at,
          duplicateCount: secondaryIds.length,
          duplicateIds: secondaryIds,
          secondaryStatuses: group.slice(1).map((j) => j.status),
        })

        toDelete.push(...secondaryIds)
      }
    }

    console.log(`🗑️  Found ${toDelete.length} duplicates to delete`)

    // Delete duplicates
    let deletedCount = 0
    if (toDelete.length > 0) {
      const { error: deleteError, count } = await supabase
        .from("jobs")
        .delete()
        .in("id", toDelete)

      if (deleteError) {
        throw new Error(`Failed to delete duplicates: ${deleteError.message}`)
      }

      deletedCount = count || toDelete.length
      console.log(`✓ Deleted ${deletedCount} duplicate jobs`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Deduplicated ${duplicates.length} groups`,
        stats: {
          totalJobs: jobs.length,
          duplicateGroups: duplicates.length,
          deletedJobs: deletedCount,
        },
        duplicateGroups: duplicates,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    console.error("Error:", error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
})
