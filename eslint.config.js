import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import architecture from './scripts/architecture-rules.mjs';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'public/**', 'research/**', 'artifacts/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    plugins: { react, 'react-hooks': hooks, architecture },
    rules: {
      'architecture/import-boundaries': 'error',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': [
        'warn',
        { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' },
      ],
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
  })),
  {
    files: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['scripts/*.mjs', '*.config.js', 'api/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
