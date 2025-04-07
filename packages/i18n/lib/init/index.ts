import path from "path";
export function initOptions(options: any) {
    // 初始化配置项
    // 1. 判断是否传入了配置项
    if (!options) {
        throw new Error("请传入配置项");
    }
    // 2. 判断配置项是否正确
    if (!options.sourceFile) {
        throw new Error("请传入源文件路径");
    }
    if (!options.outDir) {
        throw new Error("请传入输出文件路径");
    }
    // if (!options.apiKey) {
    //     throw new Error("请传入翻译接口的apiKey");
    // }
    // if (!options.apiUrl) {
    //     throw new Error("请传入翻译接口的apiUrl");
    // }
  
    options.sourceFile = path.resolve(process.cwd(), options.sourceFile);
    options.outDir = path.resolve(process.cwd(), options.outDir);

}
