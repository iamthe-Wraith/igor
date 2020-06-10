import os from 'os';
import fs from 'fs';
import path from 'path';

// path to the configuration file
export const configPath = path.join(os.homedir(), '.igorrc');

/**
 * @typedef {Object} GithubConfig
 * @property {string} token - Authentication token for the user
 * @property {string} username - Github username
 */

/**
 * @typedef {Object} Config
 * @property {GithubConfig} github - Github configuration
 */

/**
 * Reads config from home directory or returns undefined
 *
 * @returns {Config|undefined}
 */
export const getConfig = () => {
  let config = {};
  try {
    fs.statSync(configPath);

    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`[utils:config:getConfig] no config file found at path: ${configPath}`, err);
      config = undefined;
    } else {
      console.warn(`[utils:config:getConfig] error parsing config at path: ${configPath}`, err);
      config = undefined;
    }
  }

  return config;
};

/**
 * Writes config to home directory
 *
 * @throws
 * @param {Object} config
 * @returns {Promise<void>}
 */
export const setConfig = config => {
  try {
    fs.writeFileSync(configPath, config);
  } catch (err) {
    console.error(`[utils:config:setConfig] error setting config at path: ${configPath}`, err);
    throw err;
  }
};
