// import fetch from 'node-fetch';
import ollama from 'ollama'
import JSON5 from "json5"


// const isArray = (arr:any) => {
//     return Array.isArray(arr);
// }

export const ollamaChatApi = async (data:any):Promise<any> => {
    return new Promise (async (resolve, reject) => {
        console.log(data)
        const response:any = await ollama.chat(data)
        let parsedData = []
        console.log(response.message.content)
        try {
            // 使用解析后的数据
            parsedData = JSON5.parse(response.message.content)
        } catch (error:any) {
             // 正则匹配
             const regex = /\[.*?\]/;
             const match = response.message.content.match(regex);
             const matchStr = match ? match[0] : '';
 
             if(matchStr){
                parsedData = JSON5.parse(matchStr);
             }else{
                console.log("数据不对,重新请求数据...")

                resolve(await ollamaChatApi(data))
             }
        }

        // 处理返回的数据
        resolve(parsedData)
    
    })
}

export const fetchApi = async (url:string,data:any):Promise<any> => {
    return new Promise (async (resolve, reject) => {
        // fetch(url,{
        //     method: 'POST',
        //     headers: {
        //         'Content-Type': 'application/json'
        //     },
        //     body: JSON.stringify(data)
        // }).then(response => response.json())
        //   .then(async (res:any) => {

        //     console.log(".....",res)
        //     const parsedData = JSON.parse(res);
        //     // 判断是否是一个数组
        //     if(!Array.isArray(parsedData)){
        //         resolve(await fetchApi(url,data))
        //     }

        //     // 处理返回的数据
        //     try {
        //         // 使用解析后的数据
        //         resolve(parsedData)
        //     } catch (error) {
        //         console.log("========",error)
        //         // 处理错误，例如显示友好的错误提示给用户
        //         resolve(await fetchApi(url,data))
        //     }
               
        //   })
        //   .catch(() => {
        //     reject(Array(30))
        //   });
    
    })
}


export const fetchQueueItem = async (url:string,model:string,map:translateMapData):Promise<any> => {
    for(let [key,value] of Object.entries(map)){
        // 历史会话
        // for(let i = 0; i < value.source.length; i++){
        //     let prompt =`${ i==0 ? value.prompt : ''}'${JSON.stringify(value.source[i])}'`
        //     let data = {
        //         model:model,
        //         messages: [{
        //             role: 'user',
        //             stream:false,
        //             content:prompt
        //         }]
        //     }
        //     let res = await ollamaChatApi(data)
        //     map[key].target.push(res)
        // }
        for(let item of value.source as any){
            let prompt =`${value.prompt}'${JSON.stringify(item)}'`
            let data = {
                model:model,
                messages: [{
                    role: 'user',
                    stream:false,
                    content:prompt
                }]
            }
            let res = await ollamaChatApi(data)
            map[key].target.push(res)
        }
    }

    return map
}

