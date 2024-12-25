import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import alias from '@rollup/plugin-alias';
import { nodeResolve } from '@rollup/plugin-node-resolve';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log(__dirname,path.resolve(__dirname, 'dist/index.ts') )

export default defineConfig({
  input: path.resolve(__dirname, 'src/index.ts'),
  output: {
    dir: path.resolve(__dirname, 'dist'), // 使用 dir 而非 file
    format: 'es', // 或 'cjs'
    sourcemap: true,
  },
  plugins: [
    alias({
      entries: [
        { find: '@vite-plugin-ollama/core', replacement: path.resolve(__dirname, 'dist/index.js') },
      ],
    }),
    json(),     
    nodeResolve({
      include: /node_modules/, // 包括所有 node_modules 中的 CommonJS 模块
      namedExports: {
        'cli-spinners': ['default'], // 显式声明导出项
      },
    }),
    commonjs(), // 添加 commonjs 插件
    typescript({
        tsconfig: './tsconfig.json', // 指定 TypeScript 配置文件路径
      }),
  ],
  external: [], // 指定哪些依赖不打包进来
});