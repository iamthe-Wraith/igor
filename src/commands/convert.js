import path from 'path';
import fs from 'fs';
import prompts from 'prompts';
import { exec as _exec } from 'child_process';

import Command from './Command';
import Github from '../../lib/github-api';
import FatalError from '../../lib/error/fatal-error';
import * as Team from '../utils/team';
import { Logger } from '../../lib/logger';

const org = 'BrooksBellInc';
const maxBuffer = 1200 * 1024;

const exclusions = new Set([
  'node_modules',
  '.DS_Store',
  '.git'
]);

let github = null;

/**
 * prompts user to enter the correct test data and
 * updates the context with the new data
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the
 * updated context. update corrects data found in
 * property testData with the following structure:
 *
 *   {
 *     name<string>,
 *     client<Object> {
 *       id<number>
 *       name<string>
 *     }
 *     date<string>
 *   }
 *
 * rejects with new FatalError on fail
 */
const getCorrectTestData = async (ctx) => {
  const results = {};
  let teamFound = false;

  const questions = [
    {
      type: 'text',
      name: 'testDate',
      message: 'what date was this test created? YYYY-MM-DD ',
      validate: res => {
        const regex = /^\d{4}-\d{2}-\d{2}/;

        if (regex.test(res)) {
          return true;
        } else {
          return '[-] invalid input - what date was this test created? YYYY-MM-DD ';
        }
      }
    },
    {
      type: 'select',
      name: 'testClient',
      message: 'what client is this test for?',
      choices: Team.getPromptOptions(ctx.teams)
    },
    {
      type: 'text',
      name: 'testName',
      message: 'what is the name of the test?',
      validate: res => {
        if (res.trim() === '') {
          return '[-] no name found - what is the name of the test?';
        } else {
          return true;
        }
      },
      format: res => {
        return res.split(' ').join('_').toLowerCase();
      }
    }
  ];

  for (let i = 0; i < questions.length; i++) {
    Logger.gen(`\n${questions[i].message}`);
    questions[i].message = '';

    try {
      const answer = await prompts(questions[i]);

      if (Object.keys(answer).length === 0) {
        Logger.warn('\nconversion cancelled\n');
        process.exit(0);
      } else {
        const keys = Object.keys(answer);
        results[keys[0]] = answer[keys[0]];
      }
    } catch (err) {
      throw new FatalError(`convert:getCorrectTestData error\n\n${err.message}`);
    }
  }

  ctx.teams.forEach(team => {
    if (results.testClient.name === team.name.toLowerCase()) {
      teamFound = true;
      ctx.testData.client = {
        id: team.id,
        name: team.name.toLowerCase()
      };
    }
  });

  if (teamFound) {
    ctx.testData = {
      ...ctx.testData,
      date: results.testDate,
      name: results.testName
    };

    return ctx;
  } else {
    throw new FatalError(`convert:confirmTestData error\n\n${results.testClient.name} was not found in your list of authorized client teams. confirm you are apart of this team before attempting to convert this test.`);
  }
};

/**
 * prompts user to confirm if data read from directory
 * name is correct.
 *
 * if is correct, adds test data to the context
 *
 * if not, user is prompted for correct data
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - updates the context
 * with the test data in the following structure:
 *
 *   {
 *     name<string>,
 *     client<Object> {
 *       id<number>
 *       name<string>
 *     }
 *     date<string>
 *   }
 * rejects with new FatalError if fails
 */
const confirmTestData = async (ctx) => {
  Logger.gen(`\n
    date: ${ctx.testData.date}
  client: ${ctx.testData.client}
    name: ${ctx.testData.name}\n`);

  Logger.gen('\nis this test data correct? Y/n ');

  try {
    const answer = await prompts({
      type: 'text',
      name: 'confirm',
      message: '',
      validate: res => {
        if (res.trim().toLowerCase() === 'y' || res.trim().toLowerCase() === 'n') {
          return true;
        } else {
          return '[-] invalid response - is this test data correct? Y/n ';
        }
      }
    });

    if ('confirm' in answer) {
      if (answer.confirm.trim().toLowerCase() === 'y') {
        let teamFound = false;
        const client = ctx.testData.client.toLowerCase();

        ctx.teams.forEach(team => {
          if (client === team.name.toLowerCase()) {
            teamFound = true;
            ctx.testData.client = {
              id: team.id,
              name: team.name.toLowerCase()
            };
          }
        });

        if (teamFound) {
          return ctx;
        } else {
          throw new FatalError(`convert:confirmTestData error\n\n${client} was not found in your list of authorized client teams. confirm you are apart of this team before attempting to convert this test.`);
        }
      } else {
        return await getCorrectTestData(ctx);
      }
    } else {
      Logger.warn('\ntest conversion cancelled\n');
      process.exit(0);
    }
  } catch (err) {
    throw new FatalError(`convert:confirmTestData error\n\n${err.message}`);
  }
};

