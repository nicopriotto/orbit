import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['**/*.mjs', 'vite.config.js'], languageOptions: { globals: globals.node } },
  { files: ['tests/e2e/**'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] } },
];
