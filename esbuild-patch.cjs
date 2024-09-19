// https://github.com/evanw/esbuild/issues/1492#issuecomment-893144483
export const import_meta_url = require('node:url').pathToFileURL(__filename);
export const self_atob = (s) => Buffer.from(s, 'base64').toString('binary');
