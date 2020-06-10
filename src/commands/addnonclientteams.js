import prompts from 'prompts';

import Command from './Command';
import Github from '../../lib/github-api';
import FatalError from '../../lib/error/fatal-error';
import NonClientTeams from '../../config/non-client-teams';
import * as Team from '../utils/team';
import { Logger } from '../../lib/logger';

let github = null;

const addTeams = async (ctx) => {
  if (ctx.repo) {
    Logger.gen(`adding teams to ${ctx.repo.name}...`);

    await github.addRepoToTeam({
      repoName: ctx.repo.name,
      teamSlug: NonClientTeams.AllDevs.slug,
      permission: 'push'
    });

    await github.addRepoToTeam({
      repoName: ctx.repo.name,
      // teamID: NonClientTeams.Analysts.id,
      teamSlug: NonClientTeams.Analysts.slug,
      permission: 'push'
    });

    await github.addRepoToTeam({
      repoName: ctx.repo.name,
      // teamID: NonClientTeams.ReadOnly.id
      teamSlug: NonClientTeams.ReadOnly.slug
    });
  } else {
    Logger.error('[-] no repo found');
    process.exit(1);
  }

  return ctx;
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
        throw new FatalError(`addnonclientteams:getRepos error\n\nFailed to retrieve repos\n${err.message}`);
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
    throw new FatalError('addnonclientteams:getTeam error\n\nIt appears you do not have access to any teams.');
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
        throw new FatalError(`addnonclientteams:getTeam prompts error - ${err.message}`);
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

    Logger.gen('\nselect the repo you want to add the non-client teams to');

    try {
      const res = await prompts({
        type: 'select',
        name: 'repo',
        message: '',
        choices: repoOptions
      });

      if ('repo' in res) {
        ctx.repo = res.repo;
        return ctx;
      } else {
        Logger.warn('\n[!] adding teams cancelled\n');
        process.exit(0);
      }
    } catch (err) {
      Logger.error(`addnonclientteams:showResults error\n\n${err.message}`);
    }
  }
};

/**
 * instantiates new command
 */
const addnonclientteamsCommand = new Command({
  pattern: '<addnonclientteams> <query?>',
  docs: `
    used to add non-client teams to a repo in the org github account

    if you do not provide a parameter when the command is entered, you will be prompted to enter a part of the test repo name. once confirmed, this command will add any registered non-client teams to the repo..

    [!] WARNING - Only members with owner privileges for an organization or admin privileges for a repository can add new teams to a repository.`
});

/**
 * register all parameters, arguments, and flags
 */
addnonclientteamsCommand
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
addnonclientteamsCommand.before = ctx => {
  Logger.gen('initializing...');

  if (ctx.arguments.parameters.query === undefined) {
    ctx.arguments.parameters.query = '';
    Logger.warn('[!] no query term included with search.');
  } else {
    ctx.arguments.parameters.query = ctx.arguments.parameters.query.toLowerCase();
  }

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
addnonclientteamsCommand.main = ctx => {
  ctx = searchRepos(ctx);

  return showResults(ctx)
    .then(addTeams);
};

/**
 * starting point for command. is the method called
 * by external sources for this command.
 *
 * @returns {Promise<Object>} - resolve with the context
 * once the command completed execution successfully
 */
export const exec = ctx => {
  github = new Github(ctx.config.github);

  return addnonclientteamsCommand.execute(ctx)
    .then(ctx => {
      Logger.complete('\n[+] non-client teams added\n');

      return ctx;
    });
};

/**
 * method called by external sources to retrieve
 * help/documentation about this command
 */
export const help = () => addnonclientteamsCommand.help();
