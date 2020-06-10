import path from 'path';
import fs from 'fs';
import os from 'os';
import prompts from 'prompts';
import { exec as _exec } from 'child_process';

import Command from './Command';
import Github from '../../lib/github-api';
import FatalError from '../../lib/error/fatal-error';
import { Logger } from '../../lib/logger';
import { getTeams } from '../utils/team';
import NonClientTeams from '../../config/non-client-teams';

let github = null;
const maxBuffer = 1200 * 1024;

/**
 * adds team to the bbmodules repo with write
 * permissions.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * the context after the team has successfully
 * been added to the bbmodules repo.
 */
const addTeamToBBModules = ctx => {
  return github.addRepoToTeam({
    repoName: 'bbmodules',
    teamSlug: ctx.team.slug,
    permission: 'push'
  })
    .then(() => {
      Logger.success('[+] team added to bbmodules');

      return ctx;
    })
    .catch(err => {
      throw new FatalError(`createteam:addTeamToBBModules error\n\n${err.message}`);
    });
};

/**
 * confirms that the team name entered is
 * not already in use. if it is, will throw
 * an error informing user of such.
 *
 * @param {Object} ctx - the context
 *
 * @returns {Boolean} - returns true if team
 * name is not already in use, otherwise
 * returns false.
 */
const confirmTeamNameNotInUse = (name, teams) => {
  return teams.filter(team => (team.name.toLowerCase() === name.toLowerCase())).length === 0;
};

/**
 * copies starter docs files and folders
 * from starter_kit directory into the
 * [client]_docs repo
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * context once all files and folders have
 * been copied.
 */
const copyStarterDocs = ctx => {
  return new Promise((resolve, reject) => {
    _exec(`cp -r ${path.resolve(ctx.starterKitRoot, 'client_docs', '*')} ${path.resolve(process.cwd(), `${ctx.team.slug}_docs`)}`, { maxBuffer }, err => {
      if (err) {
        reject(new FatalError(`createteam:copyStarterDocs\n\n${err.message}`));
      } else {
        Logger.success(`[+] starter files copied to ${ctx.team.slug}_docs`);
        resolve();
      }
    });
  });
};

/**
 * handles copying all starter files and
 * folders from starter kit to corresponding
 * new team repo
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * the context once all files and folders
 * have been copied to their corresponding
 * new team repos.
 */
const copyStarterFilesToNewRepos = ctx => {
  return Promise.all([
    copyStarterDocs(ctx),
    copyStarterModules(ctx),
    copyStarterTemplates(ctx)
  ])
    .then(() => ctx);
};

/**
 * copies starter module files and folders
 * from starter_kit directory into the
 * [client]_modules repo
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * context once all files and folders have
 * been copied.
 */
const copyStarterModules = ctx => {
  return new Promise((resolve, reject) => {
    _exec(`cp -r ${path.resolve(ctx.starterKitRoot, 'client_modules', '*')} ${path.resolve(process.cwd(), `${ctx.team.slug}_modules`)}`, { maxBuffer }, err => {
      if (err) {
        reject(new FatalError(`createteam:copyStarterModules\n\n${err.message}`));
      } else {
        Logger.success(`[+] starter files copied to ${ctx.team.slug}_modules`);
        resolve();
      }
    });
  });
};

/**
 * copies starter template files and folders
 * from starter_kit directory into the
 * [client]_templates repo
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * context once all files and folders have
 * been copied.
 */
const copyStarterTemplates = ctx => {
  return new Promise((resolve, reject) => {
    _exec(`cp -r ${path.resolve(ctx.starterKitRoot, 'client_templates', '*')} ${path.resolve(process.cwd(), `${ctx.team.slug}_templates`)}`, { maxBuffer }, err => {
      if (err) {
        reject(new FatalError(`createteam:copyStarterTemplates\n\n${err.message}`));
      } else {
        Logger.success(`[+] starter files copied to ${ctx.team.slug}_templates`);
        resolve();
      }
    });
  });
};