/**
 * generates test name in format: [testName]_[clientName]_[date]
 *
 * @param {Object} ctx - the context
 * @return {string} - the full name of the test
 */
const getTestName = ctx => {
  return `${ctx.testData.name}_${ctx.testData.client.name}_${ctx.testData.date}`;
};

/**
 * creates new repo in org github account and assigns to
 * specified team, then clones repo to cwd and traverses
 * into the newly cloned directory
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with updated context.
 * update addes property 'repo' to context. rejects with new FatalError
 * if fails
 */
const createAndCloneRepo = ctx => {
  Logger.gen('creating new repo...');
  const repoOptions = {
    name: getTestName(ctx),
    team_id: ctx.testData.client.id
  };

  process.chdir(path.resolve(process.cwd(), '../'));

  return github.createRepo(repoOptions)
    .then(repo => {
      ctx.repo = repo;

      Logger.gen('cloning new repo to local machine...');
      _exec(`git clone ${ctx.repo.clone_url}`, { maxBuffer }, err => {
        if (err) {
          throw new FatalError(`convert:createAndCloneRepo error\n\nFailed to clone repo to local\n${err.message}`);
        }

        process.chdir(ctx.repo.name);

        return ctx;
      });
    })
    .catch(err => {
      throw new FatalError(`convert:createAndCloneRepo error\n\nFailed to create new repo\n${err.message}`);
    });
};

/**
 * reads directory and copies files from said directory
 * to new location
 *
 * @param {string} src - the path to the src directory
 * @param {string} dest - the path to the destination
 * directory
 */
const copyFiles = (src, dest) => {
  const templates = fs.readdirSync(src);
  templates.forEach(file => {
    if (!exclusions.has(file)) {
      if (!fs.statSync(path.resolve(src, file)).isDirectory()) {
        fs.copyFileSync(path.resolve(src, file), path.resolve(dest, file));
      } else {
        fs.mkdirSync(path.resolve(dest, file));
        const newSrc = path.resolve(src, file);
        const newDest = path.resolve(dest, file);
        copyFiles(newSrc, newDest);
      }
    }
  });
};

/**
 * moves all test files from the old test directory
 * to the new repo and deletes the old test directory
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the
 * context. rejects with new FatalError if fails
 */
const moveTestFiles = ctx => {
  return new Promise((resolve, reject) => {
    const src = path.resolve(process.cwd(), '../', ctx.testData.origTestName);
    const dest = path.resolve(process.cwd());

    Logger.gen('copying orig test files...');

    // copy files from [client]_templates
    copyFiles(src, dest);

    Logger.gen('deleting orig test directory...');
    _exec(`rm -rf ${src}`, { maxBuffer }, err => {
      if (err) {
        Logger.error(`\nconvert:moveTestFiles error\n\nfailed to delete ${src}\n${err.message}\n`);
      }

      resolve(ctx);
    });
  });
};

/**
 * clones repo: [client]_templates into test directory
 * copies files from inside [client]_templates to the
 * test root, deletes [client]_templates dir, and renames
 * BB.client.test.config.js to BB.[client].test.config.js
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the context. rejects
 * with error on fail
 */
