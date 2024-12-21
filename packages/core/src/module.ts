
export const ollamaModuleMap: jsonMapType = {
    // 翻译
    'mistral-small':{
        type: 'mistral-small',
        model: "mistral-small",
        stream: "false",
    }
}

/**
 * Given a module type and options, return a combined object with the
 * default options for the module type overridden by the provided options.
 *
 * @param {string} type - the type of module to get options for
 * @param {Object} options - the options to override the default options with
 * @return {Object} the combined options object
 */
export const getModuleOptions = (type:string, options: any) => { 
    const module = ollamaModuleMap[type]

    return {...module, ...options}
}





