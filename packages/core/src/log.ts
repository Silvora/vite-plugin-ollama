import chalk from 'chalk';
import ora from 'ora';


export let spinner:any = null

export const logText = (text:string,color:string) => {
    console.log(chalk[color](`${text}`));
}


export const logStatus = (spinnerText:string,color: string) => {
    spinner = ora({ text:spinnerText, color,}).start()
}

export const logSuccess = (spinnerText:string) => {
    if (spinner) {
        spinner.succeed(spinnerText); // 结束 Spinner
    } else {
        console.warn('Spinner is not running.');
    }
}

export const logError = (text:string) => {
    console.log(chalk.red(`🚫 [ERROR] ${text}`))    
};

export const logMessage = (starText:string, color: string, endText:string, callback:Function) => {
    spinner = ora({ text:starText, color,}).start()
    callback()
    spinner.succeed(endText);
};


