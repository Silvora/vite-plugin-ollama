import chalk from 'chalk';
import ora, { Color } from 'ora';


let spinner:any = null

/**
 * Logs the specified text to the console with the specified color.
 * @param {string} text - The text to be logged.
 * @param {Color} color - The color to use for logging the text.
 */
export const logText = (text:string,color: Color) => {
    console.log(chalk[color](`${text}`));
}


/**
 * Starts a spinner with the specified text and color.
 * 
 * @param {string} spinnerText - The text to display while the spinner is active.
 * @param {Color} color - The color of the spinner.
 */

export const logStatus = (spinnerText:string,color: Color) => {
    spinner = ora({ text:spinnerText, color,}).start()
}

/**
 * Ends the spinner with the specified text.
 * If the spinner is not running, logs a warning message to the console.
 * @param {string} spinnerText - The text to display when ending the spinner.
 */
export const logSuccess = (spinnerText:string) => {
    if (spinner) {
        spinner.succeed(spinnerText); // 结束 Spinner
    } else {
        console.warn('Spinner is not running.');
    }
}

/**
 * Logs the specified text to the console with an error message prefix.
 * The text is displayed in red color.
 * @param {string} text - The text to be logged as an error message.
 */
export const logError = (text:string) => {
    console.log(chalk.red(`🚫 [ERROR] ${text}`))    
};

/**
 * Logs a message to the console with a spinner and a success message.
 * The spinner is started with the specified start text and color.
 * The callback function is then called, and when it completes, the spinner is
 * ended with the specified end text.
 * @param {string} starText - The text to display when starting the spinner.
 * @param {Color} color - The color of the spinner.
 * @param {string} endText - The text to display when ending the spinner.
 * @param {Function} callback - The function to be called while the spinner is active.
 */
export const logMessage = (starText:string, color: Color, endText:string, callback:Function) => {
    spinner = ora({ text:starText, color,}).start()
    callback()
    spinner.succeed(endText);
};



