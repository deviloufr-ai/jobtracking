// Short unique-id helper. Prefers crypto.randomUUID(); falls back to a
// prefix+timestamp+random string in the rare environments where it's unavailable
// (old WebViews, non-secure contexts). Centralized so id generation lives in one
// place instead of being copy-pasted per component.
export function uid(prefix = 'id') {
  try {
    return crypto.randomUUID()
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }
}
