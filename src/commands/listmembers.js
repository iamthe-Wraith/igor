import prompts from 'prompts';

import Command from './Command';
import Github from '../../lib/github-api';
import FatalError from '../../lib/error/fatal-error';
import * as Team from '../utils/team';
import { Logger } from '../../lib/logger';

let github = null;

/**
 * prints list of member usernames
 *
 * @param {Object} ctx - the context
 *
 * @return {Object} - returns the context
 * once all member usernames have been
 * printed to console.
 */
const displayMembers = ctx => {
  let message = null;
  const group = ('team' in ctx && ctx.team) ? ctx.team.name : 'org';

  if (ctx.arguments.flags.admins && group === 'org') {
    message = '\ndisplaying all org members with owner permissions';
  } else if (ctx.arguments.flags.admins && group !== 'org') {
    message = `\ndisplaying all ${group} members with maintainer permissions`;
  } else {
    message = `\ndisplaying all ${group} members`;
  }

  Logger.complete(message);

  ctx.members.forEach((member, i) => Logger.gen(`\t- ${member.login}${i === (ctx.members.length - 1) ? '\n' : ''}`));

  return ctx;
};

/**
 * retrieves the members of the specified group.
 *
 * if no team is specired and admin flag is found,
 * will retrieve all github owners.
 *
 * if team is specified and admin flag is found,
 * will retrieve all members with 'maintainer'
 * permissions
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - will resolve
 * with updated context once members have been
 * retrieved successfully. update includes addition
 * of property 'members' which holds array of member
 * objects returned from github api
 */
const getMembers = ctx => {
  const { team = null } = ctx;

  if (team) {
    return github.getTeamMembers({
      teamSlug: team.slug,
      role: ctx.arguments.flags.admins ? 'maintainer' : 'all'
    })
      .then(members => {
        if (members.length) {
          ctx.members = members;
          return ctx;
        } else {
          Logger.warn(`\nno members are assigned to ${team.name}\n`);
          process.exit(0);
        }
      })
      .catch(err => {
        throw new FatalError(`listmembers:getMembers error\n\n${err.message}`);
      });
  } else {
    return github.getAllMembers({ role: ctx.arguments.flags.admins ? 'admin' : 'all' })
      .then(members => {
        ctx.members = members;
        return ctx;
      })
      .catch(err => {
        throw new FatalError(`listmembers:getMembers error\n\n${err.message}`);
      });
  }
};

/**
 * if team argument is found, will check if is
 * valid team name. if it is, will retrieve team
 * id. if is not, user will be prompted to select
 * a team from list.
 *
 * if no team argument is found, team will be set
 * to null
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves with the
 * updated context when team is retrieved or when
 * is identified that no team is needed. update
 * includes addition of property 'team' which will
 * either be team object, or null.
 */
const getTeam = async (ctx) => {
  let message = null;

  const {
    team = null
  } = ctx.arguments.arguments;

  if (team) {
    const validTeam = ctx.teams.filter(t => t.name.toLowerCase() === team.toLowerCase());

    if (validTeam.length) {
      ctx.team = {
        id: validTeam[0].id,
        name: validTeam[0].name.toLowerCase(),
        slug: validTeam[0].slug
      };
    } else {
      message = `\n${team} is not a valid team name.\nplease select the team you want to view the members of from the list below (or press ctrl+C to cancel)`;
    }
  } else {
    ctx.team = null;
  }

  if (!('team' in ctx) && message !== null) {
    const teamOptions = Team.getPromptOptions(ctx.teams);

    Logger.gen(message);

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
        Logger.warn('\n[!] addmember cancelled\n');
        process.exit(1);
      }
    } catch (err) {
      throw new FatalError(`listmembers:getTeam error\n\n${err.message}`);
    }
  } else if ('team' in ctx) {
    return ctx;
  } else {
    throw new FatalError('listmembers:getTeam error\n\nwell, this is awkward...something has gone wrong, but I have no idea what happened...');
  }
};

/**
 * instantiates new command
 */
const listmembersCommand = new Command({
  pattern: '<listmembers>',
  docs: `
    lists all members of a specified group. if no group is specified, will default to organization`
});

/**
 * register all parameters, arguments, and flags
 */
listmembersCommand
  .flag('admins|a', {
    description: 'add this flag if you wish to only see a list of admins. if no team is specified, will retrieve all members with \'owner\' permissions for github org account. if a team is specified, will retrieve all members of the specified team that have \'maintainer\' permissions'
  })
  .argument('team|t', {
    description: 'the team to list members of. if an invalid team is found, user will be prompted with a list of teams to choose from'
  });

/**
 * overwrite the before method of Command.
 *
 * retrieves all teams associated with the org.
 *
 * @param {Object} - the context
 *
 * @returns {Promise<Object>} - resolves with the
 * context once preparation is completed successfully
 */
listmembersCommand.before = ctx => {
  Logger.gen('initializing...');

  return Team.getTeams(ctx);
};

/**
 * overwrite the main method of Command.
 *
 * @param {Object} - the context
 *
 * @returns {Promise<Object>} - resolves with
 * the context once the main body of the command
 * has completed executing successfully
 */
listmembersCommand.main = ctx => {
  return getTeam(ctx)
    .then(getMembers)
    .then(displayMembers);
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

  return listmembersCommand.execute(ctx);
};

/**
 * method called by external sources to retrieve help/documentation
 * about this command
 */
export const help = () => listmembersCommand.help();
