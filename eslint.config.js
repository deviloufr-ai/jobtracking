import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // The Firefox extension lives in its own non-git folder and has its own runtime
  // (webextension `browser`/`chrome` globals); it's not part of the app's lint scope.
  globalIgnores(['dist', 'jobtrackr-extension']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Injected by Vite's `define` (see vite.config.js).
        __COMMIT_HASH__: 'readonly',
        __COMMIT_COUNT__: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Allow intentionally-unused args/vars prefixed with _ and unused caught errors.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // The codebase deliberately swallows errors in many best-effort paths.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // Vercel serverless functions run on Node, not in the browser.
  {
    files: ['api/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
