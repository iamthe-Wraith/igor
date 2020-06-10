import prompts from 'prompts';

import Command from './Command';
import { Logger } from '../../lib/logger';
import Github from '../../lib/github-api';
import FatalError from '../../lib/error/fatal-error';
import * as Team from '../utils/team';

let github = null;

/**
 * gets the user to be removed from the
 * selected team
 *
 * first checks if username was entered
 * as argument. if found, will verify that
 * entered username is the username of an
 * existing member of this team. if so,
 * will resolve, else will prompt user
 * adivising that is invalid user and
 * ask them to select a valid user from
 * a list. if NOT found, user will be
 * asked to select the user they want
 * to remove from a list of all members
 * that are a part of that team.
 *
 * @param {Object} ctx - the context
 *
 * @returm {Promise<Object>} - resolves
 * with the updated context once a valid
 * user has been found. update includes
 * the addition of property 'user' that
 * is the username of the user to be
 * removed.
 */
const getMember = ctx => {
  return github.getTeamMembers({ teamSlug: ctx.team.slug })
    .then(async (members) => {
      if (members.length === 0) {
        throw new FatalError(`[-] there are no users assigned to team: ${ctx.team.name}`);
      } else {
        let message = null;

        const {
          username = null
        } = ctx.arguments.arguments;

        if (username) {
          const user = members.filter(member => member.login.toLowerCase() === username.toLowerCase());

          if (user.length) {
            ctx.user = user[0].login.toLowerCase();
          } else {
            message = `\n${username} is not listed as a member of ${ctx.team.name}.\nplease choose a user from the list below (or press ctrl+C to cancel)`;
          }
        } else {
          message = `\nwho would you like to remove from ${ctx.team.name}?`;
        }

        if (!('user' in ctx) && message !== null) {
          const memberOptions = members.map(member => {
            return {
              title: member.login,
              value: {
                name: member.login.toLowerCase()
              }
            };
          });

          Logger.gen(message);

          try {
            const res = await prompts({
              type: 'select',
              name: 'user',
              message: '',
              choices: memberOptions
            });

            if ('user' in res) {
              ctx.user = res.user.name;
              return ctx;
            } else {
              Logger.warn(`\n[!] removemember cancelled\n`);
              process.exit(1);
            }
          } catch (err) {
            throw new FatalError(`removemember:getMember error\n\n${err.message}`);
          }
        } else {
          return ctx;
        }
      }
    })
    .catch(err => {
      throw new FatalError(`removemember:getMember error\n\n${err.message}`);
    });
};

/**
 * retrieves and verifies the team the user
 * wishes to remove a member from.
 *
 * if team argument is found, will verify that
 * team name submitted is a valid team and that
 * the user has authorization to remove members
 * from it. if not, user will be prompted to
 * select a team from a list of team names they
 * are authorized to remove members form.
 *
 * if no team argument is found, user will be
 * prompted to select a team from a list of team
 * names they are authorized to remove members
 * from.
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolvees
 */
const getTeam = async (ctx) => {
  let message = null;

  const {
    team = null
  } = ctx.arguments.arguments;

  if (team) {
    const validTeam = ctx.teams.filter(t => t.name.toLowerCase() === team.toLowerCase());

    if (validTeam.length > 0) {
      ctx.team = {
        id: validTeam[0].id,
        name: validTeam[0].name.toLowerCase(),
        slug: validTeam[0].slug
      };
    } else {
      message = `\n${team} is either not a valid team name, or you are not authorized to remove members from that team.\nplease choose one of your authorized teams from the list below (or press ctrl+C to cancel)`;
    }
  } else {
    message = '\nwhat team would you like to remove a member from?';
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
        Logger.warn('\n[!] remove cancelled\n');
        process.exit(1);
      }
    } catch (err) {
      throw new FatalError(`removemember:getTeam error\n\n${err.message}`);
    }
  } else if ('team' in ctx) {
    return ctx;
  }
};

/**
 * makes the call to the github api
 * (using the github library) to
 * remove the member from the team
 *
 * @param {Object} ctx - the context
 *
 * @return {Promise<Object>} - resolves
 * with the context once the user has
 * been successfully removed from the
 * team.
 */
const removeMember = ctx => {
  if ('team' in ctx && 'id' in ctx.team && 'user' in ctx) {
    return github.removeMember({ username: ctx.user, teamSlug: ctx.team.slug })
      .then(() => ctx)
      .catch(err => {
        throw new FatalError(`removemember:removeMember error\n\n${err.message}`);
      });
  } else {
    throw new FatalError('well this is embarrassing...something seems to have gone wrong, but I have no idea what it was...');
  }
};

/**
 * instantiate new command
 */
const removememberCommand = new Command({
  pattern: '<removemember>',
  docs: `
    removes a user from a client tesm. requires org owner or team maintainer permissions`
});

/**
 * register arguments
 */
removememberCommand
  .argument('team|t', {
    description: 'the team to remove the member from. if not entered, you will be prompted with a list of teams in the org'
  })
  .argument('username|u', {
    description: 'the user\'s github username. this user must already be a member of the BrooksBellInc organization, and a member of the requested team. if not entered, you will be prompted with a list of usernames that are members of the requested team'
  });

/**
 * overwrite the before method of Command.
 *
 * retrieves teams user is authorized to
 * remove members from.
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with updated context.
 * update adds 'teams' property that is the response from the github
 * api that includes all client teams associated with the org. rejects
 * with error received from github api if fails
 */
removememberCommand.before = ctx => {
  Logger.gen('initializing...');

  return Team.getTeams(ctx)
    .then(ctx => {
      if (ctx.teams.length === 0) {
        throw new FatalError('it appears that you do not have access to any teams. removemember cancelled');
      } else {
        return ctx;
      }
    });
};

/**
 * overwrite the main method of Command
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the context.
 * rejects with error if fails
 */
removememberCommand.main = ctx => {
  return getTeam(ctx)
    .then(getMember)
    .then(removeMember);
};

/**
 * starting point for command. is the method
 * called by external sources to start execution
 * of this command
 *
 * @param {Object} - the context
 *
 * @returns {Promise<Object>} - resolves with the
 * context once the command has completed executing
 * successfully.
 */
export const exec = ctx => {
  github = new Github(ctx.config.github);

  return removememberCommand.execute(ctx)
    .then(ctx => {
      Logger.complete(`\n[+] ${ctx.user} removed from ${ctx.team.name}\n`);

      return ctx;
    });
};

/**
 * method called by external sources to
 * retrieve help/documentatioin about this
 * command
 */
export const help = () => removememberCommand.help();
