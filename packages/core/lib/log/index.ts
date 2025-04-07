import chalk from 'chalk';
import ora, { Color } from 'ora';
chalk.level = 3;

type logType = "info" | "success" | "warn" | "error"

const colorMap: Record<string, (text: string) => string> = {
    error: chalk.red,
    success: chalk.green,
    info: chalk.blue,
    warn: chalk.yellow
    // 添加更多颜色
};

// 日志
export function log(msg: string, type: logType) {

    const colorFn = colorMap[type];
    console.log(colorFn(msg));
}


// 加载
export function logLoading(msg: string) {
    const spinner = ora(msg).start();
    return spinner;
}


