import recommended from '@eslint/js';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
import accessibility from 'eslint-plugin-jsx-a11y';

export default [
  { ignores: ['dist/**', 'node_modules/**', '.local/**', 'coverage/**'] },
  recommended.configs.recommended,
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    files: ['**/*.jsx'],
    plugins: { 'react-hooks': hooks, 'jsx-a11y': accessibility },
    rules: { ...hooks.configs.recommended.rules, ...accessibility.configs.recommended.rules },
  },
];
