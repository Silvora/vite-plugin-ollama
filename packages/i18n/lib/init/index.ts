import path from "path";
import { log } from "@vite-plugin-ollama/core"
export function initOptions(options: any) {
    // 判断是否传入了配置项
    if (!options) {
        log("🙅 请传入配置项", "error");
        return false;
    }
    if (!options.sourceDir) {
        log("🙅 请传入源文件路径", "error");
        return false;
    }
    if (!options.outDir) {
        log("🙅 请传入输出文件路径", "error");
        return false;
    }
    // if (!options.proxy) {
    //     throw new Error("请传入模型 或 代理地址");
    // }
    if (!options.model) {
        log("🙅 请传入模型名称 或 请求地址", "error");
        return false;
    }
    // if (!options.apiUrl) {
    //     throw new Error("请传入翻译接口的apiUrl");
    // }
  
    // 获取当前工作目录 重新赋值
    options.sourceDir = path.resolve(process.cwd(), options.sourceDir);
    options.outDir = path.resolve(process.cwd(), options.outDir);


    if(options.proxy && options.proxy.includes("http")) {
        // 如果是http开头的地址 说明是代理地址
    }else{
        // 否则是模型名称
        // 判断模型是否存在
    }

    return false;


}
