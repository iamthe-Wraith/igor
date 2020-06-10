import os from 'os';
import fs from 'fs';
import path from 'path';
import prompts from 'prompts';
import { exec as _exec } from 'child_process';

import Command from './Command';
import Github from '../../lib/github-api';
import FatalError from '../../lib/error/fatal-error';
import * as Team from '../utils/team';
import { Logger } from '../../lib/logger';

let github = null;

/**
 * checks the name of the current working
 * directory and the names of the files/
 * directories.
 *
 * if the current working directory is the
 * repo to be renamed, and the user is on
 * a windows platform, they process will be
 * cancelled, and the user notified that
 * they cannot be inside the repo they are
 * trying to rename as windows does not
 * allows this.
 *
 * otherwise, if the name of the selected
 * repo is found, process will continue.
 * but if the name of the repo is not found,
 * process will stop, notifying user that
 * if they continue, only the remote repo
 * will be renamed. user must confirm they
 * wish to continue or not.
 *
 * @param {Object} ctx - the context
 *
 * @returns {Promise<Object>} - resolves with
 * the context if the current working directory
 * is the selected repo, or the selected repo
 * is found within the current working directory.
 */
const checkIfInRepo = async (ctx) => {
  const files = fs.readdirSync(process.cwd());
  const platform = os.platform();
  let currentDir = process.cwd().split(path.sep);
  currentDir = currentDir[currentDir.length - 1];

  let team = null;

  // test if user is inside the repo to be renamed.
  if (ctx.repo.name.toLowerCase() === currentDir.toLowerCase()) {
    if (platform === 'win32') {
      Logger.warn(`[!] you are current inside the directory you are attempting to rename.\nthis is problematic on Windows as the platform will lock the resource.\n\nrecommend traversing out of this directory and trying again.`);
    } else {
      team = ctx.teams.filter(team => currentDir.toLowerCase().indexOf(`_${team.name.toLowerCase()}_`) > -1);

      if (team.length > 0) {
        const parsed = currentDir.split(team[0].name.toLowerCase());

        ctx.testData = {
          location: 1,
          orig: currentDir,
          name: parsed[0].split('_').join(' ').trim(),
          team: team[0].name.toLowerCase(),
          date: parsed[1].split('_').join(' ').trim()
        };

        return ctx;
      } else {
        return new FatalError(`[-] Unauthorized User\n\nyou do not appear to have access to this repo's client team.`);
      }
    }
  // test if repo to be renamed is in the current directory
  } else if (files.filter(file => file.toLowerCase() === ctx.repo.name.toLowerCase()).length) {
    team = ctx.teams.filter(team => ctx.repo.name.toLowerCase().indexOf(`_${team.name.toLowerCase()}_`) > -1);

    if (team.length) {
      const parsed = ctx.repo.name.split(team[0].name.toLowerCase());

      ctx.testData = {
        location: 2,
        orig: ctx.repo.name,
        name: parsed[0].split('_').join(' ').trim(),
        team: team[0].name.toLowerCase(),
        date: parsed[1].split('_').join(' ').trim()
      };

      return ctx;
    } else {
      throw new FatalError(`[-] Unauthorized User\n\nyou do not appear to have access to the client team of repo: ${ctx.repo.name}.`);
    }
  // local repo not found, prompt user if they want to continue
  } else {
    team = ctx.teams.filter(team => ctx.repo.name.toLowerCase().indexOf(`_${team.name.toLowerCase()}_`) > -1);

    if (team.length) {
      Logger.gen(`\n[!] WARNING\n${ctx.repo.name} is not the current working directory, and was not found inside the current directory. if you continue, only the remote repo will be renamed. this means, any local copy you have will be out of sync with the remote repo.\n\nare you sure you want to continue?\n`);

      try {
        const results = await prompts({
          type: 'text',
          name: 'confirm',
          message: '',
          validate: answer => {
            if (answer.trim() === '' || answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'n') {
              return true;
            } else {
              return '[-] invalid response. please enter either \'y\' or \'n\'';
            }
          },
          format: answer => {
            let formattedAnswer = null;

            if (answer.trim() === '') {
              formattedAnswer = 'y';
            } else {
              formattedAnswer = answer.trim().toLowerCase();
            }

            return formattedAnswer;
          }
        });

        if ('confirm' in results) {
          if (results.confirm === 'y') {
            const parsed = ctx.repo.name.split(team[0].name.toLowerCase());

            ctx.testData = {
              location: 0,
              orig: ctx.repo.name,
              name: parsed[0].split('_').join(' ').trim(),
              team: team[0].name.toLowerCase(),
              date: parsed[1].split('_').join(' ').trim()
            };

            return ctx;
          } else {
            Logger.warn(`\n[!] rename cancelled\n`);
            process.exit(0);
          }
        } else {
          Logger.warn(`\n[!] rename cancelled\n`);
          process.exit(0);
        }
      } catch (err) {
        throw new FatalError(`renamerepo:checkIfInRepo error\n\n${err.message}`);
      }
    } else {
      throw new FatalError(`[-] Unauthorized User\n\nyou do not appear to have access to the client team of repo: ${ctx.repo.name}.`);
    }
  }
};

