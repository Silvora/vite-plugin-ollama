 import fetch from 'node-fetch';
 import { logText } from "./utils"
 // 设置队列
 function fetchQueueItem(url:string,body:any):Promise<string[]> {
    return new Promise ((resolve, reject) => {
        fetch(url,{
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }).then(response => response.json())
          .then(async (data:any) => {
            // 处理返回的数据
            try {
                const parsedData = JSON.parse(data.response);
                // 使用解析后的数据
                resolve(parsedData)
            } catch (error) {
                // 处理错误，例如显示友好的错误提示给用户
                logText(`JSON 解析错误,进行重试: ${error}`, 'red')
                resolve(await fetchQueueItem(url,body))
            }
               
          })
          .catch(() => {
            reject(Array(30))
          });
    })
}

// 发起请求 并组装数据
export const fetchApi = (url:string,data:translateMap):Promise<translateMap> => {
    let config:translateMap = data;
    return new Promise((resolve, reject) => {
        Object.keys(config).forEach(async (item:any) => {
            for (let index = 0; index < config[item].apiList.length; index++) {
                const apiItem = config[item].apiList[index];
                let res = await fetchQueueItem(url,apiItem);
                config[item].translateData.push(res)
            }
            resolve(config)
        })
    })

}
