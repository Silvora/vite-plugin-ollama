import { Plugin } from "vite";

export default function vitePluginOllamaI18nTranslate(
  options: configType
): Plugin {
  return {
    name: "vite-plugin-ollama-i18n-translate",
    enforce: "pre",
    configResolved(config: any) {
      // 获取项目根目录
      // projectRoot = config.root;
      console.log("--------config.root;-------------",config);
    },
    async buildStart() {
      console.log("---------------------");
    },
  };
}
