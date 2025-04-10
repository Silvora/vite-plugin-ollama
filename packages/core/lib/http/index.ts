import got from 'got';

export function httpGet(url: string): Promise<any> {
    return got(url);
}

export function httpPost(url: string, data: any): Promise<any> {
    return got.post(url, data);
}






