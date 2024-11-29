# vite-plugin-ollama-i18n-translate

## 使用ollama本地模型进行翻译

## 可任选ollama模型

## 基本配置

```ts
// 配置数据
interface configType {
    inputDir: string; // 翻译的源文件
    outputDir: string; // 输出翻译后放置在那个目录下
    formats: string[]; // 翻译的语言类型
    size?: number; // 分片组合翻译 本地模型按算力填写大小 默认30
    target?: string; // 翻译的类型 默认key 可选择value
    porxy?: string; // 发起请求的url 默认http://127.0.0.1:11434/api/generate
    model?: string; // 使用的模型 默认mistral-small
    translator?: () => {}; // 回调事件
}
```

## dist目录为编译后文件

## 用法
```js
import MyVitePlugin from '../dist/index.js';

export default {
  plugins: [MyVitePlugin(
     {
         inputDir: "/locales/zh.json",
         outputDir: "/locales/",
         formats: ["en"],
     }
  )],
};
```