/**
 * creates the [client]_docs repo for the
 * team and clones it down to local machine
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * the updated context once the repo is created
 * successfully. update includes the adding of
 * property 'docs' which is the repo object
 * returned from the github api
 */
const createDocs = ctx => {
  return github.createRepo({
    name: `${ctx.team.slug}_docs`,
    team_id: ctx.team.id,
    team_slug: ctx.team.slug,
    auto_init: false
  })
    .then(repo => {
      Logger.success(`[+] ${ctx.team.slug}_docs created`);
      ctx.docs = repo;
      return ctx;
    })
    .then(async (ctx) => {
      // add non-client teams

      await github.addRepoToTeam({
        repoName: ctx.docs.name,
        teamSlug: NonClientTeams.AllDevs.slug,
        permission: 'push'
      });

      await github.addRepoToTeam({
        repoName: ctx.docs.name,
        teamSlug: NonClientTeams.Analysts.slug,
        permission: 'push'
      });

      await github.addRepoToTeam({
        repoName: ctx.docs.name,
        teamSlug: NonClientTeams.ReadOnly.slug
      });

      return ctx;
    })
    .then(ctx => new Promise((resolve, reject) => {
      _exec(`git clone ${ctx.docs.clone_url}`, { maxBuffer }, err => {
        if (err) {
          reject(new FatalError(`createteam:createDocs error\n\n${err.message}`));
        } else {
          Logger.success(`[+] ${ctx.team.slug}_docs cloned to local machine`);
          resolve(ctx);
        }
      });
    }))
    .catch(err => {
      throw new FatalError(`createteam:createDocs error\n\n${err.message}`);
    });
};

/**
 * creates the [client]_modules repo for the
 * team and clones it down to local machine
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * the updated context once the repo is created
 * successfully. update includes the adding of
 * property 'modules' which is the repo object
 * returned from the github api
 */
const createModules = ctx => {
  return github.createRepo({
    name: `${ctx.team.slug}_modules`,
    team_id: ctx.team.id,
    team_slug: ctx.team.slug
  })
    .then(repo => {
      Logger.success(`[+] ${ctx.team.slug}_modules created`);
      ctx.modules = repo;
      return ctx;
    })
    .then(async (ctx) => {
      await github.addRepoToTeam({
        repoName: ctx.modules.name,
        teamSlug: NonClientTeams.AllDevs.slug,
        permission: 'push'
      });

      return ctx;
    })
    .then(ctx => new Promise((resolve, reject) => {
      _exec(`git clone ${ctx.modules.clone_url}`, { maxBuffer }, err => {
        if (err) {
          reject(new FatalError(`createteam:createModules error\n\n${err.message}`));
        } else {
          Logger.success(`[+] ${ctx.team.slug}_modules cloned to local machine`);
          resolve(ctx);
        }
      });
    }))
    .catch(err => {
      throw new FatalError(`createteam:createModules error\n\n${err.message}`);
    });
};

/**
 * creates the team within the org
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resoles with
 * the updated context once the team has been
 * created. update includes the addition of
 * property 'team' to the context which is
 * the team object returned from the github
 * api.
 */
const createTeam = ctx => {
  return github.createTeam({ name: ctx.teamName })
    .then(team => {
      Logger.success('[+] client team created');
      ctx.team = team;
      return ctx;
    })
    .catch(err => {
      throw new FatalError(`createteam:createTeam error\n\n${err.message}`);
    });
};

/**
 * creates the [client]_templates repo for the
 * team and clones it down to local machine
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * the updated context once the repo is created
 * successfully. update includes the adding of
 * property 'templates' which is the repo object
 * returned from the github api
 */
