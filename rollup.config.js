import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('package.json', {encoding: 'utf8'}));
const banner = `/* zipup@${pkg.version}, license MIT */`;

export default [
  {
    input: 'src/zipup.ts',
    plugins: [
      resolve({
        modulesOnly: true,
      }),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
    ],
    output: [
      {
        format: 'umd',
        name: 'zipup',
        file: 'dist/zipup.js',
        indent: '  ',
        banner,
      },
      {
        format: 'umd',
        name: 'zipup',
        file: 'dist/zipup.min.js',
        plugins: [terser()],
        banner,
      },
      {
        format: 'es',
        file: 'dist/zipup.module.js',
        indent: '  ',
        banner,
      },
    ],
  },
];