const getTemplateFiles = ctx => {
  return new Promise((resolve, reject) => {
    const tmpPath = path.resolve(process.cwd(), 'tmp');

    try {
      fs.mkdirSync(tmpPath);

      process.chdir(tmpPath);
    } catch (err) {
      reject(new FatalError(`convert:getTemplateFiles error\n\nFailed to create tmp directory\n${err.message}`));
    }

    const clientTemplates = `http://github.com/${org}/${ctx.testData.client.name}_templates.git`;

    Logger.gen('retrieving client template files...');
    _exec(`git clone ${clientTemplates}`, { maxBuffer }, err => {
      if (err) {
        reject(new FatalError(`convert:getTemplateFiles error\n\nFailed to clone repo: ${ctx.testData.client.name}_templates\n${err.message}`));
      }

      const newWebpackConfig = path.resolve(process.cwd(), `${ctx.testData.client.name}_templates`, 'webpack.config.js');
      const newWebpackDev = path.resolve(process.cwd(), `${ctx.testData.client.name}_templates`, 'webpack.dev.js');
      const newPackageJson = path.resolve(process.cwd(), `${ctx.testData.client.name}_templates`, 'package.json');
      const newGulpFile = path.resolve(process.cwd(), `${ctx.testData.client.name}_templates`, 'gulpFile.js');
      const templatesDirectory = path.resolve(process.cwd(), `${ctx.testData.client.name}_templates`, 'templates');
      const dest = path.resolve(process.cwd(), '..');

      try {
        // replace orig template files with new ones
        fs.copyFileSync(newWebpackConfig, path.resolve(dest, 'webpack.config.js'));
        fs.copyFileSync(newWebpackDev, path.resolve(dest, 'webpack.dev.js'));
        fs.copyFileSync(newPackageJson, path.resolve(dest, 'package.json'));

        /**
         * new gulpless setup doesnt have gulpfiles anymore
         * so need to see if gulpfile exists before attempting
         * to copy the file.
         */
        if (fs.existsSync(newGulpFile)) {
          fs.copyFileSync(newGulpFile, path.resolve(dest, 'gulpFile.js'));
        }

        fs.mkdirSync(path.resolve(dest, 'templates'));
        copyFiles(templatesDirectory, path.resolve(dest, 'templates'));
      } catch (err) {
        reject(new FatalError(`convert:getTemplateFiles error\n\nfailed to replace old template files with new ones\n${err.message}`));
      }

      process.chdir(dest);

      // delete tmp directory
      _exec(`rm -rf tmp`, { maxBuffer }, err => {
        if (err) {
          reject(new FatalError(`convert:getTemplateFiles error\n\nfailed to remove tmp directory\n${err.message}`));
        }

        // rename config file and replace placeholders inside
        const newConfig = path.resolve(process.cwd(), `BB.${ctx.testData.client.name}.test.config.js`);

        try {
          let configContents = fs.readFileSync(newConfig, 'utf8');
          configContents = configContents.replace(ctx.testData.origTestName, ctx.repo.name);
          fs.writeFileSync(newConfig, configContents);
        } catch (err) {
          reject(new Error(`convert:getTemplateFiles error\n\nFailed to update testName within BB.${ctx.testData.client.name}.test.config.js\n${err.message}`));
        }

        // replace placeholders inside webpack files
        try {
          const webpackConfigPath = path.resolve(process.cwd(), 'webpack.config.js');
          let webpackConfig = fs.readFileSync(webpackConfigPath, 'utf8');

          while (webpackConfig.indexOf('replaceclientname') > -1) {
            webpackConfig = webpackConfig.replace('replaceclientname', ctx.testData.client.name);
          }

          fs.writeFileSync(webpackConfigPath, webpackConfig);
        } catch (err) {
          reject(new Error(`convert:getTemplateFiles error\n\nFailed to update webpack.config.js with client name\n${err.message}`));
        }

        try {
          const webpackDevPath = path.resolve(process.cwd(), 'webpack.dev.js');
          let webpackDev = fs.readFileSync(webpackDevPath, 'utf8');

          while (webpackDev.indexOf('replaceclientname') > -1) {
            webpackDev = webpackDev.replace('replaceclientname', ctx.testData.client.name);
          }

          fs.writeFileSync(webpackDevPath, webpackDev);
        } catch (err) {
          reject(new Error(`convert:getTeplateFiles error\n\nFailed to update webpack.dev.js with client name\n${err.message}`));
        }

        // add .gitignore if doesnt exist
        try {
          fs.statSync(path.resolve(process.cwd(), '.gitignore'));
        } catch (err) {
          if (err.code === 'ENOENT') {
            try {
              fs.writeFileSync(path.resolve(process.cwd(), '.gitignore'), 'node_modules');
              resolve(ctx);
            } catch (err) {
              reject(new Error(`convert:getTemplateFiles error\n\n${err.message}`));
            }
          } else {
            reject(new Error(`convert:getTemplateFiles error\n\n${err.message}`));
          }
        }
      });
    });
  });
};

/**
 * replaces invalid or outdated data within the file
 * passed in second parameter
 *
 * @param {Object} ctx - the context
 * @param {string} filePath - the path of the file to
 * be updated
 */