const createTemplates = ctx => {
  return github.createRepo({
    name: `${ctx.team.slug}_templates`,
    team_id: ctx.team.id,
    team_slug: ctx.team.slug,
    auto_init: false
  })
    .then(repo => {
      Logger.success(`[+] ${ctx.team.slug}_templates created`);
      ctx.templates = repo;
      return ctx;
    })
    .then(async (ctx) => {
      await github.addRepoToTeam({
        repoName: ctx.templates.name,
        teamSlug: NonClientTeams.AllDevs.slug,
        permission: 'push'
      });

      return ctx;
    })
    .then(ctx => new Promise((resolve, reject) => {
      _exec(`git clone ${ctx.templates.clone_url}`, { maxBuffer }, err => {
        if (err) {
          reject(new FatalError(`createteam:createTemplates error\n\n${err.message}`));
        } else {
          Logger.success(`[+] ${ctx.team.slug}_templates cloned to local machine`);
          resolve(ctx);
        }
      });
    }))
    .catch(err => {
      throw new FatalError(`createteam:createTemplates error\n\n${err.message}`);
    });
};

const executeCommand = cmd => {
  return new Promise((resolve, reject) => {
    _exec(cmd, { maxBuffer }, err => {
      if (err) {
        reject(new Error(`error executing command: '${cmd}'\n${err.message}`));
      } else {
        resolve();
      }
    });
  });
};

/**
 * retrieves the new team name from the user.
 *
 * if the user has not entered a new team name using
 * the name arguments, then will prompt user to enter
 * new name.
 *
 * ensures that team name does not container special
 * characters or spaces, and is not already in use
 * before resolving.
 *
 * @param {Object} ctx - the context
 *
 * @returns {Promise<Object>} - resolves with the
 * updated context once it has been confirmed that
 * the new team name does not contain special
 * characters or spaces, and is not already in use.
 */
const getTeamName = async (ctx) => {
  let message = null;

  const { name = null } = ctx.arguments.arguments;

  if (name !== null) {
    if (isValidName(name)) {
      if (confirmTeamNameNotInUse(name, ctx.teams)) {
        ctx.teamName = name;
      } else {
        message = `team with name ${name} already exists. please enter a different name`;
      }
    } else {
      message = `invalid team name: ${name} - no special characters or spaces allowed.\nwhat is the name of the name of the new team?`;
    }
  } else {
    message = 'what is the name of new team?';
  }

  if (message !== null) {
    Logger.gen(`\n${message}`);

    try {
      const results = await prompts({
        type: 'text',
        name: 'teamName',
        message: '',
        validate: answer => {
          if (answer.trim() === '') {
            return '[-] team name is required';
          } else {
            if (isValidName(answer)) {
              if (confirmTeamNameNotInUse(answer, ctx.teams)) {
                return true;
              } else {
                return `[-] team with name ${name} already exists. please enter a different name`;
              }
            } else {
              return '[-] no special characters or spaces allowed in team name. please enter a different name';
            }
          }
        }
      });

      if ('teamName' in results) {
        ctx.teamName = results.teamName;
        return ctx;
      } else {
        Logger.warn('\n[!] team creation cancelled\n');
      }
    } catch (err) {
      throw new FatalError(`createteam:getTeam error\n\n${err.message}`);
    }
  } else {
    return ctx;
  }
};

/**
 * updates the README.md contents by replacing
 * all occurrences of '{{client_docs}}' with
 * the name of the new team's docs repo, then
 * commits changes.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with the
 * context once content replacement and commit
 * complete successfully.
 */
