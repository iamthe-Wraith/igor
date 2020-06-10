import Parser from '../lib/parser';
import Process from './utils/process';
import { Logger } from '../lib/logger';
import { getConfig } from './utils/config';

import commands from 'commands';

const ctx = { ...Parser.init(...process.argv) };

ctx.config = getConfig();
Logger.init(ctx);

if (ctx.command === null ||
  (ctx.command !== '--version' && ctx.command !== '-v' && !commands.has(ctx.command))
) {
  Logger.debug(ctx);

  Logger.error('\n[-] invalid command\n');
  process.exit(1);
}

const command = (ctx.command === '--version' || ctx.command === '-v')
  ? 'printversion'
  : ctx.command;

require(`commands/${command}`).exec(ctx)
  .then(ctx => {
    if ('preventCompletion' in ctx && ctx.preventCompletion) {
      return ctx;
    } else {
      return Process.complete(ctx);
    }
  })
  .catch(err => {
    Logger.error(`\n${err.message}\n`);

    if (err.isFatal) process.exit(1);
  });
