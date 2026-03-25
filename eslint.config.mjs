import baseConfig from '@engoo/eslint-config-engoo';
import { jsFiles, specFiles } from '@engoo/eslint-config-engoo/constants.mjs';
import mochaConfig from '@engoo/eslint-config-engoo/mocha.mjs';

export default [
  ...baseConfig,
  mochaConfig,
  {
    files: jsFiles,
    rules: {
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    files: specFiles,
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    // don't run on generated files
    ignores: [
      'lib',
      'next.js',
      'next.d.ts',
    ],
  },
];
