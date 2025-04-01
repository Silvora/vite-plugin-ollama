import MyVitePlugin from '@vite-plugin-ollama/i18n';

export default {
  plugins: [MyVitePlugin(
     {
         inputDir: "/locales/zh.json",
         outputDir: "/locales/",
         formats: ["ar"],
     }
  )],
};