/**
 * confirms that the user is satisfied with
 * the new name they entered.
 *
 * @param {string} newName - the new name
 * of repo that user entered into text
 * prompt
 *
 * @return {Promise<boolean>} - resolves
 * with confirmation of user's satisfaction
 * of the new name enetered. if 'y', user
 * has confirmed new name is good, and is
 * okay to proceed with renaming. if user
 * enters 'n', user is prompted again to
 * enter a new name. cycle will continue
 * until user cancels process or enters a
 * name they are satisfied with.
 */
const confirmNewName = async (newName) => {
  Logger.gen(`are you satisfied with ${newName}? Y/n`);

  try {
    const results = await prompts({
      type: 'text',
      name: 'confirmed',
      message: '',
      validate: answer => {
        if (answer.trim() === '' || answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'n') {
          return true;
        } else {
          return '[-] invalid response. please enter either \'y\' or \'n\'';
        }
      },
      format: answer => {
        let formattedAnswer = null;

        if (answer.trim() === '') {
          formattedAnswer = 'y';
        } else {
          formattedAnswer = answer.trim().toLowerCase();
        }

        return formattedAnswer;
      }
    });

    if ('confirmed' in results) {
      return results.confirmed === 'y';
    } else {
      Logger.warn(`[!] rename cancelled`);
      process.exit(0);
    }
  } catch (err) {
    throw new FatalError(`renamerepo:confirmNewName error\n\n${err.message}`);
  }
};

/**
 * prompts user to enter the new name of repo.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * the updated context once the user has confirmed
 * the new test name. updated includes new
 * property 'newName' which is the test name to
 * change the repo name to.
 */
