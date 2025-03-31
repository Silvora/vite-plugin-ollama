import * as fs from 'fs/promises';

// 文件是否存在
async function existsFile(path: string) {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

// 获取文件夹下的文件名称
async function readdir(path: string) {
    return fs.readdir(path);
}

// 读取文件
async function readFile(path: string) {
    return fs.readFile(path, 'utf-8');
}

// 写入文件
async function writeFile(path: string, data: string) {
    return fs.writeFile(path, data);
}