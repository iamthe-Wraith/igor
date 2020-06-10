import os from 'os';
import path from 'path';
import colors from 'colors';

export const validColors = new Set([
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'gray',
  'grey',
  'rainbow',
  'zebra',
  'america',
  'trap',
  'random'
]);

export const validstyles = new Set([
  'title',
  'gen',
  'success',
  'warn',
  'error',
  'debug',
  'complete'
]);

export const defaultColors = {
  title: 'cyan',
  gen: 'white',
  success: 'green',
  warn: 'yellow',
  error: 'red',
  debug: 'gray',
  complete: 'rainbow'
};

export class Logger {
  static logPath = path.join(os.homedir(), '.igorlog');

  static colors = (() => {
    colors.setTheme(defaultColors);
    return defaultColors;
  })();

  /**
   * initialize logger with log path and colors
   * @todo(charles): merge log path with config and assert log file exists
   * 
   * @param {Object} context - the cli context
   * @param {{colors: Object<string, string>}} context.config
   */
  static init({ config = {} }) {
    // add colors to class
    if (typeof config.colors === 'object') {
      const validatedColors = Object.entries(config.colors)
        .reduce((acc, [style, color]) => {
          if (!validstyles.has(style)) {
            Logger.warn(`invalid style 'config.colors.${style}'`);
            return acc;
          }

          if (!validColors.has(color)) {
            Logger.warn(`invalid color '${color}' for option 'config.colors.${style}'`)
            return acc;
          }

          return { ...acc, [style]: color };
        }, {});

      Logger.colors = { ...defaultColors, ...validatedColors };
      colors.setTheme(Logger.colors);
    }
  }

  /**
   * proxies console log at a given level (default or error) call
   * and adds color to string arguments
   * 
   * @param {string} style - the style to log with
   * @param {Array<any>} args
   */
  static _logWithStyle = (style, level, ...args) =>
    console[level || 'log'](...args.map(arg => typeof arg === 'string' ? arg[style] : arg));

  static title = (...args) =>
    Logger._logWithStyle('title', null, ...args);
  
  static gen = (...args) =>
    Logger._logWithStyle('gen', null, ...args);

  static success = (...args) => 
    Logger._logWithStyle('success', null, ...args);

  static warn = (...args) =>
    Logger._logWithStyle('warn', null, ...args);
  
  static error = (...args) =>
    Logger._logWithStyle('error', 'error', ...args);

  static debug = (...args) =>
    Logger._logWithStyle('debug', null, ...args);
  
  static complete = (...args) =>
    Logger._logWithStyle('complete', null, ...args);
}
