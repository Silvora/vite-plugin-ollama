import got from 'got';

export function httpGet(url: string) {
    return got(url);
}

export function httpPost(url: string, data: any) {
    return got.post(url, data);
}






