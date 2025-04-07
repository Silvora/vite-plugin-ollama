import MyVitePlugin from '@vite-plugin-ollama/i18n';

export default {
  plugins: [MyVitePlugin(
     {
         sourceFile: "./locales/zh.json",
         outDir: "./locales/",
         formats: ["pr","po"],
     }
  )],
};
