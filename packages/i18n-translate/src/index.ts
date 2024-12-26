import { Plugin } from "vite";
import { fetchQueueItem, logText, readJsonFile } from "@vite-plugin-ollama/core"
import path from "path";
import { validateOptions, splitSourceList, getTranslateData, getTranslateSuccessData, writeFile } from "./utils"

export default function vitePluginOllamaI18nTranslate(options: configType): Plugin {
   let configOptions: any; // 用于保存项目根目录
    return {
        name: "vite-plugin-ollama-i18n-translate",
        configResolved(config: any) {
        // 获取项目根目录
            configOptions = config;
        },
        async buildStart() {
            // 开始
            logText(`✨ [vite-plugin-ollama-i18n-translate] Translation process started.`, 'green')

            // 验证用户数据
            let data = validateOptions(options)
            if (!data) {
                logText(`❌ The data format is incorrect`, 'red')
                return
            } else {
                options = data
            }

            // 获取项目根目录
            let pathRoot = configOptions.root
            // 获取翻译目录 翻译原文本 
            let inputPath = path.join(pathRoot, options.inputDir);
            let outPath = path.join(pathRoot, options.outputDir);

            // 判断时候存在翻译过的文件
            // todo...

            // 读取源文本内容
            let sourceText = await readJsonFile(inputPath)
            if(!sourceText){
                logText(`❌ The source file is empty`, 'red')   
                return
            }

            // 根据需要翻译的字段进行提取
            let sourceList: string[] = []
            if(options.target === "key"){
                sourceList = Object.keys(sourceText)
            }else if(options.target === "value"){
                sourceList = Object.values(sourceText) as string[]
            }else{
                sourceList = Object.keys(sourceText)
            }

            // 根据翻译文本进行分割
            let splitSourceListText = splitSourceList(sourceList, options.size as number)

          
            // 组装数据
            // options = {
            //     TranslateMap:{
            //         "$language":{
            //             languageData:'',        
            //             prompt:'',
            //             source:[[],[],[]],
            //             target:[[],[],[]],
            //         },
            //     }
            // }
            let translateMap = getTranslateData(splitSourceListText, options.formats)

            // 进行翻译
            let result = await fetchQueueItem(options.proxy as string, options.model as string , translateMap)
            // options.translateMap = result
            

            // 整合翻译数据
            let translateSuccessMap = getTranslateSuccessData(result)

            // 写入文本
            // 写入 是否存在翻译过的文件
            // todo...

            // 写入翻译结果
            writeFile(outPath, translateSuccessMap)


            // 结束
            logText(`✨ [vite-plugin-ollama-i18n-translate] Translation process completed.`, 'green')
        },

    }

}


// export default function vitePluginOllamaI18nTranslate(
//   options: configType
// ): Plugin {
//   let projectRootPath: string; // 用于保存项目根目录
//   return {
//     name: "vite-plugin-ollama-i18n-translate",
//     enforce: "pre",
//     configResolved(config: any) {
//       // 获取项目根目录
//       projectRootPath = config.root;
//     },
//     async buildStart() {
//       logText(`✨ [vite-plugin-ollama-i18n-translate] Translation process started.`, 'magenta')
//       console.log("---------------------",options);

//       // 源文本

//     },
//   };
// }
