import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { boundaries } from './scripts/eslint-boundaries.mjs';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.agents/**', '.gesture-globe/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['tests/**/*.mjs'],
    languageOptions: { globals: { fetch: 'readonly' } },
  },
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    languageOptions: {
      globals: { document: 'readonly', HTMLElement: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'boundaries/imports': 'error',
    },
  },
  {
    files: ['src/gesture/**/*.ts', 'src/workers/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'document',
        'window',
        'navigator',
        'HTMLElement',
        'HTMLVideoElement',
      ],
    },
  },
];
