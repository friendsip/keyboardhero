import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'phaser/*'], message: 'src/core must stay framework-free (docs/02).' },
            { group: ['../scenes/*', '../entities/*', '../fx/*', '../input/*', '../storage/*'], message: 'src/core may not import from outer layers (docs/02).' },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the injected seeded Rng (docs/README rule 3).' },
        { object: 'Date', property: 'now', message: 'Core may not read the wall clock (docs/README rule 3).' },
        { object: 'performance', property: 'now', message: 'Core may not read the wall clock (docs/README rule 3).' },
      ],
      'no-restricted-globals': ['error', 'setTimeout', 'setInterval'],
    },
  },
  {
    files: ['src/scenes/**/*.ts', 'src/entities/**/*.ts', 'src/fx/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'setTimeout', 'setInterval'],
    },
  },
);
