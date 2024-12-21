
export const promptModule:fnType = {
    'mistral-small': (language:languageType) => (`Translate the following text from ${language} to English: `)
}


/**
 * Return a function that generates a prompt string based on the specified
 * module type and language.
 * 
 * @param {string} type - The type of module for which to get the prompt function.
 * @param {languageType} language - The language for which to generate a prompt.
 * @returns {Function} A function that takes no arguments and returns a prompt string.
 */
export const setPrompt = (type:string, language:languageType) => {
    return promptModule[type](language)
}


/**
 * Retrieve the prompt function associated with a given module type.
 * 
 * @param {string} type - The type of module for which to get the prompt function.
 * @returns {Function} A function that generates a prompt string based on the specified module type.
 */
export const getPrompt = (type:string,) => {
    return promptModule[type]
}

