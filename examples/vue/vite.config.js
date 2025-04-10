// import i18nPlugin from '@vite-plugin-ollama/i18n';

// export default {
//   plugins: [i18nPlugin(
//      {
//          sourceDir: "./locales/zh.json",
//          outDir: "./locales/",
//          formats: ["pr","po"],
//      }
//   )],
// };


import { defineConfig } from 'vite';
import i18nPlugin from '../../packages/i18n/lib/index';

export default defineConfig({
  plugins: [
    i18nPlugin({
      // defaultLocale: 'en',
      // localesPath: path.resolve(__dirname, 'locales')
      sourceDir: "./locales/zh.json",
      outDir: "./locales/",
      formats: ["pr","po"],
    })
  ]
});
