// rollup.config.js
import { defineConfig } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve';

const libName = 'libName'
export default defineConfig({
  input: 'index.js',
  output: [
    {
      file: `dist/${libName}.cjs.js`,
      format: 'cjs',
    },
    {
      file: `dist/${libName}.es.js`,
      format: 'es',
    },
    {
      file: `dist/${libName}.umd.js`,
      format: 'umd',
      globals: {
        'vue': 'Vue',
      },
      name: libName,
    },
  ],
  external: ['vue'],
  plugins: [
    nodeResolve(),
  ],
});
