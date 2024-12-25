import { Color } from 'ora';
export declare let spinner: any;
/**
 * Logs the specified text to the console with the specified color.
 * @param {string} text - The text to be logged.
 * @param {Color} color - The color to use for logging the text.
 */
export declare const logText: (text: string, color: Color) => void;
/**
 * Starts a spinner with the specified text and color.
 *
 * @param {string} spinnerText - The text to display while the spinner is active.
 * @param {Color} color - The color of the spinner.
 */
export declare const logStatus: (spinnerText: string, color: Color) => void;
/**
 * Ends the spinner with the specified text.
 * If the spinner is not running, logs a warning message to the console.
 * @param {string} spinnerText - The text to display when ending the spinner.
 */
export declare const logSuccess: (spinnerText: string) => void;
/**
 * Logs the specified text to the console with an error message prefix.
 * The text is displayed in red color.
 * @param {string} text - The text to be logged as an error message.
 */
export declare const logError: (text: string) => void;
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
export declare const logMessage: (starText: string, color: Color, endText: string, callback: Function) => void;
