import path from 'path';
import { Plugin } from 'vite';
import { compareFiles, createJsonFile, isTranslationFile } from "./fs";
import { fetchApi } from "./http";
import { getTranslateJson, mergeTranslateData, splitListSize, validateOptions } from "./utils";

export default function vitePluginOllamaI18nTranslate(options:configType): Plugin {
  let projectRoot: string; // 用于保存项目根目录
  return {
    name: 'vite-plugin-ollama-i18n-translate',
    enforce: 'pre',
    configResolved(config:any) {
        // 获取项目根目录
        projectRoot = config.root;
    },
    async buildStart() {
        console.log("✅ translation init...");

        // 验证用户数据
        let data = validateOptions(options)
        if(!data){
            console.error("The data format is incorrect...")
            return
        }else{
            options = data
        }

        console.log("✅ retrieve source files...");
        // 源文本
        const filePath = path.join(projectRoot, options.inputDir);

        // 翻译存放目录
        const outputDir = path.join(projectRoot, options.outputDir);


        console.log("✅ parsing data ing...");
        // 判断时候存在翻译的文件
        // 存在返回一个除zh.json的文件
        // 不存在为空
        let fileTranslatePath:string = await isTranslationFile(outputDir)

        // 获取需要翻译的数据
        // isFile有文件diff 源文件zh.json
        // isFile为空 拿到zh.json的数据
        const arrTranslate = await compareFiles(filePath,fileTranslatePath)

        // 分片数据进行翻译 并合并为二维数据
        let splitTranslateList = splitListSize(arrTranslate,options.size as number)
        // {
        //    en:{
        //          arr: 所有数据,
        //          format: 翻译语言,
        //          apiList: api请求数据
        //          translateData: 翻译数据
        //    }
        // }
        let setTranslateMap = mergeTranslateData(splitTranslateList,options.formats)

        console.log("✅ translation ing...");
        //发起请求 翻译文本
        let TranslateMapData = await fetchApi(options.porxy as string,setTranslateMap)

        // 组装文件
        // {en:{name:"",age:""}}
        const jsonFileMap = getTranslateJson(TranslateMapData)


        console.log("✍️ write file ing...");
        // 写入翻译后的文件
        await createJsonFile(fileTranslatePath,outputDir,jsonFileMap)


        console.log("🎉🎉🎉 sucess!!!")

    },
  };
}
