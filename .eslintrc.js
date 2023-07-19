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
  },
  settings: {
    lodash: 3,
  },
};
