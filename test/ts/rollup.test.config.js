import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import path from 'path';

function resolveZipup() {
  return {
    name: 'resolve-zipup',
    resolveId(source) {
      if (source === '@greggman/zipup') {
        return path.resolve('dist/zipup.module.js');
      }
      return null;
    },
  };
}

export default {
  input: 'test/ts/ts-test.ts',
  plugins: [
    resolveZipup(),
    resolve({
      browser: true,
      preferBuiltins: false,
      modulesOnly: true,
    }),
    typescript({
      tsconfig: 'test/ts/tsconfig.json',
      declaration: false,
    }),
  ],
  output: {
    format: 'es',
    file: 'test/ts/ts-test.js',
    sourcemap: false,
    inlineDynamicImports: true,
  },
};
