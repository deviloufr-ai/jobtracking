import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

const commitCount = (() => {
  try { return execSync('git rev-list --count HEAD').toString().trim() } catch { return '?' }
})()
const commitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return '' }
})()

export default defineConfig({
  plugins: [react()],
  define: {
    __COMMIT_COUNT__: JSON.stringify(commitCount),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
})
