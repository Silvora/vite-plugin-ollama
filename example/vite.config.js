import MyVitePlugin from '../packages/i18n-translate/dist/index.js';
export default {
  plugins: [MyVitePlugin(
     {
         inputDir: "/locales/zh.json",
         outputDir: "/locales/",
         formats: ["en"],
     }
  )],
};
