# vite-plugin-ollama-i18n-translate

`使用ollama本地模型进行i18n翻译`

- 基本配置
  - ✅ 可选模型
  - ✅ 可配置一次翻译的数量 根据 模型大小/电脑性能 配置
  - ✅ 可配置翻译类型
  - ✅ 可配置模型请求地址
  - ✅ 可配置 源目标文件 以及 输出目录地址
  - ❌ 未支持配置翻译的样式
  - ❌ 未支持prompt自定义
  - ❌ 未支持json嵌套模式
  - ❌ 未支持js模式的翻译

```ts
// 配置数据
interface configType {
    inputDir: string; // 翻译的源文件
    outputDir: string; // 输出翻译后放置在那个目录下
    formats: string[]; // 翻译的语言类型
    size?: number; // 分片组合翻译 本地模型按算力填写大小 默认30
    target?: string; // 翻译的类型 默认key 可选择value
    proxy?: string; // 发起请求的url 默认http://127.0.0.1:11434/api/generate
    model?: string; // 使用的模型 默认mistral-small
    translator?: () => {}; // 回调事件
}
```
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
