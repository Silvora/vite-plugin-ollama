# vite-plugin-ollama-testing

`使用ollama本地模型根据 jsDoc 编写测试文件`

- 基本配置
  

```ts
// 配置数据
interface configType {
    inputDir: string; // 翻译的源文件
    outputDir: string; // 输出翻译后放置在那个目录下
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
         inputDir: "/utils/*",
         outputDir: "/jest/*",
     }
  )],
};
```
