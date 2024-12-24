export declare const readJsonFile: (filePath: string) => Promise<jsonData>;
export declare const writeJsonFile: (filePath: string, data: any) => Promise<boolean>;
export declare const isTranslationFile: (outputDir: string) => Promise<string>;
export declare const compareFiles: (filePath1: string, filePath2: string, target: string) => Promise<string[]>;
export declare const createJsonFile: (isFile: string, outputDir: string, data: translateMapData) => Promise<void>;
