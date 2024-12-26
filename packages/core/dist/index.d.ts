import { Color } from 'ora';

/**
 * Writes the specified data as a JSON file to the given file path.
 *
 * Resolves with `true` if the file was written successfully, or rejects with `false`
 * if there was an error.
 *
 * @param {string} filePath - The path to the file to be written.
 * @param {any} data - The data to be written as a JSON file.
 * @returns {Promise<boolean>} A promise that resolves with `true` or rejects with `false`.
 */
declare const writeJsonFile: (filePath: string, data: any) => Promise<boolean>;
/**
 * Reads a JSON file from the specified file path and returns its contents as a parsed object.
 * If the file cannot be read or parsed, the promise is rejected with an empty object.
 *
 * @param {string} filePath - The path to the JSON file to be read.
 * @returns {Promise<jsonData>} A promise that resolves with the parsed JSON data or an empty object if an error occurs.
 */
declare const readJsonFile: (filePath: string) => Promise<jsonData>;

/**
 * Logs the specified text to the console with the specified color.
 * @param {string} text - The text to be logged.
 * @param {Color} color - The color to use for logging the text.
 */
declare const logText: (text: string, color: Color) => void;
/**
 * Starts a spinner with the specified text and color.
 *
 * @param {string} spinnerText - The text to display while the spinner is active.
 * @param {Color} color - The color of the spinner.
 */
declare const logStatus: (spinnerText: string, color: Color) => void;
/**
 * Ends the spinner with the specified text.
 * If the spinner is not running, logs a warning message to the console.
 * @param {string} spinnerText - The text to display when ending the spinner.
 */
declare const logSuccess: (spinnerText: string) => void;
/**
 * Logs the specified text to the console with an error message prefix.
 * The text is displayed in red color.
 * @param {string} text - The text to be logged as an error message.
 */
declare const logError: (text: string) => void;
/**
 * Logs a message to the console with a spinner and a success message.
 * The spinner is started with the specified start text and color.
 * The callback function is then called, and when it completes, the spinner is
 * ended with the specified end text.
 * @param {string} starText - The text to display when starting the spinner.
 * @param {Color} color - The color of the spinner.
 * @param {string} endText - The text to display when ending the spinner.
 * @param {Function} callback - The function to be called while the spinner is active.
 */
declare const logMessage: (starText: string, color: Color, endText: string, callback: Function) => void;

declare const ollamaChatApi: (data: any) => Promise<any>;
declare const fetchApi: (url: string, data: any) => Promise<any>;
declare const fetchQueueItem: (url: string, model: string, map: translateMapData) => Promise<any>;

declare const ollamaModuleMap: jsonMapType;
/**
 * Given a module type and options, return a combined object with the
 * default options for the module type overridden by the provided options.
 *
 * @param {string} type - the type of module to get options for
 * @param {Object} options - the options to override the default options with
 * @return {Object} the combined options object
 */
declare const getModuleOptions: (type: string, options: any) => any;

declare const promptModule: fnType;
declare const getLanguagePrompt: (type: string, language: languageType, example: any) => string;

export { fetchApi, fetchQueueItem, getLanguagePrompt, getModuleOptions, logError, logMessage, logStatus, logSuccess, logText, ollamaChatApi, ollamaModuleMap, promptModule, readJsonFile, writeJsonFile };