const updateVariationFile = (ctx, filePath) => {
  let fsContents = null;

  try {
    fsContents = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    Logger.error(`convert:updateVariationFile error\n\nfailed to read file: ${filePath}\n${err.message}`);
  }

  if (fsContents !== null) {
    while (fsContents.indexOf(`${ctx.testData.client.name}modules`) > -1) {
      fsContents = fsContents.replace(`${ctx.testData.client.name}modules`, `${ctx.testData.client.name}_modules`);
    }

    try {
      fs.writeFileSync(filePath, fsContents);
    } catch (err) {
      Logger.error(`convert:updateVariationFile error\n\nfailed to update file: ${filePath}\n${err.message}`);
    }
  }
};

/**
 * reads directory at provided path, and iterates
 * over contents. if content is file, calls
 * updateVariationFile, if content is another directory,
 * recursively calls this function again with the updated
 * path
 *
 * @param {Object} ctx - the context
 * @param {string} dirPath - the path to the directory to
 * be read
 */
const readDirectory = (ctx, dirPath) => {
  let dirContents = null;

  try {
    dirContents = fs.readdirSync(dirPath);

    dirContents.forEach(c => {
      if (!exclusions.has(c.trim())) {
        try {
          if (fs.statSync(path.resolve(dirPath, c)).isDirectory()) {
            readDirectory(ctx, path.resolve(dirPath, c));
          } else {
            updateVariationFile(ctx, path.resolve(dirPath, c));
          }
        } catch (err) {
          Logger.error(`convert:readDirectory error\n\nfailed to test if ${path.resolve(dirPath, c)} is a directory\nfile/directory not updated\n${err.message}`);
        }
      }
    });
  } catch (err) {
    Logger.error(`convert:readDirectory error\n\nfailed to read directory contents: ${dirPath}\n${err.message}`);
  }
};

/**
 * will update any [client]modules statements
 * to [client]_modules if found
 *
 * @param {Object} ctx - the context
 * @return {Object|Error} - resolves with
 * the context. rejects with new Error if fails
 */
const updateVariationFiles = ctx => {
  Logger.gen('updating test files...');
  readDirectory(ctx, process.cwd());
  return ctx;
};

/**
 * generates date in format: YYYY-MM-DD
 *
 * @return {string} - the formatted date
 */
const getFormattedDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1) < 10 ? `0${now.getMonth() + 1}` : now.getMonth();
  const date = now.getDate() < 10 ? `0${now.getDate()}` : now.getDate();
  return `${year}-${month}-${date}`;
};

/**
 * updates the package.json file with test specific
 * date and the latest releases of internal modules
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the
 * context. rejects with new error if fails
 */
const updatePackageJson = ctx => {
  return new Promise((resolve, reject) => {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    let packageJson = null;

    try {
      packageJson = fs.readFileSync(packageJsonPath, 'utf8');
      packageJson = JSON.parse(packageJson);
    } catch (err) {
      reject(new FatalError(`convert:updatePackageJson error\n\nFailed to read package.json\n${err.message}`));
    }

    packageJson.name = `bb_${ctx.testData.client.name}_test`;
    packageJson.description = `${ctx.testData.client.name} test build template for Brooks Bell Build Tool`;
    packageJson.BBConfig = {
      testName: ctx.repo.name,
      dateCreate: getFormattedDate(),
      client: ctx.testData.client.name
    };
    packageJson.repository = {
      type: 'git',
      url: `git+${ctx.repo.clone_url}`
    };

    // update bbmodules and [client]_modules to always use v1.0.0 (all old tests will use this version)
    packageJson.devDependencies['bbmodules'] = `git+https://github.com/${org}/bbmodules.git#v1.0.0`;
    packageJson.devDependencies[`${ctx.testData.client.name}_modules`] = `git+https://github.com/${org}/${ctx.testData.client.name}_modules.git#v1.0.0`;

    fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), err => {
      if (err) {
        reject(new FatalError(`convert:updatePackageJson error\n\nFailed to overwrite contents of package.json with test data\n${err.message}`));
      }

      resolve(ctx);
    });
  });
};

/**
 * runs npm install
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error} - resolves with the
 * context. rejects with error if fails
 */
