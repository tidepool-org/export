// eslint-disable-next-line import/no-extraneous-dependencies
import esbuild from 'esbuild';

esbuild
  .build({
    entryPoints: ['app.mjs'],
    bundle: true,
    outfile: './dist/app.cjs',
    platform: 'node',
    target: 'node20',
    inject: ['./esbuild-patch.cjs'], // https://github.com/evanw/esbuild/issues/1492#issuecomment-893144483
    define: {
      'import.meta.url': 'import_meta_url',
      'self.atob': 'self_atob',
    },
    external: ['dtrace-provider'],
  })
  .catch(() => process.exit(1));
