const { build } = require("esbuild")

build({
  entryPoints: ['./src/index.ts'],
  outfile: './dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'esnext',
  sourcemap: true,
  minify: true,
  external: ['vite'], // 避免将 Vite 打包到插件中
}).catch(() => process.exit(1));
