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
export declare const writeJsonFile: (filePath: string, data: any) => Promise<boolean>;
/**
 * Reads a JSON file from the specified file path and returns its contents as a parsed object.
 * If the file cannot be read or parsed, the promise is rejected with an empty object.
 *
 * @param {string} filePath - The path to the JSON file to be read.
 * @returns {Promise<jsonData>} A promise that resolves with the parsed JSON data or an empty object if an error occurs.
 */
export declare const readJsonFile: (filePath: string) => Promise<jsonData>;
