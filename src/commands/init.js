import path from 'path';
import fs from 'fs';
import prompts from 'prompts';
import { exec as _exec } from 'child_process';

import Command from './Command';
import Github from '../../lib/github-api';
import FatalError from '../../lib/error/fatal-error';
import * as Variation from '../utils/variation';
import * as Team from '../utils/team';
import { Logger } from '../../lib/logger';
import { getFormattedDate } from '../utils/date';
import { parseTemplateVariables } from '../utils/template-variables';

import NonClientTeams from '../../config/non-client-teams';

const org = 'BrooksBellInc';
const maxBuffer = 1200 * 1024;
const maxVariations = 104; // 4 iterations through alphabet

let github = null;

const exclusions = new Set([
  '.DS_Store',
  '.git'
]);

/**
 * creates the .testconfig file and stores
 * the selected template value inside so
 * the template can be identified later.
 *
 * @param {string} template - the name of
 * the template
 */
const writeTestConfigFile = template => {
  try {
    const templateObj = { template };

    fs.writeFileSync(path.resolve(process.cwd(), '.testconfig'), JSON.stringify(templateObj, null, 2));
  } catch (err) {
    throw new FatalError(`init:writeTestConfigFile error\n\n${err.message}`);
  }
};

/**
 * gets the template to be used in each
 * variation. will also save this template
 * name in .testrc so if new variation is
 * added later, the same template will be
 * used for that as well.
 *
 * @param {Object} ctx - the context
 *
 * @returns {Promise<Object>} - resolves with
 * the updated context once the template has
 * been identified and saved in .testrc file.
 */
const getVariationTemplate = async (ctx) => {
  if (fs.existsSync(path.resolve(process.cwd(), 'templates'))) {
    const templateOptions = [];
    let templates = null;
    let message = null;

    try {
      templates = fs.readdirSync(path.join(process.cwd(), 'templates'));
    } catch (err) {
      throw new FatalError(`init:getTemplate error\n\n${err.message}`);
    }

    if (templates !== null) {
      if ('template' in ctx.arguments.arguments) {
        // template entered in command
        const template = templates.filter(t => t.toLowerCase() === ctx.arguments.arguments.template.toLowerCase());
        if (template.length > 0) {
          // user entered a template in command and it is valid
          ctx.template = template[0];
          writeTestConfigFile(ctx.template);
          return ctx;
        } else {
          if (templates.length === 1) {
            // user entered an invalid template in command and there is only 1 template to choose from
            // so will default to that option
            Logger.warn(`\n[!] invalid template entered: ${ctx.arguments.arguments.template}\n\nthis client appears to only have 1 template (${templates[0]}), so I have taken the liberty of selecting this template and will continue execution.\n\nPress [return|enter] to continue...`);

            try {
              await prompts({
                type: 'text',
                name: 'continueConfirm',
                message: ''
              });

              ctx.template = templates[0];
              writeTestConfigFile(ctx.template);
              return ctx;
            } catch (err) {
              throw new FatalError(`init:getVariationTemplate error\n\n${err.message}`);
            }
          } else {
            // user entered an invalid template and there are multiple templates for this client
            message = `invalid template entered: ${ctx.arguments.arguments.template}\n\nwhat template would you like to use for this test?`;

            templates.forEach(t => {
              templateOptions.push({
                title: t,
                value: t
              });
            });
          }
        }
      } else if (templates.length === 1) {
        // user did not enter a template and there is only 1 to choose from
        ctx.template = templates[0];
        writeTestConfigFile(ctx.template);
        return ctx;
      } else {
        // user did not enter a template and there are multiple to choose from
        message = '\nwhat template would you like to use for this test?';

        templates.forEach(t => {
          templateOptions.push({
            title: t,
            value: t
          });
        });
      }

      if (templateOptions.length > 0 && message !== null) {
        // user needs to be prompted to select a template from list of multiple
        Logger.gen(message);

        try {
          const results = await prompts({
            type: 'select',
            name: 'selectedTemplate',
            message: '',
            choices: templateOptions
          });

          if ('selectedTemplate' in results) {
            ctx.template = results.selectedTemplate;
            writeTestConfigFile(ctx.template);
            return ctx;
          } else {
            Logger.warn('\n[!] init cancelled\n\nplease ask an admin to delete the repo that was created.\n');
            process.exit(0);
          }
        } catch (err) {
          throw new FatalError(`init:getVariationTemplate error\n\n${err.message}`);
        }
      }
    }
  } else {
    throw new FatalError(`init:getVariationTemplate error\n\n${path.resolve(process.cwd(), 'templates')} not found`);
  }
};

