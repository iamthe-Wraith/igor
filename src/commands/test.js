import Command from './Command';
import { Logger } from '../../lib/logger';
import FatalError from '../../lib/error/fatal-error';
import Process from '../utils/process';

/**
 * instantiate the Command object and pass in the parameter
 * pattern
 */
const testCommand = new Command({
  pattern: '<test> <username> <password> <optionalParam?>',
  docs: `
    this is just a test command
    and these docs will be used inside the help command
    so be sure to update them for each command created.`
});

/**
 * register all arguments, parameters, and flags
 */
testCommand
  .parameter('username', {
    description: 'the users github username'
  })
  .parameter('password', {
    description: 'the users github password'
  })
  .parameter('optionalParam', {
    type: 'int',
    description: 'some optional parameter.'
  })
  .flag('foo|f', {
    description: 'a meaningless flag used for reference only'
  })
  .argument('bar|b', {
    type: 'string',
    description: 'a meaningless argument used for reference only'
  });

/**
 a* overwrite the before method (if something needs to be
 * done before the main piece of execution)
 *
 * @param {Object} - the context
 *
 * @returns {Promise<Object>} resolves with the context
 * after preparation is completed successfully
 */
testCommand.before = ctx => {
  return new Promise((resolve, reject) => {
    Logger.debug('inside before');

    try {
      // do stuff
      resolve(ctx);
    } catch (err) {
      reject(new FatalError(`test:before error\n\n${err.message}`));
    }
  });
};

/**
 * overwrite the after method (if something needs to be
 * done after the main piece of execution)
 *
 * @param {Object} - the context
 *
 * @returns {Promise<Object>} resolves with the context
 * after cleanup has been completed successfully
 */
testCommand.after = ctx => {
  return new Promise((resolve, reject) => {
    Logger.debug('inside after');
    resolve(ctx);
  });
};

/**
 * overwrite the main method...this is the main piece of execution
 * for the command
 *
 * @param {Object} - the context
 *
 * @returns {Promise<Object>} resolves with the context
 * after main body of command completes executing
 * successfully.
 */
testCommand.main = ctx => {
  return new Promise((resolve, reject) => {
    Logger.debug('inside main');

    Logger.debug(`doing something with username: ${ctx.arguments.parameters.username}`);
    Logger.debug(`and password: ${ctx.arguments.parameters.password}`);
    if ('optionalParam' in ctx.arguments.parameters) {
      Logger.debug(`....and the optionalParam: ${ctx.arguments.parameters.optionalParam} if it exists`);
    }

    resolve(ctx);
  });
};

/**
 * main entry point for this command
 *
 * @param {Object} - the context
 *
 * @returns {Promise<Object>} resolves with the context
 * after the command has completed executing successfully
 */
// all command files MUST export this function........
export const exec = ctx => {
  /***
   * execute the command
   ***/
  testCommand.execute(ctx)
    .then(ctx => {
      Logger.complete('[+] complete');

      Process.complete(ctx);
    })
    .catch(err => {
      Logger.error(`\n${err.message}\n`);

      if (err.isFatal) {
        process.exit(1);
      }
    });
};

// ....... and this function
export const help = () => {
  testCommand.help();
};
