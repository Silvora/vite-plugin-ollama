# `@vite-plugin-ollama/i18n`

> 使用本地模型ollama进行多语言翻译 

## Todo
- ❓ 判断是否是 vite 环境
- ❓ 翻译文件是否可以指定后缀
  - ❓ 翻译文件指定后, 是否可以指定翻译内容的 `key` 和 `value`
- ❓ 使用本地ollama, 是否根据电脑性能大小进行分片翻译
  - ❓ 是否默认开启, 默认为30一组
- ❓ 用户是否可以自定义prompt
- ❓ 是否添加内置函数, 可自定义翻译内容

## Description

```js
import i18nPlugin from '@vite-plugin-ollama/i18n'

// 配置数据
interface configType {
    sourceDir: string;
    outDir: string;
    formats: string[];
    proxy?: string;
    model: string | options;
}


export default {
  plugins: [i18nPlugin(
     {
        sourceDir: "/locales/zh.json",
        outDir: "/locales/",
        formats: ["en"],
        proxy: 'ollama',
        model: 'mistral-small'
     }
  )],
};
```
- `sourceDir` `<string>` 翻译的源文件地址
- `outDir` `<string>` 输出翻译后放置在那个目录下
- `formats` `<string[]>` 翻译的语言类型
- `proxy` `<string>` (可选) 模型的类型 默认本地ollama
  - `ollama` 使用本地模型, 直接写 `ollama`
  - `url` 使用 `url` 进行请求, 需写完整请求地址
- `model` `<string | options>` (可选)使用模型的详细信息
  - `string` 使用本地ollama时使用, 直接写模型名称即可
  - `options` 使用url使用, 需配置除地址外的详情信息




## Usage

```js
const i18n = require('@vite-plugin-ollama/i18n');

// TODO: DEMONSTRATE API
```
