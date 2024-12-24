import { Plugin } from "vite";
import { logText } from "@vite-plugin-ollama/core"

export default function vitePluginOllamaI18nTranslate(
  options: configType
): Plugin {
  let projectRootPath: string; // 用于保存项目根目录
  return {
    name: "vite-plugin-ollama-i18n-translate",
    enforce: "pre",
    configResolved(config: any) {
      // 获取项目根目录
      projectRootPath = config.root;
    },
    async buildStart() {
      logText(`✨ [vite-plugin-ollama-i18n-translate] Translation process started.`, 'magenta')
      console.log("---------------------");

      // 源文本

    },
  };
}
