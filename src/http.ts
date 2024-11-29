 import fetch from 'node-fetch';
 // 设置队列
 function fetchQueueItem(url:string,body:any):Promise<string[]> {
    return new Promise((resolve, reject) => {
        fetch(url,{
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }).then(response => response.json())
          .then((data:any) => {
            // 处理返回的数据
            let list = JSON.parse(data.response);
            resolve(list)
          })
          .catch(error => {
              console.log("error",error)
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
