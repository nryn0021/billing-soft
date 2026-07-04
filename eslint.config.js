import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'data']),
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // react-hooks v7 ships React-Compiler-preview rules. This project does not use
      // the compiler, so the following flag idiomatic, correct patterns (syncing state
      // to route/query changes, reading `Date.now()` in render). rules-of-hooks,
      // exhaustive-deps, refs, immutability and static-components stay ON.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      // Fast-refresh nicety: our UI kit + context intentionally co-locate helpers.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['server/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])