const finalizeDocs = ctx => {
  const docsRoot = path.resolve(process.cwd(), `${ctx.team.slug}_docs`);

  if (fs.existsSync(path.resolve(docsRoot, 'README.md'))) {
    try {
      const variable = '{{client_docs}}';
      const replacement = `${ctx.team.slug}_docs`;
      let contents = fs.readFileSync(path.resolve(docsRoot, 'README.md'), 'utf8');

      while (contents.includes(variable)) {
        contents = contents.replace(variable, replacement);
      }

      fs.writeFileSync(path.resolve(docsRoot, 'README.md'), contents);
    } catch (err) {
      throw new FatalError(`createteam:finalizeDocs error\n\n${err.message}`);
    }

    process.chdir(docsRoot);

    return executeCommand('git add -A')
      .then(() => executeCommand('git commit -m "auto-generated commit - initial files and folders created"'))
      .then(() => executeCommand('git push'))
      .then(() => {
        Logger.success(`[+] ${ctx.team.slug}_docs initial commit complete`);
        process.chdir(path.resolve(docsRoot, '..'));
        return ctx;
      })
      .then(ctx => updateBranchProtection(`${ctx.team.slug}_docs`, ctx))
      .then(ctx => {
        Logger.success(`[+] ${ctx.team.slug}_docs master branch protections updated`);
        Logger.success(`[+] ${ctx.team.slug}_docs finalized`);
        return ctx;
      })
      .catch(err => {
        throw new FatalError(`createteam:finalizeDocs error\n\n${err.message}`);
      });
  } else {
    throw new FatalError(`createteam:finalizeDocs error\n\n${ctx.team.slug}_docs/README.md not found`);
  }
};

/**
 * executes `npm init -y` on the new client
 * team's modules repo, commits changes, then
 * creates new v1.0.0 release on repo.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with the
 * context once command, commit, and release
 * creation complete successfully.
 */
const finalizeModules = ctx => {
  const modulesRoot = path.resolve(process.cwd(), `${ctx.team.slug}_modules`);

  process.chdir(modulesRoot);

  return executeCommand('npm init -y')
    .then(() => executeCommand('git add -A'))
    .then(() => executeCommand('npm i -D jsdoc'))
    .then(() => {
      Logger.success('[+] jsdoc installed');
    })
    .then(() => {
      try {
        fs.writeFileSync(path.join(process.cwd(), '.gitignore'), 'node_modules');
        Logger.success(`[+] ${ctx.team.slug}_modules/.gitignore created`);
        return true;
      } catch (err) {
        Logger.error(`[-] error creating .gitignore - ${err.message}`);
        return true;
      }
    })
    .then(() => {
      // const packageJson = fs.readFileSync('package.json');
      try {
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        packageJson.scripts.docs = 'jsdoc -r . -d docs -c jsdoc.conf *.js README.md';

        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        Logger.success(`[+] docs script added to ${ctx.team.slug}_modules/package.json`);
        return true;
      } catch (err) {
        Logger.error(`[-] error added docs script to package.json - ${err.message}`);
        return true;
      }
    })
    .then(() => executeCommand('git commit -m "auto-generated commit - initial files and folders created"'))
    .then(() => executeCommand('git push'))
    .then(() => {
      Logger.success(`[+] ${ctx.team.slug}_modules initial commit complete`);
      return null;
    })
    .then(() => github.createRelease({
      repoName: `${ctx.team.slug}_modules`,
      version: 'v1.0.0',
      description: 'auto-generated - initial files and folders created'
    }))
    .then(release => {
      Logger.success(`[+] initial release for ${ctx.team.slug}_modules created`);
      ctx.modules.new_release = release.data;
      process.chdir(path.resolve(modulesRoot, '..'));
      return ctx;
    })
    .then(ctx => updateBranchProtection(`${ctx.team.slug}_modules`, ctx))
    .then(ctx => {
      Logger.success(`[+] ${ctx.team.slug}_modules master branch protections updated`);
      Logger.success(`[+] ${ctx.team.slug}_modules finalized`);
      return ctx;
    })
    .catch(err => {
      throw new FatalError(`createteam:finalizeModules error\n\n${err.message}`);
    });
};

/**
 * commits changes to the new client team's
 * templates repo.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with the
 * context once commit is completed successfully.
 */
