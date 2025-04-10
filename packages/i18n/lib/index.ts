import { initOptions } from "./init/index.ts";
 import { getPathData} from "./config/index.ts"

export default function i18nPlugin(options:any) {
  let _optionsConfig: any; // 用于保存项目根目录
  return {
    name: 'vite-plugin-i18n',
    configResolved(config: any) {
      _optionsConfig = config;
    },
    buildStart() {
      console.log('vite-plugin-i18n buildStart', options);
      // 初始化配置项 判断配置时候正确
      if(!initOptions(options)){
        return;
      }
      // 获取当前工作目录 重新赋值
      getPathData(options);
      // 获取文件地址目录 和 需翻译的内容
      // 翻译内容去重 监控翻译内容变化
      // 配置每个翻译的map,prompt
      // 请求翻译接口 进行翻译
      // 写入文件
    }
  }
}
