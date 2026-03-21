import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginAntfu from 'eslint-plugin-antfu'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    ignores: ['**/node_modules', '**/dist', '**/out', '.tmp-*/**', 'tmp-*/**', 'package/**']
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      antfu: eslintPluginAntfu,
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      'antfu/if-newline': 'error',
      'antfu/import-dedupe': 'error',
      'antfu/top-level-function': 'error',
      'max-lines': ['error', { max: 450, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 220, skipBlankLines: true, skipComments: true, IIFEs: true }
      ],
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  eslintConfigPrettier
)