const finalizeTemplates = ctx => {
  const templatesRoot = path.resolve(process.cwd(), `${ctx.team.slug}_templates`);

  process.chdir(templatesRoot);

  return executeCommand('git add -A')
    .then(() => executeCommand('git commit -m "auto-generated commit - initial files and filders created"'))
    .then(() => executeCommand('git push'))
    .then(() => {
      Logger.success(`[+] ${ctx.team.slug}_templates initial commit complete`);
      process.chdir(path.resolve(templatesRoot, '..'));
      return ctx;
    })
    .then(ctx => updateBranchProtection(`${ctx.team.slug}_templates`, ctx))
    .then(ctx => {
      Logger.success(`[+] ${ctx.team.slug}_templates master branch protections updated`);
      Logger.success(`[+] ${ctx.team.slug}_templates finalized`);
      return ctx;
    })
    .catch(err => {
      throw new FatalError(`createteam:finalizeTemplates error\n\n${err.message}`);
    });
};

const deleteOrigStarterKit = async (starterKitRoot) => {
  await executeCommand(`rm -rf ${starterKitRoot}`);
};

/**
 * clones down the new_client_starter_kit
 * repo to local machine
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves
 * with the context once the repos is
 * successfully cloned to local machine
 */
const getStarterKit = ctx => {
  return new Promise((resolve, reject) => {
    const starterKitRoot = path.resolve(process.cwd(), 'new_client_starter_kit');
    const url = 'https://github.com/BrooksBellInc/new_client_starter_kit.git';
    let errorFound = false;

    // make sure starter kit directory is not already in cwd
    if (fs.existsSync(starterKitRoot)) {
      try {
        deleteOrigStarterKit(starterKitRoot);
      } catch (err) {
        errorFound = true;
        reject(new FatalError(`createteam:getStarterKit error\n\nthere is already a directory on your machine called 'new_client_starter_kit' and this command was unable to remove it\n${err.message}`));
      }
    }

    /**
     * errors were intermitently being thrown in
     * the next function call that tries to use
     * the contents of the new_client_starter_kit,
     * so adding in poll for this directory to
     * exist before resolving, to ensure those
     * errors do not continue to get thrown
     */
    const waitForStarterKit = () => {
      if (
        fs.existsSync(starterKitRoot) &&
        fs.existsSync(path.resolve(starterKitRoot, 'client_docs')) &&
        fs.existsSync(path.resolve(starterKitRoot, 'client_modules')) &&
        fs.existsSync(path.resolve(starterKitRoot, 'client_templates')) &&
        fs.readdirSync(path.resolve(starterKitRoot, 'client_docs')).length > 0 &&
        fs.readdirSync(path.resolve(starterKitRoot, 'client_modules')).length > 0 &&
        fs.readdirSync(path.resolve(starterKitRoot, 'client_templates')).length > 0
      ) {
        Logger.success('[+] starter kit repo cloned to local machine');
        ctx.starterKitRoot = starterKitRoot;
        resolve(ctx);
      } else {
        setTimeout(() => {
          waitForStarterKit();
        }, 50);
      }
    };

    if (!errorFound) {
      _exec(`git clone ${url}`, { maxBuffer }, err => {
        if (err) {
          reject(new FatalError(`createteam:getStarterKit error\n\n${err.message}`));
        } else {
          waitForStarterKit();
        }
      });
    }
  });
};

/**
 * handles updating the protections
 * of the master branch for all the new
 * client team's repos
 *
 * @param (string) repo - the name of the
 * repo to be updated
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves
 * with the context once the specified
 * branch's master branch's protections
 * have been successfully updated.
 */
const updateBranchProtection = (repo, ctx) => {
  return github.updateBranchProtection({
    repoName: repo,
    branch: 'master'
  })
    .then(() => ctx);
};

/**
 * instantiates new Command
 */
