// Single source of truth for the client-side Claude model id. Pinned by
// VITE_CLAUDE_MODEL (see CLAUDE.md); the literal fallback lives here only, so a
// model bump is a one-line env change with no code edits scattered across features.
export const CLAUDE_MODEL = import.meta.env.VITE_CLAUDE_MODEL || 'claude-haiku-4-5-20251001'
