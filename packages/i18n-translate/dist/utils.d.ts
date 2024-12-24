import { Color } from 'ora';
export declare const getLanguage: (languages: languageType) => langueItem;
export declare const getApiUrl: () => string;
export declare const setPrompt: (language: string) => string;
export declare const validateOptions: (options: configType) => configType | null;
export declare const splitListSize: (arrTranslate: string[], size: number) => string[][];
export declare const fetchHeaderItem: (language: languageType, splitTranslateList: string[]) => {
    model: string;
    stream: boolean;
    prompt: string;
};
export declare const fetchQueueItem: (language: languageType, splitTranslateList: string[][]) => apiHeaderBody[];
export declare const mergeTranslateData: (splitTranslateList: string[][], formats: string[]) => translateMap;
export declare const getTranslateJson: (TranslateMapData: translateMap) => translateMapData;
export declare const logStatus: () => any;
export declare const logText: (text: string, color: Color) => void;
export declare const runPlugin: () => Promise<void>;
