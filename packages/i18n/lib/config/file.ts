import path from 'path';
import { getFileDir, readFile } from "@vite-plugin-ollama/core"


// 获取文件名
export function getFilePath(sourceFile: any) {
    // /lang/zh.json -> zh
    return path.parse(sourceFile);
}



export async function getFilesData(options: any) {

    let dataBase:any = {};

    let { pathName, fileData }:any = await getFileData(options.sourceFile);
    let dirDataKey = Object.keys(fileData);
    dataBase[pathName.name] = dirDataKey;


    let direntsDir = await getFileDir(options.outDir);

    for (const dirent of direntsDir) {

        if(pathName.base === dirent.name){
            continue;
        }

        if(dirent.isFile()){

            if (path.extname(dirent.name) !== '.json') {
                continue;
            }

            let filePath = path.join(options.outDir, dirent.name);
            let { pathName, fileData }:any = await getFileData(filePath);
            dataBase[pathName.name] = fileData;
        }
       
    }

    let formatsData = await getFormatsFileData(options);   

    dataBase = {...dataBase, ...formatsData };

    // 获取翻译的字段
    for (const key in dataBase) {

        if (key === pathName.name) {
            continue;
        }
        let ofKey = getOfKey(dirDataKey, dataBase[key]);
        dataBase[key] = ofKey;
    }

    console.log('dataBase', dataBase);

}

export async function getFileData(sourceFile: string) {

    // 获取文件名
    let pathName = getFilePath(sourceFile);
    let fileData: any = null;

    try {

        let data = await readFile(sourceFile);
        fileData = data && JSON.parse(data)

    } catch (error) {

        // throw new Error('文件不存在');
        console.log('文件不存在');

    }


    return { pathName, fileData };
}


export async function getFormatsFileData(options: any) {
    // 获取格式化文件数据
    let formatsData: any = {};
    for (const format of options.formats) {
        // 获取文件名
        let formatPath = path.join(options.outDir, format + '.json');
        let { pathName, fileData }:any = await getFileData(formatPath);
        formatsData[pathName.name] = fileData;
    }

    return formatsData;
    
}


// 获取翻译的字段
export function getOfKey(key: any, data: any) {

    if (data === null || data === undefined){
        return null;
    }

    let ofKey:any = [];
    // 判断key是否在data中
    ofKey = key.filter((item: any) => {
        if(!data[item]){
            return item;
        }
    });


    return ofKey;
}