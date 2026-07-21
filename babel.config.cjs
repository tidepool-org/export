module.exports = function babelConfig(api) {
  const presets = [
    '@babel/preset-env'
  ];

  const plugins = [
    '@babel/plugin-transform-modules-commonjs'
  ];

  api.cache(true);

  return {
    presets,
    plugins,
  };
};
