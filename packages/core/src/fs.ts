import fs from 'fs/promises';



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
export const writeJsonFile = (filePath: string, data: any):Promise<boolean> => {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8').then(() => {
            resolve(true);
        }).catch(() => {
            reject(false);
        })
    });
}




/**
 * Reads a JSON file from the specified file path and returns its contents as a parsed object.
 * If the file cannot be read or parsed, the promise is rejected with an empty object.
 *
 * @param {string} filePath - The path to the JSON file to be read.
 * @returns {Promise<jsonData>} A promise that resolves with the parsed JSON data or an empty object if an error occurs.
 */
export const readJsonFile = (filePath: string):Promise<jsonData> => {
    return new Promise((resolve, reject) => {
        try{
            fs.readFile(filePath, 'utf-8').then((data) => {
                resolve(data?JSON.parse(data):null);
            }).catch(() => {
                reject(null);
            })
        }catch{
            reject(null);
        }
    });
}