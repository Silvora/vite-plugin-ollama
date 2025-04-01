# `@vite-plugin-ollama/i18n`

> TODO: 使用本地模型ollama进行多语言翻译


# Description

```js
import i18nPlugin from '@vite-plugin-ollama/i18n'

// 配置数据
interface configType {
    fileDir: string;
    outDir: string;
    formats: string[];
    // size?: number; // 分片组合翻译 本地模型按算力填写大小 默认20
    // target?: string; // 翻译的类型 默认key 可选择value
    proxy?: string;
    model: string | options;
    // translator?: () => {}; // 回调事件
}


export default {
  plugins: [i18nPlugin(
     {
        fileDir: "/locales/zh.json",
        outDir: "/locales/",
        formats: ["en"],
        proxy: 'ollama',
        model: 'mistral-small'
     }
  )],
};
```
- `fileDir` `<string>` 翻译的源文件地址
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
