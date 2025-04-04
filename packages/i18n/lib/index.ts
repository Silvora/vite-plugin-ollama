import { initOptions } from "./init/index.ts";

export default function i18nPlugin(options:any) {
  let optionsConfig: any; // 用于保存项目根目录
  return {
    name: 'vite-plugin-i18n',
    configResolved(options: any) {
      // 初始化 判断配置时候正确
      optionsConfig = options;
      initOptions(optionsConfig);
    },
    buildStart() {
      // 获取文件地址目录 和 需翻译的内容
      // 翻译内容去重 监控翻译内容变化
      // 配置每个翻译的map,prompt
      // 请求翻译接口 进行翻译
      // 写入文件
    }
  }
}
