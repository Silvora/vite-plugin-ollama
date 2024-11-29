import MyVitePlugin from '../dist/index.js';

export default {
  plugins: [MyVitePlugin(
     {
         inputDir: "/locales/zh.json",
         outputDir: "/locales/",
         formats: ["en"],
     }
  )],
};
