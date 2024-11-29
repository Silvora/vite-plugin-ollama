import fs from 'fs/promises';

// 读取json文件
export const readJsonFile = (filePath:string):Promise<jsonData> => {
    return new Promise((resolve, reject) => {
        // 读取数据
        fs.readFile(filePath, 'utf-8').then((data) => {
            resolve(data?JSON.parse(data):{});
        }).catch((error) => {
            reject(error);
        })

    });
}

// 写入json文件 没有则创建写入
export const writeJsonFile = (filePath:string,data:any):Promise<boolean> => {
    return new Promise((resolve, reject) => {
        console.log(data)
        fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8').then(() => {
            resolve(true);
        }).catch(() => {
            reject(false);
        })
    });
}

// 在已有的json文件数据 追加数据
export const appendJsonFile = (filePath:string,data:any):Promise<boolean> => {
    return new Promise((resolve, reject) => {

        let oldData = readJsonFile(filePath)

        fs.writeFile(filePath, JSON.stringify({...oldData,...data}, null, 2), 'utf-8').then(() => {
            resolve(true);
        }).catch((error) => {
            reject(error);
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
export const compareFiles = (filePath1:string, filePath2:string):Promise<string[]> => {
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
            const diff = Object.keys(file1_data).filter(key => file1_data[key] !== file2_data[key]);
            resolve(diff);
        }else{
            const diff = Object.keys(file1_data)
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
        if(isFile){
            isOK = await appendJsonFile(outputDir+keys[i]+'.json',json)

        }else{
            isOK = await writeJsonFile(outputDir+keys[i]+'.json',json)
        }
        if(isOK){
            console.log(`✨ ${keys[i]} file is sucess !!!`)
        }else{
             console.log(`💥 ${keys[i]} file is err`)
        }
    }
}
