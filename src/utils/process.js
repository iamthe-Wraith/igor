import fs from 'fs';
import path from 'path';

import Github from '../../lib/github-api';
import { Logger } from '../../lib/logger';

const maxMessagingChars = 80; // the maximum number of characters allowed in messaging
const maxRange = 100; // the max range to use in random number generator.

let github = null;

/**
 * displays some fun messages randomly if user's
 * local version of igor is newer than the
 * latest release found on github since this usually
 * indicates the user is working on something new.
 *
 * @param {string} localVersion - the user's local
 * version of igor
 */
const displayNewerVersionMessaging = localVersion => {
  const messages = [
    'look at you building new stuff! keep up the good work!!!',
    'awww yeah, lookin forward to seein what you\'re buildin!',
    'keep up the awesome work!!!',
    `dang, ${localVersion}! look at you advancing the team!`,
    'love seeing you contribute!!! keep it up!',
    'you\'re doin great!!!'
  ];

  const rand = Math.floor(Math.random() * maxRange);

  if (rand < (messages.length)) {
    let border = '';

    for (let i = 0; i < maxMessagingChars; i++) border += '*';
    for (let i = 0; i < messages.length; i++) {
      const emptyChars = Math.floor((maxMessagingChars - messages[i].length) / 2);
      let spaces = '';

      for (let j = 0; j < emptyChars; j++) spaces += ' ';

      messages[i] = `${spaces}${messages[i]}`;
    }

    Logger.warn(`\n\n${border}\n`);
    Logger.gen(messages[rand]);
    Logger.warn(`\n${border}\n\n\n`);
  }
};

/**
 * prints a message to the console that tells
 * the user their local version of igor
 * is outdated and that they should run
 * igor update to update to the latest version.
 *
 * @param {string} local - the user's local
 * version of igor
 *
 * @param {string} latest - the latest release
 * of igor found on github
 */
const displayOutdatedMessaging = (local, latest) => {
  const messages = [
    'your version of igor is outdated',
    `follow these instructions to update ${local} => ${latest}\n`,
    '- traverse into your local igor directory',
    '- run: \'git pull\'',
    '- run: \'npm run build\''
  ];

  let border = '';

  for (let i = 0; i < maxMessagingChars; i++) border += '*';

  Logger.warn(`\n\n${border}\n\n`);
  for (let i = 0; i < messages.length; i++) {
    const regex = /^-/;
    let emptyChars = 0;
    let spaces = '';
    let isInstruction = false;

    if (regex.test(messages[i])) {
      isInstruction = true;
      messages[i] = `\t${messages[i]}`;
    } else {
      emptyChars = Math.floor((maxMessagingChars - messages[i].length) / 2);
    }

    for (let j = 0; j < emptyChars; j++) spaces += ' ';

    isInstruction ? Logger.gen(`${spaces}${messages[i]}`) : Logger.title(`${spaces}${messages[i]}`);
  }
  Logger.warn(`\n\n${border}\n\n\n`);
};

/**
 * compares the user's local version
 * of igor to the latest release
 * of it in github. if the local version
 * is found to be behind the latest release,
 * a notification will be displayed to the user.
 *
 * @return {Promise<void>}
 */
const testIfUserHasLatestVersion = ctx => {
  if (github === null) {
    github = new Github(ctx.config.github);
  }

  let localStatus = null;

  return github.getLatestRelease({ repoName: 'igor' })
    .then(release => {
      const latestVersion = release.tag_name.replace('v', '').split('.');
      let localVersion = null;

      try {
        localVersion = JSON.parse(fs.readFileSync(path.join('..', '..', 'package.json'), 'utf8')).version.replace('v', '').split('.');
      } catch (err) {
        throw new Error('failed to get latest version of igor');
      }

      if (localVersion) {
        let isBehind = false;

        if (localVersion[0] < latestVersion[0]) {
          isBehind = true;
        } else if (localVersion[1] < latestVersion[1] && localVersion[0] <= latestVersion[0]) {
          isBehind = true;
        } else if (localVersion[2] < latestVersion[2]) {
          if ((localVersion[1] === latestVersion[1] && localVersion[0] === latestVersion[0]) || localVersion[1] < latestVersion[1] || localVersion[0] < latestVersion[0]) {
            isBehind = true;
          }
        }

        if (isBehind) {
          localStatus = -1;
        } else if (localVersion[2] === latestVersion[2] && localVersion[1] === latestVersion[1] && localVersion[0] === latestVersion[0]) {
          localStatus = 0;
        } else {
          localStatus = 1;
        }

        return {
          status: localStatus,
          localVersion: `v${localVersion.join('.')}`,
          latestVersion: `v${latestVersion.join('.')}`
        };
      }
    })
    .catch(err => {
      if (err.message === 'Not Found') {
        Logger.warn('\n[!] no versions found\n');

        process.exit(1);
      } else {
        throw err;
      }
    });
};

/**
 * intended to be called at the end of
 * the exection of a process as the last
 * step.
 *
 * @param {Promise<Object>} ctx - the context
 */
const complete = ctx => {
  if (github === null) {
    github = new Github(ctx.config.github);
  }

  return testIfUserHasLatestVersion()
    .then(results => {
      if (results.status === -1) {
        // is behind
        displayOutdatedMessaging(results.localVersion, results.latestVersion);
      } else if (results.status === 0) {
        // is current, do nothing
      } else if (results.status === 1) {
        // is ahead
        displayNewerVersionMessaging(results.localVersion);
      }

      return ctx;
    });
};

export default {
  complete,
  testIfUserHasLatestVersion
};
