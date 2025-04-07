import * as fs from 'fs/promises';

// 文件是否存在
export async function existsFile(path: string) {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

// 获取文件夹下的文件名称
export async function getFileDir(path: string) {
    try {
        return fs.readdir(path, { withFileTypes: true });
    } catch (error) {
        throw new Error('获取文件目录失败');
    }
}

// 读取文件
export async function readFile(path: string) {
    try {
        return fs.readFile(path, 'utf-8');
    } catch (error) {
        throw new Error('读取文件失败');
    }
}

// 写入文件
export async function writeFile(path: string, data: string) {
    try {
        await fs.writeFile(path, data);
    } catch (error) {
        throw new Error('写入文件失败');
    }
}