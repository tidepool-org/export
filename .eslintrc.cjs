module.exports = {
  extends: 'airbnb',
  parser: '@babel/eslint-parser',
  plugins: ['lodash'],
  parserOptions: {
    ecmaVersion: 6,
    requireConfigFile: false,
  },
  rules: {
    'no-plusplus': [
      'error',
      {
        allowForLoopAfterthoughts: true,
      },
    ],
    'import/extensions': [0, { '<js>': 'always' }],
  },
  settings: {
    lodash: 3,
  },
  env: {
    node: true,
    jest: true,
  },
};
