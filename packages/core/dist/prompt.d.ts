export declare const promptModule: fnType;
/**
 * Return a function that generates a prompt string based on the specified
 * module type and language.
 *
 * @param {string} type - The type of module for which to get the prompt function.
 * @param {languageType} language - The language for which to generate a prompt.
 * @returns {Function} A function that takes no arguments and returns a prompt string.
 */
export declare const setPrompt: (type: string, language: languageType) => any;
/**
 * Retrieve the prompt function associated with a given module type.
 *
 * @param {string} type - The type of module for which to get the prompt function.
 * @returns {Function} A function that generates a prompt string based on the specified module type.
 */
export declare const getPrompt: (type: string) => (...args: any[]) => any;
