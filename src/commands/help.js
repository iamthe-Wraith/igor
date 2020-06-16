import fs from 'fs';
import path from 'path';

import Command from './Command';
import commands from '../commands';
import FatalError from '../../lib/error/fatal-error';
import { Logger } from '../../lib/logger';

/**
 * prints general help documentation including:
 *
 *   the current version of Igor
 *   list of available commands
 *   list of in test commands with descriptions for each
 */
const printGenDocs = () => {
  let version = null;

  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join('..', '..', 'package.json'), 'utf8'));
    version = `v${packageJson.version}`;
  } catch (err) {
    Logger.error(`\nhelp:printGenDocs error\b\bunable to retrieve igor version\n${err.message}\n`);
  }

  Logger.gen('\n*******************************************\n');

  Logger.title(`IGOR`);
  Logger.gen(`${version}\n`);

  Logger.gen('COMMANDS:');
  Logger.gen('* for further documentation of each command, use the command|c argument');
  Logger.gen('igor help --command [commandName]');
  Logger.gen('igor help -c [commandName]\n');

  commands.forEach(cmd => {
    if (cmd !== 'test') {
      Logger.title(`  ${cmd}`);
    }
  });

  Logger.gen('\nIN TEST COMMANDS:\n');

  Logger.title('  npm start');
  Logger.gen('    - bundles and minifies test files inside the variation\'s /build/ directory. generally it is these files that will be added to testing tools\n');

  Logger.title('  npm run dev [--htr] [--control, --a, etc...]');
  Logger.gen('    - bundles and minifies test files inside the test\'s /dev/ directory. also adds code to add css to page, so the .js file can be executed in the browser console and all styles are applied to custom changes.\n');
  Logger.gen('        - if flag --htr is included, will fire up the hot test reloader\n');
  Logger.gen('        - by default, htr will open a window for every variation. however, you can include additional flags specifying only what variations you want to have windows opened for. these optional flags follow the format "--{variant}"...so if you only wanted to open variant A, you would use the flag "--a" or "--A"\n');

  Logger.title('  npm run verbose-prod');
  Logger.gen('    - is the same as npm start, but DOES NOT minify the code\n');

  Logger.title('  npm run verbose-dev');
  Logger.gen('    - is the same as npm run dev, but DOES NOT minify the code\n');

  Logger.title('  npm run docs');
  Logger.gen('    - creates the JSDoc folder in your repo. Open docs -> index.html file in your browser to see the generated documentation.');

  Logger.gen('\n*******************************************\n');
};

/**
 * instantiate new command
 */
const helpCommand = new Command({
  pattern: '<help>',
  docs: `
    prints help documentation for Igor. if a specific command is entered, documentation for that command will be printed, otherwise, general documentation will be printed, including a list of all available commands`
});

/**
 * register argument
 */
helpCommand
  .argument('command|c', {
    description: 'the command to print help documentation for'
  });

/**
 * overwrite the main method of Command
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise.<Object|Error>} - resolves with the context.
 * rejects with error if fails
 */
helpCommand.main = ctx => {
  return new Promise((resolve, reject) => {
    const {
      command = null
    } = ctx.arguments.arguments;

    if (command === null) {
      printGenDocs();
    } else if (commands.has(command)) {
      require(`./${command}`).help();
    } else {
      reject(new FatalError(`\nhelp:main error\n\ninvalid command passed to help: ${command}. \nenter 'igor help' for a list of available commands\n`));
    }

    resolve(ctx);
  });
};

/**
 * starting point for command. is the method called by external
 * sources for this command
 *
 * @param {Object} ctx - the context
 *
 * @returns {Promise<Object>} - resolves with the context
 * once the command has completed executing
 */
export const exec = ctx => helpCommand.execute(ctx);

/**
 * method called by external sources to retrieve help/documentation
 * about this command
 */
export const help = () => {
  helpCommand.help();
};
