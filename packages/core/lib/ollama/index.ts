import Ollama from 'ollama';

// 判断时候下载ollama模型
async function isDownloadOllama(ollamaName: string) {  
    let list = await Ollama.list()
    return list.models.filter(item => item.name == ollamaName).length > 0
}

export async function ollamaChat(ollamaInfo:any) {

    let isDownload = await isDownloadOllama(ollamaInfo.name)

    // 已下载
    if (isDownload) {

        const response = await Ollama.chat({
            model: ollamaInfo.name,
            messages: [{ role: 'user', content: ollamaInfo.content }],
        })

        return response.message.content
    }

    // 未下载
    throw new Error('模型未下载')

}