/**
 * generates test name in format: [testName]_[clientName]_[date]
 *
 * @param {Object} ctx - the context
 * @return {string} - the full name of the test
 */
const getTestName = ctx => {
  return `${ctx.testData.name}_${ctx.testData.client.name}_${getFormattedDate()}`;
};

/**
 * show user prompts requesting test data that was not entered with
 * the command
 *
 * @param {Array<Object>} questions - array of all prompts that need
 * to be shown to user
 * @return {Promise<Object|Error>} - resolves with answers to prompts
 */
const showPrompts = async (questions) => {
  const results = {};

  for (let i = 0; i < questions.length; i++) {
    Logger.gen(`\n${questions[i].message}`);
    questions[i].message = '';

    try {
      const answer = await prompts(questions[i]);
      const keys = Object.keys(answer);
      results[keys[0]] = answer[keys[0]];
    } catch (err) {
      throw new FatalError(`init:showPrompts error\n\n${err.message}`);
    }
  }

  return results;
};

/**
 * creates new repo in org github account and assigns to
 * specified team, then adds the ReadOnly team to the repo
 * as well for non-devs to be able to view the repo issues,
 * then clones repo to cwd and traverses into the newly
 * cloned directory
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with updated context.
 * update addes property 'repo' to context. rejects with new FatalError
 * if fails
 */
const createAndCloneRepo = ctx => {
  const repoOptions = {
    name: getTestName(ctx),
    team_id: ctx.testData.client.id,
    team_slug: ctx.testData.client.slug
  };

  return github.createRepo(repoOptions)
    .then(async repo => {
      try {
        await github.addRepoToTeam({
          repoName: repo.name,
          teamSlug: NonClientTeams.AllDevs.slug,
          permission: 'push'
        });

        await github.addRepoToTeam({
          repoName: repo.name,
          teamSlug: NonClientTeams.Analysts.slug,
          permission: 'push'
        });

        await github.addRepoToTeam({
          repoName: repo.name,
          teamSlug: NonClientTeams.ReadOnly.slug
        });
      } catch (err) {
        Logger.error(`init:createAndCloneRepo error\n\nerror adding non-client teams\n${err.message}`);
      }

      return repo;
    })
    .then(repo => new Promise((resolve, reject) => {
      ctx.repo = repo;

      _exec(`git clone ${ctx.repo.clone_url}`, { maxBuffer }, err => {
        if (err) {
          reject(new FatalError(`init:createAndCloneRepo error\n\nFailed to clone repo to local\n${err.message}`));
        }

        process.chdir(ctx.repo.name);

        resolve(ctx);
      });
    }))
    .catch(err => {
      throw new FatalError(`init:createAndCloneRepo error - failed to create new repo\n${err.message}`);
    });
};

/**
 * reads directory and copies files from said directory
 * to new location
 *
 * WILL ONLY COPY FILES, WILL NOT COPY DIRECTORIES
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
 * uses the github library to create all labels needed for test.
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object>} - resolves with the updated context.
 * update adds array of labels created to context.
 */
const createLabels = ctx => {
  return github.createTestLabels({ name: ctx.repo.name })
    .then(results => {
      ctx.labels = results;
      return ctx;
    });
};

/**
 * uses the github library to create a new project for this test.
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object>} - resolves with the updated context.
 * update adds project data to context.
 */
