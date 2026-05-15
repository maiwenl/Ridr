import js from '@eslint/js'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'node_modules'] },

  // Base JS rules
  {
    ...js.configs.recommended,
    files: ['**/*.{js,jsx}'],
  },

  // React rules
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        // React
        React: 'readonly',
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',        // Pas nécessaire avec Vite / React 17+
      'react/prop-types': 'off',                // Pas de TypeScript — pas de prop-types
      'react/display-name': 'off',

      // Hooks
      ...reactHooks.configs.recommended.rules,

      // React Refresh (HMR)
      // Contexts exportent aussi des hooks custom — faux positifs attendus
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true, checkJS: false }],

      // Qualité générale
      'no-unused-vars': ['warn', {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
      }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-undef': 'error',
      'no-duplicate-imports': 'error',
      'prefer-const': 'warn',
    },
  },

  // Les fichiers de contexte exportent à la fois un Provider et un hook — faux positif react-refresh
  {
    files: ['src/contexts/*.jsx', 'src/contexts/*.js'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
]
