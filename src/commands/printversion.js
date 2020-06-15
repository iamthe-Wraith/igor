import { Logger } from '../../lib/logger';

export const exec = (ctx) => new Promise((resolve, reject) => {
  try {
    const packageJson = require('../../package.json');
    Logger.gen(`v${packageJson.version}`);
    resolve(ctx);
  } catch (err) {
    Logger.error(`\nunable to retrieve igor version\n${err.message}\n`);
    process.exit(0);
  }
});
