import chalk from 'chalk';
import ora, { Color } from 'ora';

type logType = "info" | "success" | "warn" | "error"


// 日志
export function log(msg: string, type: logType = "info") {
    console.log(chalk[type as Color](msg));
}


// 加载
export function loading(msg: string) {
    const spinner = ora(msg).start();
    return spinner;
}


