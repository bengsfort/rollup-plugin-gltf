import babel from 'rollup-plugin-babel';
import resolve from 'rollup-plugin-node-resolve';
import cjs from 'rollup-plugin-commonjs';

export default {
  input: './src/index.js',
  external: [
    'fs',
    'path',
    'mime',
    'rollup-pluginutils',
  ],
  plugins: [
    resolve(),
    cjs(),
    babel({
      babelrc: false,
      presets: [
        ['env', {
          modules: false,
        }],
      ],
      plugins: [
        'external-helpers',
      ],
    }),
  ],
};