const createProject = ctx => {
  return github.createProject({
    repo: ctx.repo.name,
    name: 'tasks',
    cols: [
      'queue',
      'waiting on something',
      'in progress',
      'in qa',
      'with client',
      'complete'
    ]
  })
    .then(project => {
      ctx.repo.project = project;
      return ctx;
    });
};

const getBBTemplateFiles = () => {
  return new Promise((resolve, reject) => {
    const bbtemplatesUrl = 'https://github.com/BrooksBellInc/bbtemplates.git';

    _exec(`git clone ${bbtemplatesUrl}`, { maxBuffer }, err => {
      if (err) {
        reject(new FatalError(`init:getBBTemplateFiles error\n\nFailed to clone bbtemplates repo\n${err.message}`));
      } else {
        copyFiles('bbtemplates', process.cwd());

        _exec(`rm -rf bbtemplates`, { maxBuffer }, err => {
          if (err) {
            reject(new Error(`init:getBBTemplateFiles error\n\nFailed to remove temp bbtemplates directory\n${err.message}\n\nyou should manually delete this`));
          } else {
            resolve();
          }
        });
      }
    });
  });
};

const getClientTemplateFiles = ctx => {
  return new Promise((resolve, reject) => {
    const tagName = 'client_templates' in ctx && ctx.client_templates.testName ? ctx.client_templates.testName : '';
    const clientTemplates = `http://github.com/${org}/${ctx.testData.client.name}_templates.git${tagName}`;

    _exec(`git clone ${clientTemplates}`, { maxBuffer }, err => {
      if (err) {
        reject(new FatalError(`init:getClientTemplateFiles error\n\nFailed to clone repo: ${ctx.testData.client.name}_templates\n${err.message}`));
      }

      const src = path.resolve(process.cwd(), `${ctx.testData.client.name}_templates`);

      copyFiles(src, process.cwd());

      _exec(`rm -rf ${ctx.testData.client.name}_templates`, { maxBuffer }, err => {
        if (err) {
          reject(new Error(`init:getClientTemplateFiles error\n\nFailed to remove temp ${src} directory\n${err.message}\n\nyou should manually delete this`));
        } else {
          resolve();
        }
      });
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
  return getClientTemplateFiles(ctx)
    .then(getBBTemplateFiles)
    .then(() => {
      // rename config file and replace placeholders inside
      const origConfig = path.resolve(process.cwd(), 'BB.client.test.config.js');
      const newConfig = path.resolve(process.cwd(), `BB.${ctx.testData.client.name}.test.config.js`);

      try {
        fs.renameSync(origConfig, newConfig);
      } catch (err) {
        throw new Error(`init:getTemplateFiles error\n\nFailed to rename BB.client.test.config.js\n${err.message}`);
      }

      // replace template variables inside config
      try {
        let configContents = fs.readFileSync(newConfig, 'utf8');
        configContents = parseTemplateVariables(configContents, ctx);

        fs.writeFileSync(newConfig, configContents);
      } catch (err) {
        throw new Error(`init:getTemplateFiles error\n\nFailed to update testName within BB.${ctx.testData.client.name}.test.config.js\n${err.message}`);
      }

      // replace template variables inside webpack files
      try {
        const webpackConfigPath = path.resolve(process.cwd(), 'webpack.config.js');
        const webpackConfig = parseTemplateVariables(fs.readFileSync(webpackConfigPath, 'utf8'), ctx);

        fs.writeFileSync(webpackConfigPath, webpackConfig);
      } catch (err) {
        throw new Error(`init:getTemplateFiles error\n\nFailed to update webpack.config.js with client name\n${err.message}`);
      }

      try {
        const webpackDevPath = path.resolve(process.cwd(), 'webpack.dev.js');
        const webpackDev = parseTemplateVariables(fs.readFileSync(webpackDevPath, 'utf8'), ctx);

        fs.writeFileSync(webpackDevPath, webpackDev);
      } catch (err) {
        throw new Error(`init:getTemplateFiles error\n\nFailed to update webpack.dev.js with client name\n${err.message}`);
      }

      // add .gitignore if doesnt exist
      try {
        fs.statSync(path.resolve(process.cwd(), '.gitignore'));
      } catch (err) {
        if (err.code === 'ENOENT') {
          /**
           * [!] IMPORTANT [!]
           *
           * DO NOT CHANGE THIS FORMATTING
           */
          const ignoreList = `node_modules
dev
build`;

          fs.writeFileSync(path.resolve(process.cwd(), '.gitignore'), ignoreList);

          return ctx;
        } else {
          throw err;
        }
      }
    });
};

/**
 * updates the package.json file with test specific
 * date and the latest releases of internal modules
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the
 * context. rejects with new error if fails
 */
const updatePackageJson = async (ctx) => {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  let packageJson = null;
  let bbmodulesLatestRelease = null;
  let clientmodulesLatestRelease = null;
  let bbInsertCssPluginLatestRelease = null;
  let bbWrapperPluginLatestRelease = null;

  try {
    packageJson = parseTemplateVariables(fs.readFileSync(packageJsonPath, 'utf8'), ctx);
    packageJson = JSON.parse(packageJson);
  } catch (err) {
    throw new FatalError(`init:updatePackageJson error\n\nFailed to read package.json\n${err.message}`);
  }

  packageJson.repository = {
    type: 'git',
    url: `git+${ctx.repo.clone_url}`
  };

  try {
    bbmodulesLatestRelease = await github.getLatestRelease({ repoName: 'bbmodules' });
    clientmodulesLatestRelease = await github.getLatestRelease({ repoName: `${ctx.testData.client.name}_modules` });
    bbInsertCssPluginLatestRelease = await github.getLatestRelease({ repoName: 'bb-insert-css-plugin' });
    bbWrapperPluginLatestRelease = await github.getLatestRelease({ repoName: 'bb-wrapper-plugin' });
  } catch (err) {
    throw new FatalError(`init:updatePackageJson error\n\nFailed to get latest releases of internal modules\n${err.message}`);
  }

  const modulesTagName = 'client_modules' in ctx && ctx.client_modules.tagName
    ? ctx.client_modules.tagName
    : clientmodulesLatestRelease.tag_name;

  packageJson.devDependencies.bbmodules = `${org}/bbmodules#${bbmodulesLatestRelease.tag_name}`;
  packageJson.devDependencies[`${ctx.testData.client.name}_modules`] = `${org}/${ctx.testData.client.name}_modules#${modulesTagName}`;
  packageJson.devDependencies['bb-insert-css-plugin'] = `${org}/bb-insert-css-plugin#${bbInsertCssPluginLatestRelease.tag_name}`;
  packageJson.devDependencies['bb-wrapper-plugin'] = `${org}/bb-wrapper-plugin#${bbWrapperPluginLatestRelease.tag_name}`;

  try {
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    return ctx;
  } catch (err) {
    throw new FatalError(`init:updatePackageJson error\n\nFailed to overwrite contents of package.json with test data\n${err.message}`);
  }
};

/**
 * updates test README.md by replacing
 * template variables with their associated
 * content.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * the context once the new content has been
 * added to the test's readme file successfully
 */
const updateReadme = ctx => {
  const readmePath = path.resolve(process.cwd(), 'README.md');
  if (fs.existsSync(readmePath)) {
    try {
      const content = parseTemplateVariables(fs.readFileSync(readmePath, 'utf8'), ctx);

      fs.writeFileSync(readmePath, content);
      return ctx;
    } catch (err) {
      Logger.error(`init:updatePackageJson error\n\nfailed to update README.md\n${err.message}`);
      return ctx;
    }
  } else {
    Logger.error('\ninit:updatePackageJson error\n\nfailed to update README.md - file not found\n');
    return ctx;
  }
};

/**
 * constructs all variations
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the
 * context once all variations have been built. reject
 * with error if fails
 */
const buildAllVariations = ctx => {
  try {
    Variation.build('control', ctx);

    if (ctx.testData.variations < maxVariations) {
      for (let i = 0; i < ctx.testData.variations; i++) {
        let charCode = (i + 65);
        let iterations = 1;
        let suffix = '';

        while (charCode > 90) {
          iterations += 1;
          charCode -= 26;
        }

        for (let i = 0; i < iterations; i++) {
          suffix = `${suffix}${String.fromCharCode(charCode)}`;
        }

        Variation.build(`variant${suffix}`, ctx);
      }

      return ctx;
    } else {
      throw new FatalError(`init:buildAllVariations error\n\nonly ${maxVariations} variations allowed`);
    }
  } catch (err) {
    throw new FatalError(`init:buildAllVariations error\n\n${err.message}`);
  }
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
    Logger.gen('installing dependencies...');

    _exec('npm install', { maxBuffer }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`init:installDependencies error\n\nFailed to install dependencies\n${err.message}`));
      }

      if (stderr) {
        // Logger.gen(stdout);
        // write stdout to log file in case review is needed
      } else if (stderr) {
        Logger.error(stderr);
      }

      resolve(ctx);
    });
  });
};