const installDependencies = ctx => {
  return new Promise((resolve, reject) => {
    if (ctx.arguments.flags.preventinstall) {
      resolve(ctx);
    } else {
      Logger.gen('installing dependencies...');

      _exec('npm install', { maxBuffer }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`convert:installDependencies error\n\nFailed to install dependencies\n${err.message}`));
        }

        if (stdout) {
          // Logger.gen(stdout);
          // write stdout to log file in case review is needed
        } else if (stderr) {
          Logger.error(stderr);
        }

        resolve(ctx);
      });
    }
  });
};

/**
 * commit newly created test
 *
 * @returns {Promise<Object>} - resolves with the contxt
 * after the changes have been committed successfully
 */
const commitChanges = ctx => {
  return new Promise((resolve, reject) => {
    Logger.gen('generating initial commit...');

    _exec('git add -A', { maxBuffer }, err1 => {
      if (err1) reject(err1);

      _exec('git commit -m "auto-generated commit - converted old test files and structure to updated version"', { maxBuffer }, err2 => {
        if (err2) reject(err2);

        _exec('git push', { maxBuffer }, err3 => {
          if (err3) reject(err3);

          resolve(ctx);
        });
      });
    });
  });
};

/**
 * instantiate new command
 */
const convertCommand = new Command({
  pattern: '<convert>',
  docs: `
    converts a test that was built using bbwp to the new format required by BuildTool 3.0.

    instructions:

    1. copy entire original test directory to local machine, in location you wish the new test to be stored.
    2. traverse into original test directory
    3. run: igor convert`
});

convertCommand
  .flag('preventinstall|p', {
    description: 'by default, when a test is converted, dependencies are installed as part of the conversion process. by adding this flag, you prevent the install of dependencies. all other features of convert command will be executed.'
  });

/**
 * overwrite the before method of Command
 *
 * reads the orig test directory name to retrieve
 * the test data and then asks the user to confirm
 * if the data is correct
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves
 * with the updated context. rejects with error if
 * fails
 */
convertCommand.before = ctx => {
  Logger.gen('initializing...');

  const dateRegex = /^\d{4}-\d{2}-\d{2}/;
  ctx.testData = {};

  let dir = process.cwd().split(path.sep);
  dir = dir[dir.length - 1];

  ctx.testData.origTestName = dir;

  ctx.testData.date = dateRegex.exec(dir)[0];

  dir = dir.replace(`${ctx.testData.date}-`, '');
  dir = dir.split('_');

  ctx.testData.client = dir.splice(0, 1)[0];
  ctx.testData.name = dir.join('_');

  return Team.getTeams(ctx)
    .then(confirmTestData);
};

/**
 * overwrite the main method of Command
 *
 * @returns {Promise<Object>} - resolves with
 * the context once the command has completed
 * executing successfully
 */
convertCommand.main = ctx => {
  if (!!ctx.testData.name && !!ctx.testData.client && !!ctx.testData.date) {
    return createAndCloneRepo(ctx)
      .then(ctx => {
        Logger.success('[+] repo created and cloned to local');
        return ctx;
      })
      .then(moveTestFiles)
      .then(ctx => {
        Logger.success('[+] original test files moved to new repo');
        return ctx;
      })
      .then(getTemplateFiles)
      .then(ctx => {
        Logger.success('[+] client template files retrieved');
        return ctx;
      })
      .then(updateVariationFiles)
      .then(ctx => {
        Logger.success('[+] variation files updated');
        return ctx;
      })
      .then(updatePackageJson)
      .then(ctx => {
        Logger.success('[+] package.json updated with test details');
        return ctx;
      })
      .then(installDependencies)
      .then(ctx => {
        if (!ctx.arguments.flags.preventinstall) {
          Logger.success('[+] dependencies installed');
        }

        return ctx;
      })
      .then(commitChanges)
      .then(ctx => {
        Logger.success('[+] initial commit generated');
        return ctx;
      });
  } else {
    process.exit(0);
  }
};

/**
 * starting point for command. is the method called by external
 * sources for this command
 *
 * @param {Object} ctx - the context
 *
 * @returns {Promise<Object>} - resolves with the context
 * once the comand has completed executing successfully
 */
export const exec = ctx => {
  github = new Github(ctx.config.github);

  return convertCommand.execute(ctx)
    .then(ctx => {
      Logger.complete('[+] conversion complete - happy coding!');

      return ctx;
    });
};

/**
 * method called by external sources to retrieve help/documentation
 * about this command
 */
export const help = () => {
  convertCommand.help();
};
