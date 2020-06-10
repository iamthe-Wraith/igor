import path from 'path';
import fs from 'fs';

import Command from './Command';
import FatalError from '../../lib/error/fatal-error';
import * as Variation from '../utils/variation';
import { Logger } from '../../lib/logger';

const maxVariations = 104;

/**
 * instantiate new command
 */
const addvariationCommand = new Command({
  pattern: '<addvariation>',
  docs: `
    adds a new variation to a test after it has been initialized.`
});

/**
 * register all arguments
 */
addvariationCommand
  .argument('count|c', {
    type: 'int',
    description: 'the number of variations to add. each variation will follow alphabetical sequence. if not provided, will default to 1'
  });

/**
 * overwrite the before method of Command
 *
 * tests if cwd is a test directory
 *
 * verifies argument input (if found)
 *
 * if count arg provided, verifies is greater than 0
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the
 * context. rejects with new FatalError if fails
 */
addvariationCommand.before = ctx => {
  return new Promise((resolve, reject) => {
    Logger.gen('initializing...');

    const newPattern = /_\d{4}-\d{2}-\d{2}/;
    const oldPattern = /\d{4}-\d{2}-\d{2}_/;
    const {
      count = null
    } = ctx.arguments.arguments;

    let testName = process.cwd().split(path.sep);
    testName = testName[testName.length - 1];

    // test if user is inside a test directory
    if (newPattern.test(testName) || oldPattern.test(testName)) {
      try {
        fs.statSync(path.resolve(process.cwd(), 'templates')).isDirectory();
      } catch (err) {
        if (err.code === 'ENOENT') {
          reject(new FatalError(`addvariation:before error\n\nNo templates directory found. addvariation cancelled`));
        } else {
          reject(new FatalError(`addvariation:before error\n\n${err.message}`));
        }
      }

      // test if count exists and if is greater than 0
      if (count !== null) {
        if (parseInt(count) <= 0) {
          reject(new FatalError(`addvariation:before error\n\ncount must be an integer greater than 0`));
        } else {
          resolve(ctx);
        }
      } else {
        ctx.arguments.arguments.count = 1;
        resolve(ctx);
      }

      // get the template
      if (fs.existsSync(path.resolve(process.cwd(), '.testconfig'))) {
        try {
          ctx.template = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '.testconfig'), 'utf8')).template;
        } catch (err) {
          reject(new FatalError(`addvariation:before error\n\n${err.message}`));
        }
      } else {
        ctx.template = 'default';
      }
    } else {
      Logger.warn('[!] invalid directory found. this command will only work on test directories. addvariation cancelled');
      process.exit(0);
    }
  });
};

/**
 * overwrite the main method of Command
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the context.
 * rejects with error if fails
 */
addvariationCommand.main = ctx => {
  return new Promise((resolve, reject) => {
    const startingChar = 65;

    let made = 0;
    let index = 0;
    let currentVariations = null;

    // check current number of variations
    // confirm that adding the new count will not extend beyond 104 variations
    try {
      currentVariations = fs.readdirSync(process.cwd()).filter(f => f.indexOf('variant') > -1);
    } catch (err) {
      reject(new FatalError(`addvariation:main error\n\nfailed to get current variation count\n\n${err.message}`));
    }

    if (currentVariations !== null) {
      if ((currentVariations.length + ctx.arguments.arguments.count) <= maxVariations) {
        while (made < parseInt(ctx.arguments.arguments.count)) {
          let charCode = (startingChar + index);
          let iterations = 1;
          let suffix = '';

          while (charCode > 90) {
            iterations += 1;
            charCode -= 26;
          }

          for (let i = 0; i < iterations; i++) {
            suffix = `${suffix}${String.fromCharCode(charCode)}`;
          }

          if (suffix !== '') {
            const variantName = `variant${suffix}`;

            try {
              fs.statSync(path.resolve(process.cwd(), variantName));
              index++;
            } catch (err) {
              try {
                Variation.build(variantName, ctx.template);
                made++;
                index++;
              } catch (err) {
                reject(new FatalError(`addvariation:main error\n\n${err.message}`));
              }
            }
          } else {
            reject(new FatalError(`addvariation:main error\n\ninvalid variation found. failed to build valid variation suffix`));
            break;
          }
        }

        resolve(ctx);
      } else {
        reject(new FatalError(`addvariation:main error\n\ninvalid number of variations. tests cannot have more than ${maxVariations} variations`));
      }
    }
  });
};

/**
 * starting point of command. is the method called by external
 * sources for this command
 *
 * @param {Promise<Object>} ctx - the context
 */
export const exec = ctx => {
  return addvariationCommand.execute(ctx)
    .then(ctx => {
      const { count } = ctx.arguments.arguments;
      Logger.complete(`\n${count} variation${parseInt(count) > 1 ? 's' : ''} added`);
      Logger.warn('\n[!] don\'t forget to commit these changes before you proceed!\n');

      return ctx;
    });
};

/**
 * method called by external sources to retrieve help/documentation
 * about this command
 */
export const help = () => {
  addvariationCommand.help();
};
