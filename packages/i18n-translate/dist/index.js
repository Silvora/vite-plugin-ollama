// src/index.ts
import { fetchQueueItem, logText, readJsonFile } from "@vite-plugin-ollama/core";
import path from "path";

// src/public/languages.json
var languages_default = {
  es: {
    type: "\u897F\u73ED\u7259\u8BED",
    language: "Spanish",
    code: "es",
    countries: ["\u897F\u73ED\u7259", "\u58A8\u897F\u54E5", "\u963F\u6839\u5EF7", "\u54E5\u4F26\u6BD4\u4E9A", "\u79D8\u9C81"],
    input: ["\u59D3\u540D", "\u5E74\u9F84", "\u5730\u5740"],
    output: ["nombre", "edad", "direcci\xF3n"]
  },
  en: {
    type: "\u82F1\u8BED",
    language: "English",
    code: "en",
    countries: ["\u7F8E\u56FD", "\u82F1\u56FD", "\u52A0\u62FF\u5927", "\u6FB3\u5927\u5229\u4E9A", "\u65B0\u897F\u5170"],
    input: ["\u59D3\u540D", "\u5E74\u9F84", "\u5730\u5740"],
    output: ["name", "age", "address"]
  },
  fr: {
    type: "\u6CD5\u8BED",
    language: "French",
    code: "fr",
    countries: ["\u6CD5\u56FD", "\u52A0\u62FF\u5927", "\u745E\u58EB", "\u6BD4\u5229\u65F6"],
    input: ["\u59D3\u540D", "\u5E74\u9F84", "\u5730\u5740"],
    output: ["nom", "\xE2ge", "adresse"]
  },
  zh: {
    type: "\u6C49\u8BED",
    language: "Chinese",
    code: "zh",
    countries: ["\u4E2D\u56FD", "\u53F0\u6E7E", "\u65B0\u52A0\u5761"],
    input: ["\u59D3\u540D", "\u5E74\u9F84", "\u5730\u5740"],
    output: ["\u59D3\u540D", "\u5E74\u9F84", "\u5730\u5740"]
  },
  ar: {
    type: "\u963F\u62C9\u4F2F\u8BED",
    language: "Arabic",
    code: "ar",
    countries: ["\u6C99\u7279\u963F\u62C9\u4F2F", "\u57C3\u53CA", "\u4F0A\u62C9\u514B"],
    input: ["\u59D3\u540D", "\u5E74\u9F84", "\u5730\u5740"],
    output: ["\u0627\u0644\u0627\u0633\u0645", "\u0627\u0644\u0639\u0645\u0631", "\u0627\u0644\u0639\u0646\u0648\u0627\u0646"]
  }
};

// src/utils.ts
import { getLanguagePrompt, writeJsonFile } from "@vite-plugin-ollama/core";
var validateOptions = (options) => {
  if (!options.outputDir) {
    return null;
  }
  if (!options.formats.length) {
    return null;
  }
  if (!options.target) options.target = "key";
  if (!options.model) options.model = "mistral-small";
  if (!options.proxy) options.proxy = "http://localhost:11434/api/generate";
  if (!options.size) options.size = 30;
  if (options.inputDir && options.outputDir && options.formats.length) {
    return options;
  } else {
    return null;
  }
};
var splitSourceList = (arrTranslate, size) => {
  let _arrTranslate = [];
  for (let i = 0; i < arrTranslate.length; i += size) {
    _arrTranslate.push(arrTranslate.slice(i, i + size));
  }
  return _arrTranslate;
};
var getTranslateData = (keyList, formats) => {
  let map = {};
  for (let language of formats) {
    let languageData = languages_default[language];
    let example = {
      input: JSON.stringify(languageData.input),
      output: JSON.stringify(languageData.output)
    };
    map[language] = {
      languageData,
      prompt: getLanguagePrompt("i18n", languageData.language, example),
      source: keyList,
      target: [],
      data: {}
    };
  }
  return map;
};
var getTranslateSuccessData = (map) => {
  for (let [key, value] of Object.entries(map)) {
    let sourceList = value.source.flat();
    let targetList = value.target.flat();
    let data = {};
    for (let i = 0; i < sourceList.length; i++) {
      data[sourceList[i]] = targetList[i];
    }
    map[key].data = data;
  }
  return map;
};
var writeFile = (outPath, data) => {
  for (let [key, value] of Object.entries(data)) {
    let data2 = value.data;
    writeJsonFile(`${outPath}/${key}.json`, data2);
  }
};

// src/index.ts
function vitePluginOllamaI18nTranslate(options) {
  let configOptions;
  return {
    name: "vite-plugin-ollama-i18n-translate",
    configResolved(config) {
      configOptions = config;
    },
    async buildStart() {
      logText(`\u2728 [vite-plugin-ollama-i18n-translate] Translation process started.`, "green");
      let data = validateOptions(options);
      if (!data) {
        logText(`\u274C The data format is incorrect`, "red");
        return;
      } else {
        options = data;
      }
      let pathRoot = configOptions.root;
      let inputPath = path.join(pathRoot, options.inputDir);
      let outPath = path.join(pathRoot, options.outputDir);
      console.log(outPath);
      let sourceText = await readJsonFile(inputPath);
      if (!sourceText) {
        logText(`\u274C The source file is empty`, "red");
        return;
      }
      let sourceList = [];
      if (options.target === "key") {
        sourceList = Object.keys(sourceText);
      } else if (options.target === "value") {
        sourceList = Object.values(sourceText);
      } else {
        sourceList = Object.keys(sourceText);
      }
      let splitSourceListText = splitSourceList(sourceList, options.size);
      let translateMap = getTranslateData(splitSourceListText, options.formats);
      let result = await fetchQueueItem(options.proxy, options.model, translateMap);
      let translateSuccessMap = getTranslateSuccessData(result);
      writeFile(outPath, translateSuccessMap);
      logText(`\u2728 [vite-plugin-ollama-i18n-translate] Translation process completed.`, "green");
    }
  };
}
export {
  vitePluginOllamaI18nTranslate as default
};
//# sourceMappingURL=index.js.map