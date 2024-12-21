import fetch from 'node-fetch';

export const fetchApi = (url:string,data:any):Promise<any> => {
    return new Promise ((resolve, reject) => {
        fetch(url,{
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(response => response.json())
          .then(async (res:any) => {
            // 处理返回的数据
            try {
                const parsedData = JSON.parse(res);
                // 使用解析后的数据
                resolve(parsedData)
            } catch (error) {
                console.log(error)
                // 处理错误，例如显示友好的错误提示给用户
                resolve(await fetchApi(url,data))
            }
               
          })
          .catch(() => {
            reject(Array(30))
          });
    })
}