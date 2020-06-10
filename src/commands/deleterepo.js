import fs from 'fs';
import path from 'path';
import { exec as _exec } from 'child_process';
import prompts from 'prompts';

import Command from './Command';
import Github from '../../lib/github-api';
import FatalError from '../../lib/error/fatal-error';
import * as Team from '../utils/team';
import { Logger } from '../../lib/logger';

let github = null;

/**
 * asks user if they are sure they want
 * to delete the selected repo. also warns
 * user that this action cannot be undone.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with
 * the context if the user confirms they
 * want to delete the selectd repo. if user
 * decides they do not want to delete the
 * selected repo, will cancel process.
 */
const confirmDeletion = async (ctx) => {
  Logger.gen(`\nare you sure you want to delete ${ctx.repo.name}? Y/n`);
  Logger.warn('[!] this cannot be undone. once deleted, this repo will be gone forever.\n');

  try {
    const results = await prompts({
      type: 'text',
      name: 'confirmDeletion',
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

    if ('confirmDeletion' in results) {
      if (results.confirmDeletion === 'y') {
        return ctx;
      } else {
        Logger.warn('\n[!] deletion cancelled\n');
        process.exit(0);
      }
    } else {
      Logger.warn('\n[!] deletion cancelled\n');
      process.exit(0);
    }
  } catch (err) {
    throw new FatalError(`deleterepo:confirmDeletion error\n\n${err.message}`);
  }
};

/**
 * calls all functioned needed to
 * delete repo
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} resolves
 * with the context once repo has been
 * successfully delete.
 */
const deleteRepo = ctx => {
  Logger.gen(`deleting ${ctx.repo.name}...`);

  return deleteRemoteRepo(ctx)
    .then(deleteLocalRepo);
};

/**
 * deletes the selected repo from
 * github
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves
 * with the context once the rope has
 * been successfully deleted.
 */
const deleteLocalRepo = ctx => {
  return new Promise((resolve, reject) => {
    if (ctx.arguments.flags.local && fs.existsSync(path.resolve('.', ctx.repo.name))) {
      _exec(`rm -rf ${ctx.repo.name}`, err => {
        if (err) {
          reject(new FatalError(`deleterepo:deleteLocalRepo error\n\n${err.message}`));
        } else {
          resolve(ctx);
        }
      });
    } else {
      resolve(ctx);
    }
  });
};

/**
 * deletes the selected repo from
 * github
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves
 * with the context once the rope has
 * been successfully deleted.
 */
const deleteRemoteRepo = ctx => {
  return github.deleteRepo({ repo: ctx.repo.name })
    .then(() => ctx)
    .catch(err => {
      throw new FatalError(`deleterepo:deleteRemoteRepo error\n\n${err.message}`);
    });
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
        throw new FatalError(`deleterepo:getRepos error\n\nFailed to retrieve repos\n${err.message}`);
      });
  } else {
    process.exit(0);
  }
};

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
    throw new FatalError('deleterepo:getTeam error\n\nIt appears you do not have access to any teams.');
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
        slug: team.toLowerCase()
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
        throw new FatalError(`deleterepo:getTeam error\n\n${err.message}`);
      }
    }
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
  ctx.results = ctx.repos.filter(repo => repo.name.toLowerCase().indexOf(ctx.arguments.parameters.query.toLowerCase()) > -1);

  return ctx;
};

/**
 * shows the results of the users's search,
 * and provides the user with a list to select
 * the repo they are searching for.
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with
 * updated context. update adds 'repo' property, which
 * is the select repo object. rejects with error if
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

    Logger.gen('\nselect the repo you want to delete');

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
        Logger.warn('\n[!] deletion cancelled\n');
        process.exit(0);
      }
    } catch (err) {
      Logger.error(`deleterepo:showResults error\n\n${err.message}`);
    }
  }
};

/**
 * instantiates new command
 */
const deleterepoCommand = new Command({
  pattern: '<deleterepo> <query?>',
  docs: `
    used to delete a repo from the org github account

    searches for test repo by substring. will return all repo names with titles that container <query>. if <query> is not included in search, will return all repos. after searching, will provide prompt option to select the desired repo to be deleted. when selected, will delete that repo from github.
  
    command defaults to only allowing 10 repositories to be listed at once. if more are found, you will be asked to refine your search. if you wish to increase this limit, you may do so by changing the maxReposToShow property in your .igorrc file
  
  [!] IMPORTANT - Deleting a repository requires admin access.`
});

/**
 * register all parameters, arguments, and flags
 */
deleterepoCommand
  .parameter('query', {
    description: 'if provided, is the substring to search for'
  })
  .argument('team|t', {
    description: 'if provided, search will be limited to only the specified team repos. if is invalid team name, you will be prompted with a list of available teams'
  })
  .flag('all|a', {
    description: 'if provided, will ignore config.maxReposToShow, and will show all repos instead, regardless of the number of repos listed'
  })
  .flag('local|l', {
    description: 'if provided, will also delete the selected repo directory from the local machine if directory is found in the current working directory'
  });

/**
 * overwrite the before method of Comand
 *
 * retrieves the team id (if a team is entered with command)
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with updated
 * context. update adds 'teams' and 'team' properties. 'teams'
 * includes all of the teams the user has access to delete
 * repos for. 'team' is the team the selected team to filter
 * results by (of applicable. will be set to null if no team
 * entered)
 */
deleterepoCommand.before = ctx => {
  Logger.gen('initializing...');

  return github.isAdmin({ username: ctx.config.github.username })
    .then(isAdmin => {
      if (isAdmin) {
        if (ctx.arguments.parameters.query === undefined) {
          ctx.arguments.parameters.query = '';
          Logger.warn('[!] no query term included with search.');
        } else {
          ctx.arguments.parameters.query = ctx.arguments.parameters.query.toLowerCase();
        }

        return ctx;
      } else {
        throw new FatalError('unauthorized user - only admins can delete repos');
      }
    })
    .then(Team.getTeams)
    .then(getTeam);
};

/**
 * overwrite the main method of Command
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with the context.
 */
deleterepoCommand.main = ctx => {
  return getRepos(ctx)
    .then(searchRepos)
    .then(showResults)
    .then(confirmDeletion)
    .then(deleteRepo);
};

/**
 * starting point for command. is the method called
 * by external sources for this command
 *
 * @param {Object} ctx - the context
 *
 * @param {Promise<Object>} - resolves with the
 * context once the command has completed execution
 */
export const exec = ctx => {
  github = new Github(ctx.config.github);

  return deleterepoCommand.execute(ctx)
    .then(ctx => {
      Logger.complete(`\n[+] ${ctx.repo.name} deleted\n`);

      return ctx;
    });
};

/**
 * method called by external sources to retrieve
 * help/documentation about this command
 */
export const help = () => deleterepoCommand.help();
