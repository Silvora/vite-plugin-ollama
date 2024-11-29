import languagesJson from "./public/languages.json";
// 获取语言类型
export const getLanguage = (languages: languageType):langueItem => {
    return languagesJson[languages]
}

// 获取请求api接口
export const getApiUrl = ():string => {
    return `http://localhost:11434/api/generate`
}

// 设置prompt模版
export const setPrompt = (language:string):string => {
    return `Provide an ${language} array that is the equivalent of the following Chinese array, Only return the array you want to translate: `
}


// 验证用户数据的完整性
export const validateOptions = (options:configType):configType|null => {
    let data = options
    if(!options.target) data.target = "key"
    if(!options.model) data.model = "mistral-small"
    if(!options.porxy) data.porxy = "http://127.0.0.1:11434/api/generate"
    if(!options.size) data.size = 30
    if(options.inputDir && options.outputDir && options.formats.length){
        return data
    }else{
        return null
    }
}


// 分片数据
export const splitListSize = (arrTranslate:string[],size:number):string[][] => {
    let arr:string[][] = [];

    for(let i = 0; i < arrTranslate.length; i += size){
        arr.push(arrTranslate.slice(i, i + size));
    }

    return arr
}

// 设置headerbody
export const fetchHeaderItem = (language:languageType, splitTranslateList:string[]) => {

    let langueItem:langueItem = getLanguage(language)

    return {
        model: "mistral-small", // 确保模型名称正确
        stream: false,
        prompt: setPrompt(langueItem.language) + JSON.stringify(splitTranslateList),
    }
}

// 封装请求体参数 一个一个发起请求
export const fetchQueueItem = (language:languageType, splitTranslateList:string[][]): apiHeaderBody[] => {

    let apiItem = []

    for(let i = 0; i < splitTranslateList.length; i++){
        apiItem.push(fetchHeaderItem(language,splitTranslateList[i]))
    }

    return apiItem

}


// 合并翻译数据集合
export const mergeTranslateData = (splitTranslateList:string[][],formats:string[]) => {

    let _arrTranslateMap:translateMap = {}

    if(formats.length > 0){
        formats.forEach((item:any) => {
            _arrTranslateMap[item] = {
                arr: splitTranslateList,
                format:item,
                apiList:fetchQueueItem(item, splitTranslateList),
                translateData: []
            }
        })
    }

    return _arrTranslateMap
}


const getTranslateData = (keyList:string[][],valueList:string[][]):jsonData => {
    let keys = keyList.flat()
    let values = valueList.flat()
    let result:jsonData = {}
    for (let i = 0; i < keys.length; i++) {
      result[keys[i]] = values[i];
    }
    return result
}



// 组装翻译后的文件
export const getTranslateJson = (TranslateMapData:translateMap):translateMapData => {
    let jsonData:arrTranslateMap[] = Object.values(TranslateMapData)
    let translateMapData:translateMapData = {};
    for (let i = 0; i < jsonData.length; i++) {
        let value:arrTranslateMap = jsonData[i]
        let language = value.format
        let arr = value['arr']
        let arrData = value['translateData']
        let data = getTranslateData(arr,arrData)
        translateMapData[language] = data
    }

    return translateMapData



}
