import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  input: path.resolve(__dirname, 'src/index.ts'),
  output: {
      dir: path.resolve(__dirname, 'dist'), // 使用 dir 而非 file
      format: 'es', // 或 'cjs'
      sourcemap: true,
  },
  plugins: [
    nodeResolve(),
    typescript({
      tsconfig: './tsconfig.json', // 指定 TypeScript 配置文件路径
    }),
  ],
});