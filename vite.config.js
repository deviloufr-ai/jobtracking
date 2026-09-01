import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { APP_VERSION, MIN_NATIVE_VERSION } from './src/constants/appVersion.js'

const commitCount = (() => {
  try { return execSync('git rev-list --count HEAD').toString().trim() } catch { return '?' }
})()
const commitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return '' }
})()

// Emit /version.json into the build so the deployed site advertises its version
// for the in-app "new version available" check (see hooks/useAppUpdate).
const emitVersionJson = () => ({
  name: 'emit-version-json',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({
        version: APP_VERSION,
        minNative: MIN_NATIVE_VERSION,
        build: commitCount,
        hash: commitHash,
        builtAt: new Date().toISOString(),
      }),
    })
  },
})

export default defineConfig({
  plugins: [react(), emitVersionJson()],
  define: {
    __COMMIT_COUNT__: JSON.stringify(commitCount),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
})
