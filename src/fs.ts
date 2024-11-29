import fs from 'fs/promises';
import {logText} from "./utils"

// 读取json文件
export const readJsonFile = (filePath:string):Promise<jsonData> => {
    return new Promise((resolve, reject) => {
        // 读取数据
        try{
            fs.readFile(filePath, 'utf-8').then((data) => {
                resolve(data?JSON.parse(data):{});
            }).catch(() => {
                reject({});
            })
        }catch{
            reject({})
        }
    });
}

// 写入json文件 没有则创建写入
export const writeJsonFile = (filePath:string,data:any):Promise<boolean> => {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8').then(() => {
            resolve(true);
        }).catch(() => {
            reject(false);
        })
    });
}

// 判断是否存在翻译的文件
export const isTranslationFile = (outputDir: string):Promise<string> => {
    return new Promise((resolve, reject) => {
        fs.readdir(outputDir).then((data) => {
            // 目录下面的文件 默认不需要zh.json文件
            let files = data.filter((item) => item !== 'zh.json')
            if (files.length > 0) {
                resolve(files[0]);
            } else {
                resolve('');
            }
        }).catch((error) => {
            reject(error);
        })
    });
}


// 比较两个文件的差异
export const compareFiles = (filePath1:string, filePath2:string, target:string):Promise<string[]> => {
    return new Promise( async (resolve, reject) => {


        let file1_data:any = await readJsonFile(filePath1)
        let file2_data:any

        if(filePath2){
            let file = filePath1.split("/")
            file[file.length-1] = filePath2
            filePath2 = file.join("/")
            file2_data = await readJsonFile(filePath2)
        }

        if(file2_data){

            const diff = Object.keys(file1_data).filter(key => {
                return !(key in file2_data);
            });
            resolve(diff);

        }else{

            let diff:string[] = []
            if(target === "key"){
                diff = Object.keys(file1_data)
            }
            if(target === "value"){
                diff = Object.values(file1_data)
            }
            resolve(diff);

        }
    });
}


//创建json文件,并写入json数据
export const  createJsonFile = async (isFile:string,outputDir:string, data:translateMapData) => {
    let keys = Object.keys(data)
    for (let i = 0; i < keys.length; i++) {
        let json = data[keys[i]]
        let isOK:boolean
        let filePath = outputDir+keys[i]+'.json'
        if(isFile){
            let oldData = await readJsonFile(filePath)
            isOK = await writeJsonFile(filePath, {...oldData,...json})
        }else{
            isOK = await writeJsonFile(filePath, json)
        }
        if(isOK){
            logText(`📁 File generated successfully: ${keys[i]}.json\n`, 'greenBright')
        }else{
            logText(`💥 ${keys[i]}.json file is err\n`, 'red')
        }
    }
}