/**
 * commit newly created test
 *
 * returns {Promise<Object>} - resolves with the
 * context once the changes have been successfully
 * committed.
 */
const commitChanges = ctx => {
  return new Promise((resolve, reject) => {
    Logger.gen('generating initial commit...');

    _exec('git add -A', { maxBuffer }, err1 => {
      if (err1) reject(err1);

      _exec('git commit -m "auto-generated commit - initial files and folders created"', { maxBuffer }, err2 => {
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
 * checks the test the user is requesting
 * to create a repo for against all the
 * teams they are assigned to. if no match
 * the user is notified that their account
 * is not assigned to that team.
 *
 * this will not prevent unauthorized usage...
 * that responsibility falls on the github
 * api. this check is just to allow for
 * more understandable error messaging.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves
 * with the context if the team the user
 * is requesting to create a repo for is
 * found in their list of assigned teams.
 * otherwise will show error advising
 * user that they are not assigned to that
 * team.
 */
const checkIfIsAuthorizedTeam = ctx => {
  let client = null;
  let authorizedClientFound = false;

  if ('testData' in ctx && 'client' in ctx.testData && 'name' in ctx.testData.client) {
    client = ctx.testData.client.name;
  } else {
    client = ctx.arguments.arguments.client;
  }

  if (client) {
    ctx.teams.forEach(team => {
      if (team.name.toLowerCase() === client.toLowerCase()) authorizedClientFound = true;
    });
  }

  if (client === null) {
    throw new FatalError('init:checkIfIsAuthorizedTeam error\n\nno client could be found');
  } else if (!authorizedClientFound) {
    throw new FatalError(`init:checkIfIsAuthorizedTeam error\n\nyour account is not assigned to the ${client} team`);
  } else {
    return ctx;
  }
};

/**
 * checks that the requested test name
 * does not already exist in the BB org.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves
 * with the context if the requested
 * test name does not already exist.
 */
const checkIfTestAlreadyExists = ctx => {
  const newPattern = /_\d{4}-\d{2}-\d{2}/;
  const oldPattern = /\d{4}-\d{2}-\d{2}_/;

  return github.getRepos()
    .then(repos => {
      ctx.repos = repos.filter(repo => {
        if (newPattern.test(repo.name) || oldPattern.test(repo.name)) return repo;
      });

      return ctx;
    })
    .then(ctx => {
      const testName = getTestName(ctx);
      const results = ctx.repos.filter(repo => repo.name.toLowerCase() === testName.toLowerCase());

      if (results.length > 0) {
        throw new FatalError(`init:checkIfTestAlreadyExists error\n\n${testName} already exists`);
      } else {
        return ctx;
      }
    })
    .catch(err => {
      throw new FatalError(`init:checkIfTestAlreadyExists error\n\nFailed to retrieve repos\n${err.message}`);
    });
};

/**
 * verifies if a release tag or branch name exists
 * on a repo.
 *
 * @param {'templates'|'modules'} repoType- string
 * indicating what repo to verify. if 'templates',
 * will check '[client]_templates' for the branch name
 * or release tag. if 'modules', will check
 * '[client]_modules' for the branch name or release
 * tag.
 *
 * @param {Object} ctx - the context
 *
 * @returns {Object} - resolves with the updated
 * context. update adds a new 'client_templates'
 * property to the context (if repoType === 'templates')
 * or new 'client_modules' property (if repoType ===
 * 'modules')
 */
const verifyCustomBranchOrRelease = async (repoType, ctx) => {
  let repo = null;

  if (repoType === 'templates') {
    repo = `${ctx.testData.client.name}_templates`;
  } else if (repoType === 'modules') {
    repo = `${ctx.testData.client.name}_modules`;
  } else {
    throw new Error('init:verifyCustomBranchOrRelease error - invalid repo found');
  }

  if (repo) {
    const branches = await github.getAllBranches({ repo });
    const releases = await github.getAllReleases({ repo });

    let verified = branches.filter(branch => {
      const arg = ctx.arguments.arguments[`client${repoType}`].split('#').join('');
      return branch.name === arg;
    });

    if (verified.length === 0) {
      verified = releases.filter(release => {
        let arg = ctx.arguments.arguments[`client${repoType}`].split('#').join('');
        arg = arg.split('v').join('');

        return release.name === `v${arg}`;
      });
    }

    if (verified.length) {
      ctx[`client_${repoType}`] = {
        branches,
        releases,
        tagName: verified[0].name
      };

      return ctx;
    } else {
      throw new FatalError(`invalid branch or tag name provided for ${repo}`);
    }
  }
};

/**
 * instantiate new command
 */
const initCommand = new Command({
  pattern: '<init>',
  docs: `
    initializes a new test including creating:
     - github repo
      - all initial directories and files (inluding client specific templates)
      - installs bbmodules and [client]modules as dependencies`
});

/**
 * register all arguments and flags
 */
initCommand
  .argument('name|n', {
    description: 'the name of the test (name will be prefixed with date and spaces will be replaced with _). if not found, you will be prompted to enter this information.'
  })
  .argument('client-templates', {
    description: 'custom branch or release tag to use for the [client]_templates that are used to create the test files. (example: --client-templates \'1.1.1\') if invalid branch or release tag, will throw an error.'
  })
  .argument('client-modules', {
    description: 'custom branch or relase tag to use for the [client]_modules that are added to the test. (example: --client-modules \'1.1.1\') if invalid branch or release tag, will throw an error.'
  })
  .argument('client|c', {
    description: 'the name of the client (must match name of client team). if not entered, or team is not found, you will be prompted with a list of available teams to select from.'
  })
  .argument('template|t', {
    description: 'the name of the template to be used to build each variation. if not entered, or if an invalid template name is entered, you will be prompted to select a template from a list of available templates UNLESS only 1 set of templates is found in the client\'s templates directory, then will default to this option with no prompt.'
  })
  .argument('variations|v', {
    type: 'int',
    description: 'the number of variations to be added to the test (more can be added later using the addchallenger command). Enter 0 if no variations are needed. If not entered, you will be prompted to enter this information.'
  });

/**
 * overwrite the before method
 *
 * verify that all information has been recieved
 * or prompt user to enter needed information
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object|Error>} - resolves with updated context.
 * update adds 'testData' property defined as follows:
 *      testData: {
 *        name<string>,
 *        client<Object> {
 *          name<string>,
 *          id<number>
 *        },
 *        variations<number>
 *      }
 *
 */
initCommand.before = ctx => {
  Logger.gen('initializing...');

  return Team.getTeams(ctx)
    .then(ctx => {
      if (ctx.teams.length === 0) {
        throw new FatalError('init error\n\nyour account does not have access to create repos for any client teams');
      } else {
        return ctx;
      }
    })
    .then(ctx => {
      const {
        name = null,
        client = null,
        variations = null
      } = ctx.arguments.arguments;
      const questions = [];

      ctx.testData = {};

      // assert name has been entered
      if (name && isValidName(name.split(' ').join('_'))) {
        ctx.testData.name = name.split(' ').join('_');
      } else {
        let message = null;

        if (!name) {
          message = 'what is the name of the test?';
        } else {
          message = 'invalid test name. no special characters allowed except: - and _\nwhat is the name of the test?';
        }

        questions.push({
          type: 'text',
          name: 'testName',
          message,
          validate: answer => {
            if (answer.trim() === '') {
              return '[-] the test name is required';
            } else if (!isValidName(answer)) {
              return '[-] invalid test name. no special characters allowed except: - and _';
            } else {
              return true;
            }
          },
          format: answer => {
            return answer.split(' ').join('_');
          }
        });
      }

      // assert client has been entered AND is valid client
      if (client) {
        let teamId = null;

        ctx.teams.forEach(team => {
          if (team.name.toLowerCase() === client.toLowerCase()) {
            teamId = team.id;
          }
        });

        if (teamId === null) {
          questions.push({
            type: 'select',
            name: 'testClient',
            message: 'INVALID CLIENT ENTERED\n\nNOTE: this usally happens if the client name was misspelled or if your account is not assigned to the requested team\n\nplease choose a team from the list below.',
            choices: Team.getPromptOptions(ctx.teams)
          });
        } else {
          ctx.testData.client = {
            name: client.toLowerCase(),
            slug: client.toLowerCase(),
            id: teamId
          };
        }
      } else {
        questions.push({
          type: 'select',
          name: 'testClient',
          message: 'what client is this for?',
          choices: Team.getPromptOptions(ctx.teams)
        });
      }

      // assert number of variation has been entered
      if (typeof variations === 'number') {
        if (variations < maxVariations) {
          ctx.testData.variations = variations;
        } else {
          questions.push({
            type: 'number',
            name: 'testVariations',
            message: `invalid number of variations: ${variations}\n\ntest cannot have more than ${maxVariations} variations.\nhow many variations will be in this test?`,
            validate: answer => {
              if (answer !== '') {
                const parsedAnswer = parseInt(answer);

                if (isNaN(parsedAnswer)) {
                  return '[-] variation count must be a number';
                } else if (parsedAnswer > maxVariations) {
                  return `[-] variation count cannot be greater then ${maxVariations}`;
                } else {
                  return true;
                }
              } else {
                return true;
              }
            },
            format: answer => {
              if (answer === '') {
                return 0;
              } else {
                return answer;
              }
            }
          });
        }
      } else {
        questions.push({
          type: 'number',
          name: 'testVariations',
          message: 'how many variations will be in this test?',
          validate: answer => {
            if (answer !== '') {
              const parsedAnswer = parseInt(answer);

              if (isNaN(parsedAnswer)) {
                return '[-] variation count must be a number';
              } else if (parsedAnswer > maxVariations) {
                return `[-] variation count cannot be greater then ${maxVariations}`;
              } else {
                return true;
              }
            } else {
              return true;
            }
          },
          format: answer => {
            if (answer === '') {
              return 0;
            } else {
              return answer;
            }
          }
        });
      }

      // prompt user for missing information
      if (questions.length > 0) {
        return showPrompts(questions)
          .then(answers => {
            const {
              testName = null,
              testClient = null,
              testVariations = null
            } = answers;

            if (testName !== null) {
              ctx.testData.name = testName;
            }

            if (testClient !== null) {
              ctx.testData.client = {
                id: testClient.id,
                name: testClient.name,
                slug: testClient.name
              };
            }

            if (testVariations !== null) {
              ctx.testData.variations = testVariations;
            }

            return ctx;
          })
          .then(checkIfIsAuthorizedTeam)
          .then(checkIfTestAlreadyExists)
          .then(ctx => {
            Logger.gen('initialization complete - starting test creation...');
            return ctx;
          })
          .then(createAndCloneRepo)
          .then(ctx => {
            Logger.success('[+] repo created and cloned to local');
            return ctx;
          })
          .then(getTemplateFiles)
          .then(ctx => {
            Logger.success('[+] test files retrieved');
            return ctx;
          })
          .then(getVariationTemplate)
          .then(ctx => {
            Logger.success('[+] variation template retrieved');
            return ctx;
          })
          .catch(err => {
            Logger.error(`\n${err.message}\n`);

            if (err.isFatal) {
              process.exit(1);
            }
          });
      } else {
        ctx = checkIfIsAuthorizedTeam(ctx);

        return checkIfTestAlreadyExists(ctx)
          .then(ctx => {
            Logger.gen('initialization complete - starting test creation...');
            return ctx;
          })
          .then(ctx => {
            if (ctx.arguments.arguments.clienttemplates) {
              return verifyCustomBranchOrRelease('templates', ctx);
            } else {
              return ctx;
            }
          })
          .then(ctx => {
            if (ctx.arguments.arguments.clientmodules) {
              return verifyCustomBranchOrRelease('modules', ctx);
            } else {
              return ctx;
            }
          })
          .then(createAndCloneRepo)
          .then(ctx => {
            Logger.success('[+] repo created and cloned to local');
            return ctx;
          })
          .then(getTemplateFiles)
          .then(ctx => {
            Logger.success('[+] test files retrieved');
            return ctx;
          })
          .then(getVariationTemplate)
          .then(ctx => {
            Logger.success('[+] variation template retrieved');
            return ctx;
          })
          .catch(err => {
            Logger.error(`\n${err.message}\n`);

            if (err.isFatal) {
              process.exit(1);
            }
          });
      }
    })
    .catch(err => {
      Logger.error(`\ninit error\n\n${err.message}\n`);

      if (err.isFatal) {
        process.exit(1);
      }
    });
};

/**
 * main command body
 *
 * @param {Object} - the context
 *
 * @returns {Promise<Object>} - resolves with the
 * context once the main body of the command has
 * completed execution successfully
 */
initCommand.main = ctx => {
  if (!!ctx.testData.name && !!ctx.testData.client && typeof ctx.testData.variations === 'number') {
    return createLabels(ctx)
      .then(ctx => {
        Logger.success('[+] repo labels created');
        return ctx;
      })
      .then(createProject)
      .then(ctx => {
        Logger.success('[+] project created');
        return ctx;
      })
      .then(updatePackageJson)
      .then(ctx => {
        Logger.success('[+] package.json updated with test details');
        return ctx;
      })
      .then(updateReadme)
      .then(ctx => {
        Logger.success('[+] README.md updated');
        return ctx;
      })
      .then(buildAllVariations)
      .then(ctx => {
        Logger.success('[+] variations built');
        return ctx;
      })
      .then(installDependencies)
      .then(ctx => {
        Logger.success('[+] dependencies installed');
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
 *  starting point for command. is the method called by external
 * sources for this command
 *
 * @param {Object} ctx - the context
 *
 * @returns {Promise<Object>} - resolves with the context once
 * the command has completed execution successfully.
 */
export const exec = ctx => {
  github = new Github(ctx.config.github);

  return initCommand.execute(ctx)
    .then(ctx => {
      Logger.complete('[+] init complete');

      return ctx;
    });
};

/**
 * method called by external sources to retrieve help/documentation
 * about this command
 */
export const help = () => initCommand.help();

/**
 * PLACING AT BOTTOM OF FILE BECAUSE ` (tick) IN EXPRESSION
 * WAS CAUSING ISSUES WITH TEXT HIGHLIGHTING.
 *
 * tests if name user entered has an special characters.
 * this version allows - and _
 *
 * @return {boolean} - returns true if no special
 * characters are found in the name, otherwise,
 * returns false
 */
const isValidName = name => {
  return (!/[~`!#$%^&*+=[\]\\';,/{}|\\":<>?]/g.test(name));
};