const getNewName = async (ctx) => {
  Logger.title(`\nwhat would you like to change the following repo name to?`);
  Logger.gen(`\n\t${ctx.testData.name.split(' ').join('_')}\n`);

  try {
    const results = await prompts({
      type: 'text',
      name: 'newTestName',
      message: '',
      validate: answer => {
        if (answer.trim() === '') {
          return '[-] new test name is required';
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

    if ('newTestName' in results) {
      ctx.newName = `${results.newTestName}_${ctx.testData.team}_${ctx.testData.date}`;

      const confirmed = await confirmNewName(ctx.newName);

      if (confirmed) {
        return ctx;
      } else {
        return getNewName(ctx);
      }
    } else {
      Logger.warn(`\n[!] rename cancelled\n`);
      process.exit(0);
    }
  } catch (err) {
    throw new FatalError(`renamerepo:getNewName error\n\n${err.message}`);
  }
};

/**
 * if team id is provided, retrieves all repos for that team,
 * if not, retrieves all repos for org.
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with updated
 * context. update adds 'repos' property, which is an array of
 * repo objects returned by the github api. rejects with new
 * FatalError if fails
 */
const getRepos = ctx => {
  if ('team' in ctx) {
    const teamSlug = (ctx.team !== null && 'slug' in ctx.team) ? ctx.team.slug : null;

    const newPattern = /_\d{4}-\d{2}-\d{2}/;
    const oldPattern = /\d{4}-\d{2}-\d{2}_/;

    return github.getRepos({ teamSlug })
      .then(repos => {
        ctx.repos = repos.filter(repo => {
          if (newPattern.test(repo.name) || oldPattern.test(repo.name)) return repo;
        });
        return ctx;
      })
      .catch(err => {
        throw new FatalError(`renamerepo:getRepos error\n\nFailed to retrieve repos\n${err.message}`);
      });
  } else {
    process.exit(0);
  }
};

/**
 * gets the team the user wants to filter
 * search by.
 *
 * @param {Object} ctx - the context
 *
 * @returns {Promise<Object>} - resolves with
 * the updated context. update includes new
 * property 'team' which is the team the user
 * wishes to filter their search by.
 */
const getTeam = async (ctx) => {
  const { team = null } = ctx.arguments.arguments;
  let teamId = null;
  let teamSlug = null;

  if (ctx.teams.length === 0) {
    throw new FatalError('renamerepo:getTeam error\n\nIt appears you do not have access to any teams.');
  } else if (team === null) {
    ctx.team = null;
    return ctx;
  } else {
    ctx.teams.forEach(t => {
      if (t.name.toLowerCase() === team.toLowerCase()) {
        teamId = t.id;
        teamSlug = t.slug;
      }
    });

    if (teamId !== null && teamSlug !== null) {
      ctx.team = {
        id: teamId,
        name: team.toLowerCase(),
        slug: teamSlug
      };

      return ctx;
    } else {
      const teamOptions = Team.getPromptOptions(ctx.teams);

      Logger.gen('\ninvalid team found. what team would you like to filter by?');

      try {
        const res = await prompts({
          type: 'select',
          name: 'team',
          message: '',
          choices: teamOptions
        });

        if ('team' in res) {
          ctx.team = {
            id: res.team.id,
            name: res.team.name,
            slug: res.team.name
          };

          return ctx;
        } else {
          Logger.warn('\n[!] search cancelled\n');
          process.exit(0);
        }
      } catch (err) {
        throw new FatalError(`renamerepo:getTeam error\n\n${err.message}`);
      }
    }
  }
};

/**
 * renames the local repo to the new repo name
 * and will also update the repo's remote
 * location to the new location.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * the updated context once the local repo
 * has been successfully renamed. update includes
 * new property 'updateRepo' which is the
 * repo object returned from the github api
 * after the repo has been updated.
 */
const renameLocalRepo = ctx => {
  return new Promise((resolve, reject) => {
    if (ctx.testData.location === 0) {
      resolve(ctx);
    } else {
      let origPath = null;
      let newPath = null;

      if (ctx.testData.location === 1) {
        origPath = process.cwd();
        newPath = path.resolve(process.cwd(), '..', ctx.newName);
      } else if (ctx.testData.location === 2) {
        origPath = path.resolve(process.cwd(), ctx.testData.orig);
        newPath = path.resolve(process.cwd(), ctx.newName);
      }

      if (origPath === null || newPath === null) {
        reject(new FatalError(`renamerepo:renameLocalRepo error\n\nsomething has gone wrong identifying the original path and/or the new path`));
      } else {
        // rename the directory
        fs.rename(origPath, newPath, err => {
          if (err) {
            reject(new Error(`renamerepo:renameLocalRepo error\n\n${err.message}`));
          } else {
            // updated the repo's remote location
            let origLocation = null;

            if (ctx.testData.location === 2) {
              origLocation = process.cwd();
              process.chdir(newPath);
            }

            _exec(`git remote set-url origin ${ctx.updatedRepo.html_url}`, err => {
              if (err) {
                reject(new Error(`renamerepo:renameLocalRepo error\n\nfailed to change repo's remote location\n${err.message}`));
              } else {
                if (origLocation !== null) {
                  process.chdir(origLocation);
                }

                let errorMessage = null;

                // update repository url in package.json
                try {
                  const packageContents = JSON.parse(fs.readFileSync(path.resolve(newPath, 'package.json')));
                  packageContents.repository.url = `git+${ctx.updatedRepo.html_url}.git`;

                  fs.writeFileSync(path.resolve(newPath, 'package.json'), JSON.stringify(packageContents, null, 2));
                } catch (err) {
                  errorMessage = `renamerepo:renameLocalRepo error\n\nfailed to updated repo url in package.json\n${err.message}`;
                }

                if (errorMessage === null) {
                  // update repository name in README.md
                  try {
                    let readmeContents = fs.readFileSync(path.resolve(newPath, 'README.md'), 'utf8');

                    while (readmeContents.indexOf(ctx.repo.name) > -1) {
                      readmeContents = readmeContents.replace(ctx.repo.name, ctx.newName);
                    }

                    fs.writeFileSync(path.resolve(newPath, 'README.md'), readmeContents);
                  } catch (err) {
                    errorMessage = `renamerepo:renameLocalRepo error\n\nfailed to update repo name in README.md\n${err.message}`;
                  }
                }

                if (errorMessage === null) {
                  resolve(ctx);
                } else {
                  reject(new Error(errorMessage));
                }
              }
            });
          }
        });
      }
    }
  });
};

/**
 * calls the github libraries 'renameRepo'
 * method to rename the remote github repo.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * the updated context once the remote repo
 * has been successfully renamed. update
 * includes the addition of property 'updatedRepo'
 * which is the updated repo object returned
 * from the github api.
 */
const renameRemoteRepo = ctx => {
  return github.renameRepo({
    originalName: ctx.testData.orig,
    newName: ctx.newName
  })
    .then(updatedRepo => {
      ctx.updatedRepo = updatedRepo;
      return ctx;
    })
    .catch(err => {
      if ('response' in err && 'data' in err.response && 'message' in err.response.data) {
        const { message } = err.response.data;

        if (message === 'not found') {
          throw new FatalError(`renamerepo:renameRemoteRepo error\n\nit appears you do not have authorization to rename this repo. only users with owner or admin permissions may rename a repo`);
        } else {
          throw new FatalError(`renamerepo:renameRemoteRepo error\n\n${message}`);
        }
      } else {
        throw new FatalError(`renamerepo:renameRemoteRepo error\n\n${err.message}`);
      }
    });
};

/**
 * calls all functions needed to
 * delete repo
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves
 * with the updated context once the
 * remote repo (and the local repo if
 * applicable) have been successfully
 * renamed.
 */
const renameRepo = ctx => {
  Logger.gen(`renaming ${ctx.testData.orig} to ${ctx.newName}...`);

  return renameRemoteRepo(ctx)
    .then(renameLocalRepo);
};

/**
 * searches the array of repos for a substring match
 * of query within the repo name.
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object>} - resolves with
 * the updated context. update adds the 'results' property,
 * which is an array of all repo objects whose name contained
 * the substring query.
 */
const searchRepos = ctx => {
  ctx.results = ctx.repos.filter(repo => repo.name.toLowerCase().indexOf(ctx.arguments.parameters.query.toLowerCase()) > -1);
  return ctx;
};

/**
 * shows the results of the users's search,
 * and provides the user with a list to select
 * the repo they are searching for.
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object>} - resolves with updated
 * context. update adds 'repo' property, which is
 * the selected repo object. rejects with error if
 * fails
 */
const showResults = async (ctx) => {
  if (ctx.results.length === 0) {
    throw new FatalError(`no repos found for query: ${ctx.arguments.parameters.query}`);
  } else if (!ctx.arguments.flags.all && ctx.results.length > ctx.config.maxReposToShow) {
    Logger.error(`\n${ctx.results.length} results found. please refine your search and try again.\n`);
    process.exit(0);
  } else if (ctx.results.length === 1) {
    ctx.repo = {
      url: ctx.results[0].clone_url,
      name: ctx.results[0].name
    };

    return ctx;
  } else {
    const repoOptions = [];

    ctx.results.forEach(repo => {
      repoOptions.push({
        title: repo.name,
        value: {
          url: repo.clone_url,
          name: repo.name
        }
      });
    });

    Logger.gen('\nselect the repo you want to rename');

    try {
      const results = await prompts({
        type: 'select',
        name: 'repo',
        message: '',
        choices: repoOptions
      });

      if ('repo' in results) {
        ctx.repo = results.repo;
        return ctx;
      } else {
        Logger.warn(`\n[!] rename cancelled\n`);
        process.exit(0);
      }
    } catch (err) {
      Logger.error(`renamerepo:showResults error\n\n${err.message}`);
    }
  }
};

/**
 * instantiates new command
 */
const renamerepoCommand = new Command({
  pattern: '<renamerepo> <query?>',
  docs: `
    used to rename a client test repo from the org github account

    before using this command, do one of the following:

      - traverse into the directory that houses the the repo you wish to rename
      - traverse into the repo you wish to rename (NOT SUPPORTED ON WINDOWS)

    if you do not provide a parameter when the command is entered, you will be prompted to enter the new name of the test. once confirmed, this command will rename the remote repo, rename the local directory (if found), update the local repo's remote location, and will update the repository url within the package.json file.

    [!] WARNING - Only members with owner privileges for an organization or admin privileges for a repository can rename a repository.

    [!] WARNING - the new name entered should not contain the client name or date...these will automatically be appended to the name to ensure the correct format is maintained.
  
    [!] WARNING - this command will only work on the new test naming structure where the date is at the end of the test name.`
});

/**
 * register all parameters, arguments, and flags
 */
renamerepoCommand
  .parameter('query', {
    description: 'is the substring to search for in the repo test name'
  })
  .argument('team|t', {
    description: 'if provided, search will be limited to only the specified team repos. if is invalid team name, you will be prompted with a list of available teams'
  })
  .flag('all|a', {
    description: 'if provided, will ignore config.maxReposToShow, and will show all repos instead, regardless of the number of repos listed'
  });

/**
 * overwrite the before method of Command
 *
 * retrieves all teams the user is asigned to
 * gets the team the user wants to filter by (if applicable)
 * retrieves all repos (filtered by team if applicable)
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with the context.
 */
renamerepoCommand.before = ctx => {
  if (ctx.arguments.parameters.query === undefined) {
    ctx.arguments.parameters.query = '';
    Logger.warn('[!] no query term included with search.\n');
  } else {
    ctx.arguments.parameters.query = ctx.arguments.parameters.query.toLowerCase();
  }

  Logger.gen('initializing...');

  return Team.getTeams(ctx)
    .then(getTeam)
    .then(getRepos);
};

/**
 * overwrite the main method of Command
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with the context.
 */
renamerepoCommand.main = ctx => {
  ctx = searchRepos(ctx);

  return showResults(ctx)
    .then(checkIfInRepo)
    .then(getNewName)
    .then(renameRepo);
};

/**
 * starting point for command. is the method called
 * by external sources for this command.
 *
 * @param {Object} - the context
 *
 * @returns {Promise<Object>} - resolves with the
 * context once the command has completed executing
 * successfully
 */
export const exec = ctx => {
  github = new Github(ctx.config.github);

  return renamerepoCommand.execute(ctx)
    .then(ctx => {
      Logger.complete(`\n[+] repo renamed\n`);

      return ctx;
    });
};

/**
 * method called by external sources to retrieve
 * help/documentation about this command
 */
export const help = () => renamerepoCommand.help();

/**
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
