import { Plugin } from "vite";
import { logText } from "@vite-plugin-ollama/core"
export default function vitePluginOllamaTesting(options: configType): Plugin {
    let configOptions: any; // 用于保存项目根目录
     return {
         name: "vite-plugin-ollama-testing",
         configResolved(config: any) {
         // 获取项目根目录
             configOptions = config;
         },
         async buildStart() {
             // 开始
             logText(`✨ [vite-plugin-ollama-testing] Translation process started.`, 'green')
 
            
 
             // 结束
             logText(`✨ [vite-plugin-ollama-testing] Translation process completed.`, 'green')
         },
 
     }
 
 }