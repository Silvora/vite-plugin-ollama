// 配置数据
interface configType {
    inputDir: string, // 翻译的源文件
    outputDir: string, // 输出翻译后放置在那个目录下
    formats: string[], // 翻译的语言类型
    size?: number, // 分片组合翻译 本地模型按算力填写大小 默认30
    target?: string, // 翻译的类型 默认key 可选择value
    porxy?: string, // 发起请求的url 默认http://127.0.0.1:11434/api/generate
    model?: string, // 使用的模型 默认mistral-small
    translator?: ()=>{}, // 回调事件
}

interface apiHeaderBody {
    model: string, // 模型名称
    stream: boolean, // 是否流式输出
    prompt: string, // 提示词
}


interface arrTranslateMap {
    arr: string[][],
    format: string,
    apiList: apiHeaderBody[],
    translateData: string[][]
}

type translateMap = {
    [x: string]: arrTranslateMap
}

type jsonMap = keyof translateMap

type jsonData = {
    [x:string]:string
}

type jsonKey = keyof jsonData



type translateMapData = {
    [ x:string]: jsonData
}


interface langueItem {
    type: string,
    language: string,
    code: string,
    countries: string[]
}

// 语言类型
type languageType = "zh"|"en"|"es"


declare module '*.json';
