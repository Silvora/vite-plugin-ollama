import path from 'path';
import { Plugin } from 'vite';
import { compareFiles, createJsonFile, isTranslationFile } from "./fs";
import { fetchApi } from "./http";
import { getTranslateJson, mergeTranslateData, splitListSize, validateOptions,logStatus,logText,runPlugin } from "./utils";


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

        const logger = logStatus();

        logText(`✨ [vite-plugin-ollama-i18n-translate] Translation process started.`, 'blueBright')

        // 验证用户数据
        logger.start('Verify the integrity of option data...', 'green')
        let data = validateOptions(options)
        if(!data){
            logText(`❌ The data format is incorrect`, 'red')
            return
        }else{
            options = data
        }
        logger.end('[Step 1/7] Verify the integrity of option data... (done)')

        
        // 源文本
        logger.start('Retrieving source files...', 'green')
        const filePath = path.join(projectRoot, options.inputDir);
        // 翻译存放目录
        const outputDir = path.join(projectRoot, options.outputDir);
        // 判断时候存在翻译的文件
        // 存在返回一个除zh.json的文件
        // 不存在为空
        let fileTranslatePath:string = await isTranslationFile(outputDir)
        logger.end('[Step 2/7] Retrieving source files... (done)')


        
        // 获取需要翻译的数据
        // isFile有文件diff 源文件zh.json
        // isFile为空 拿到zh.json的数据
        logger.start('Retrieving text data...', 'green')
        const arrTranslate = await compareFiles(filePath, fileTranslatePath,options. target as string)

        //判断时候存在需要翻译的数据
        if(arrTranslate.length === 0){
            logger.end('[Step 3/7] No new data detected')
            logText(`🎉🎉🎉 Data is already up-to-date!`, 'greenBright')
            return
        }
        logger.end('[Step 3/7] Retrieving text data... (done)')



        
        // 分片数据进行翻译 并合并为二维数据
        logger.start('Analyze JSON data...', 'green')
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
        logger.end('[Step 4/7] Analyze JSON data... (done)')



        //发起请求 翻译文本
        logger.start('Translation data...', 'green')
        let TranslateMapData = await fetchApi(options.proxy as string,setTranslateMap)
        logger.end('[Step 5/7] Translation data... (done)')

        
        // 组装文件
        // {en:{name:"",age:""}}
        logger.start('Assemble JSON data...', 'green')
        const jsonFileMap = getTranslateJson(TranslateMapData)
        logger.end('[Step 6/7] Assemble JSON data... (done)')


        // 写入翻译后的文件
        logger.start('Write JSON data...\n', 'green')
        await createJsonFile(fileTranslatePath,outputDir,jsonFileMap)
        logger.end('[Step 7/7] Write JSON data... (done)')

        

        logText(`🎉🎉🎉 Translation process complete!`, 'yellow')
        logText(`Data is already up-to-date!`, 'greenBright')

    },
  };
}
