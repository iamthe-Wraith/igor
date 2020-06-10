import path from 'path';
import fs from 'fs';
import prompts from 'prompts';
import { exec as _exec } from 'child_process';

import Command from './Command';
import { Logger } from '../../lib/logger';
import Github from '../../lib/github-api';
import FatalError from '../../lib/error/fatal-error';
import * as Team from '../utils/team';

const maxBuffer = 1200 * 1024;

let github = null;

/**
 * retrieves team data (if specified in command)
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the updated
 * context. if team is not provided in command, team property will be
 * added to context, but set to null. if team is provided, update adds
 * team property to context that is an object. object includes
 * properties: 'name' and 'id'. rejects with FatalError if fails
 */
const getTeam = async (ctx) => {
  const { team = null } = ctx.arguments.arguments;
  let teamId = null;
  let teamSlug = null;

  if (ctx.teams.length === 0) {
    throw new FatalError('searchrepos:getTeam error\n\nIt appears you do not have access to any teams.');
  } else if (team === null) {
    ctx.team = {};
    return ctx;
  } else {
    ctx.teams.forEach(t => {
      if (t.name.toLowerCase() === team.toLowerCase()) {
        teamId = t.id;
        teamSlug = t.slug;
      }
    });

    if (teamId !== null) {
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
        throw new FatalError(`searchrepos:getTeam error\n\n${err.message}`);
      }
    }
  }
};

/**
 * if team id is provided, retrieves all repos for that team,
 * if not, retrieves all repos for org.
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with updated
 * promise. update adds repos property, which is an array of
 * repo objects returned by the github api. rejects with new
 * FatalError if fails
 */
const getRepos = ctx => {
  if (ctx.team) {
    const teamSlug = ctx.team && 'slug' in ctx.team ? ctx.team.slug : null;
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
        throw new FatalError(`searchrepos:getRepos error\n\nFailed to retrieve repos\n${err.message}`);
      });
  } else {
    process.exit(0);
  }
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
  ctx.results = ctx.repos.filter(repo => repo.name.toLowerCase().includes(ctx.arguments.parameters.query));

  return ctx;
};

/**
 * clones the selected repo to the user's local machine
 * and if preventinstall flag is false, npm install
 * is run on the cloned repo.
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the context.
 * rejects with error if fails
 */
const cloneRepo = ctx => {
  return new Promise((resolve, reject) => {
    if (ctx.repo) {
      Logger.gen(`cloning ${ctx.repo.name} down...`);

      try {
        fs.statSync(path.resolve(process.cwd(), ctx.repo.name));

        reject(new FatalError(`searchrepos:cloneRepo error\n\nDirectory: ${ctx.repo.name} already exists here`));
      } catch (err) {
        _exec(`git clone ${ctx.repo.url}`, { maxBuffer }, err => {
          if (err) {
            reject(new Error(`searchrepos:cloneRepo error\n\nFailed to clone repo: ${ctx.repo.name}\n${err.message}`));
          }

          if (!ctx.arguments.flags.preventinstall) {
            Logger.gen('[+] clone complete');
            Logger.gen('installing dependencies...');

            try {
              process.chdir(path.resolve('.', ctx.repo.name));
            } catch (err) {
              reject(new Error(`searchrepos:cloneRepo error\n\nFailed to change cwd to test directory\n${err.message}`));
            }

            _exec('npm install', err => {
              if (err) {
                reject(new Error(`searchrepos:cloneRepo error\n\nFailed to intalll repo dependencies\n${err.message}`));
              }

              Logger.complete('[+] install complete');
              resolve(ctx);
            });
          } else {
            Logger.complete('[+] clone complete');
            resolve(ctx);
          }
        });
      }
    }
  });
};

/**
 * shows the results of the users's search,
 * and provides the user with a list to select
 * the repo they are searching for. once selected
 * repo will be cloned to local machine
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with
 * updated context. update adds 'repo' property, which
 * is the select repo object. rejects with error if
 * fails
 */
const showResults = async (ctx) => {
  if (ctx.results.length === 0) {
    Logger.gen(`no repos found for query: ${ctx.arguments.parameters.query}`);
    return ctx;
  } else if (!ctx.arguments.flags.all && ctx.results.length > ctx.config.maxReposToShow) {
    Logger.error(`${ctx.results.length} results found. please refine your search and try again.`);
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

    Logger.gen('\nselect the repo you are searching for');

    try {
      const results = await prompts({
        type: 'select',
        name: 'repo',
        message: '',
        choices: repoOptions
      });

      if ('repo' in results) {
        ctx.repo = results.repo;

        return await cloneRepo(ctx);
      } else {
        Logger.warn(`\n[!] search cancelled\n`);
        process.exit(1);
      }
    } catch (err) {
      Logger.error(`searchrepos:showResults error\n\n${err.message}`);
    }
  }
};

/**
 * instantiate new command
 */
const searchreposCommand = new Command({
  pattern: '<searchrepos> <query?>',
  docs: `
    searches for test repo by substring. will return all repo names with titles that contain <query>. if <query> is not included in search, will return all repos. after searching, will provide prompt option to select the repo desired. when selected, will clone that repo from github to local machine and install repos dependencies (unless install is prevented).
  
    command defaults to only allowing 10 repositories to be listed at once. if more are found, you will be asked to refine your search. if you wish to increase this limit, you may do so by change the maxReposToShow property in your .igorrc file.`
});

/**
 * register all parameters, arguments, and flags
 */
searchreposCommand
  .parameter('query', {
    description: 'if provided, the substring to search for'
  })
  .argument('team|t', {
    description: 'if provided, search will be limited to only the specified teams repos. if is invalid team name, you will be prompted with a list of available teams'
  })
  .flag('all|a', {
    description: 'if provided, will ignore config.maxReposToShow, and will show all repos instead, regardless of the number of repos listed'
  })
  .flag('preventinstall|p', {
    description: 'by default, when a single repo is found, or one is selected from the prompt list, that repos is cloned and then npm install is run on it. if this flag is found, npm install will not be run on the cloned repo'
  });

/***
 * overwrite the before method of Command
 *
 * retrieves the team id (if a team is entered with the command)
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with updates context.
 * update adds 'teams' and 'team' properties. teams includes all
 * of the teams the user is assigned to. team is the team user
 * entered into team argument (if applicable, is null if not entered.
 * rejects with error if fails.
 */
searchreposCommand.before = ctx => {
  Logger.gen('searching...');

  /**
   if query is not provided, set query as empty string.
  all repos will be returned instead of only ones matching query
  **/
  if (ctx.arguments.parameters.query === undefined) {
    ctx.arguments.parameters.query = '';
    Logger.warn('[!] - no query term included with search');
  } else {
    /**
     * otherwise make the query all lowercase to search will be case insensitive
     */
    ctx.arguments.parameters.query = ctx.arguments.parameters.query.toLowerCase();
  }

  return Team.getTeams(ctx)
    .then(getTeam);
};

/**
 * overwrite the main method of Command
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the context.
 * rejects with error if fails.
 */
searchreposCommand.main = ctx => {
  return getRepos(ctx)
    .then(searchRepos)
    .then(showResults)
    .then(ctx => ctx)
    .catch(err => {
      Logger.error(`\n${err.message}\n`);

      if (err.isFatal) {
        process.exit(1);
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
 * once the command has completed executing successfully
 */
export const exec = ctx => {
  github = new Github(ctx.config.github);

  return searchreposCommand.execute(ctx);
};

/**
 * method called by external sources to retrieve help/documentation
 * about this command
 */
export const help = () => {
  searchreposCommand.help();
};