const createteamCommand = new Command({
  pattern: '<createteam>',
  docs: `
    handles everything needed to create a new client team in the org github account.
  
    NOTE: admin permissions to the org github account are required to use this command.`
});

/**
 * register all parameters, arguments, and flags
 */
createteamCommand
  .argument('name|n', {
    description: 'the name of the team to be created. if not provided, you will be prompted to enter the name of the new team to be created.\n\n\tREQUIREMENT: must not contain special characters (including spaces)\n\n\tWARNING: when using this argument, you must adhere to all command line rules, else you may risk unintended consiquences.'
  })
  .flag('preserve|p', {
    description: 'by default, once all repos have been created, and everything has been committed to github, command will clean up local machine by deleting all repos that were cloned down during this process.\n\n\tbut you can use this flag to prevent those repos from being removed.'
  });

/**
 * overwrite the before method of Command
 *
 * retrieves all currently existing teams and
 * verifies that new team name does not already exist
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves if test
 * name is not already in use.
 */
createteamCommand.before = ctx => {
  if (os.platform() === 'win32') {
    throw new FatalError('invalid platform found\n\ncreateteam command not yet supported on Windows');
  } else {
    Logger.gen('initializing...');

    return github.isAdmin({ username: ctx.config.github.username })
      .then(isAdmin => {
        if (isAdmin) {
          return ctx;
        } else {
          throw new FatalError('unauthorized user\n\nyou must have admin permissions to use this command');
        }
      })
      .then(ctx => getTeams(ctx))
      .then(getTeamName);
  }
};

/**
 * overwrite the main method of Command
 *
 * @param {Object} ctx - the context
 *
 * @returns {Promise<Object>} - resolves with the
 * context once the main body of the command has
 * completed execution
 */
createteamCommand.main = ctx => {
  return createTeam(ctx)
    .then(addTeamToBBModules)
    .then(createModules)
    .then(createTemplates)
    .then(createDocs)
    .then(getStarterKit)
    .then(copyStarterFilesToNewRepos)
    .then(finalizeModules)
    .then(finalizeTemplates)
    .then(finalizeDocs);
};

/**
 * overwrite the after method of Command
 *
 * @param {Object} ctx - the context
 */
createteamCommand.after = ctx => {
  return new Promise((resolve, reject) => {
    if (!ctx.arguments.flags.preserve) {
      executeCommand(`rm -rf ${ctx.team.slug}_modules`)
        .then(() => executeCommand(`rm -rf ${ctx.team.slug}_templates`))
        .then(() => executeCommand(`rm -rf ${ctx.team.slug}_docs`))
        .then(() => executeCommand('rm -rf new_client_starter_kit'))
        .then(() => {
          Logger.success('[+] new repos cleaned from local machine');
          resolve(ctx);
        })
        .catch(err => reject(new Error(`createteamCommand:after error\n\n${err.message}`)));
    } else {
      Logger.success('[+] new repos preserved on local machine');
      resolve(ctx);
    }
  });
};

/**
 * starting point for command. is the method called by external
 * sources for this command
 *
 * @param {Object} ctx - the context
 *
 * @returns {Promise<Object>} - resolves with the context
 * once the command has finished executing successfully
 */
export const exec = ctx => {
  github = new Github(ctx.config.github);

  return createteamCommand.execute(ctx)
    .then(ctx => {
      Logger.complete('\n[+] client team creation complete\n');

      return ctx;
    });
};

/**
 * method called by external sources to retrieve help/documentation
 * about this command
 */
export const help = () => createteamCommand.help();

/**
 * tests if name user entered has an special characters
 *
 * placed at end of find as the ` (tick) in regular
 * expression was causing issues with text highlighting.
 *
 * @return {boolean} - returns true if no special
 * characters are found in the name, otherwise,
 * returns false
 */
const isValidName = name => {
  return (!/[~`!#$%^&*+=\-[\]\\';,/{}|\\":<>?\s]/g.test(name));
};
