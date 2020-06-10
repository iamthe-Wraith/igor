import prompts from 'prompts';

import Command from './Command';
import Github from '../../lib/github-api';
import FatalError from '../../lib/error/fatal-error';
import * as Team from '../utils/team';
import { Logger } from '../../lib/logger';

let github = null;

/**
 * gets all members assigned to org.
 *
 * @param {Object} ctx - the context
 *
 * @returns {Promise<Object>} - resolves once
 * members are successfully returned from github
 * library.
 */
const getAllMembers = ctx => {
  return github.getAllMembers()
    .then(members => {
      ctx.allmembers = members;
      return ctx;
    })
    .catch(err => {
      throw new FatalError(`addmember:getAllMembers error\n\n${err.message}`);
    });
};

/**
 * retrieves and verifies the team the user
 * wishes to add a member to.
 *
 * if team argument is found, will verify that
 * team name submitted is a valid team and that
 * the user has authorization to add members
 * to it. if not, user will be prompted to
 * select a team from a list of team names they
 * are authorized to add members to.
 *
 * if no team argument is found, user will be
 * prompted to select a team from a list of team
 * names they are authorized to add members
 * to.
 *
 * @param {Object} ctx - the context
 *
 * @param {Object} ctx.arguments - the arguments,
 * parameters, and flags entered in the initial
 * command by the user
 *
 * @param {Object} ctx.arguments.arguments - the
 * arguments (flag-like identifier followed by a
 * value) entered in the initial command by the user
 *
 * @param {string} [ctx.arguments.arguments.team] -
 * the name of the team the user is trying to
 * retrieve data for.
 *
 * @param {Object[]} ctx.teams - array of objects
 * (each element is an object of team data returned
 * from the github api)
 *
 * @return {Promise<Object>} - resolves once a valid
 * team is selected and its data is retrieved.
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
      message = `\n${team} is either not a valid team name, or you are not authorized to add members to that team.\nplease choose one of your authorized teams from the list below (or press ctrl+C to cancel)`;
    }
  } else {
    message = '\nWhat team would you like to add a member to?';
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
      throw new FatalError(`addmember:getTeam prompt error - ${err.message}`);
    }
  } else if ('team' in ctx) {
    return ctx;
  }
};

/**
 * retrieves the member to be added. if username is
 * provided as an argument, confirms is valid username
 * and that user is not already on the selected team..
 * if not provided as an argument, user is prompted
 * to select from list of available member usernames
 * that are not already a part of the team.
 *
 * @param {Object} ctx - the context
 *
 * @param {ParsedTeam} ctx.team - the team the user is
 * attempting to add a member to.
 *
 * @param {Object} ctx.arguments - the arguments,
 * parameters, and flags entered in the initial
 * command by the user
 *
 * @param {Object} ctx.arguments.arguments - the
 * arguments (flag-like identifier followed by a
 * value) entered in the initial command by the user
 *
 * @return {Promise<Object|Error>} - resolves with updated
 * context. update adds 'member' property that is an object
 * which has 1 property: 'username'. rejects with new
 * FatalError if fails
 */
const getMember = ctx => {
  return github.getTeamMembers({ teamSlug: ctx.team.slug })
    .then(async (teamMembers) => {
      let message = null;

      const { username = null } = ctx.arguments.arguments;

      if (username) {
        if (ctx.allmembers.filter(member => member.login.toLowerCase() === username.toLowerCase()).length) {
          if (teamMembers.filter(member => member.login.toLowerCase() === username.toLowerCase()).length) {
            throw new FatalError(`[-] ${username} is already a member of ${ctx.team.name} - addmember cancelled`);
          } else {
            ctx.user = username;
          }
        } else {
          message = `\n${username} is not a valid username.\nplease choose a username from the list below to add to ${ctx.team.name} (or press ctrl+C to cancel)`;
        }
      } else {
        message = `\nwho would you like to add to ${ctx.team.name}?`;
      }

      if (!('user' in ctx) && message !== null) {
        const memberOptions = ctx.allmembers.filter(member => {
          let alreadyOnTeam = false;

          teamMembers.forEach(teamMember => {
            if (teamMember.login.toLowerCase() === member.login.toLowerCase()) alreadyOnTeam = true;
          });

          return !alreadyOnTeam;
        }).map(member => {
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
            Logger.warn('\n[!] addmember cancelled\n');
            process.exit(1);
          }
        } catch (err) {
          throw new FatalError(`addmember:getMember prompt error - ${err.message}`);
        }
      } else {
        return ctx;
      }
    })
    .catch(err => {
      throw new FatalError(`addmember:getMember error\n\n${err.message}`);
    });
};

/**
 * handles adding member to team
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with updated context.
 * update adds 'results' property that is the response from the
 * github api. rejects with error received from github api if fails
 */
const addMember = ctx => {
  const { member = false } = ctx.arguments.flags;

  Logger.gen('adding member...');

  const options = {
    member_id: ctx.user,
    team_slug: ctx.team.slug,
    role: member ? 'member' : 'maintainer'
  };

  return github.addMember(options)
    .then(results => {
      ctx.results = results;

      return ctx;
    })
    .catch(err => {
      throw new FatalError(`addmember:addMember error\n\n${err.message}`);
    });
};

/**
 * instantiates new command
 */
const addmemberCommand = new Command({
  pattern: '<addmember>',
  docs: `
    adds a user to a client team. requires org owner or team maintainer permissions`
});

/**
 * register all parameters, arguments, and flags
 */
addmemberCommand
  .flag('member|m', {
    description: 'add this flag if you wish to restrict this user with member permissions on the team'
  })
  .argument('team|t', {
    description: 'the team to add the user to. if not entered, you will be prompted with a list of all teams in the org.'
  })
  .argument('username|u', {
    description: 'the users github username. this user must already be a member of the BrooksBellInc organization'
  });

/**
 * overwrite the before method of Command.
 *
 * retrieves all client teams associated with the org
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with updated context.
 * update adds 'teams' property that is the response from the github
 * api that includes all client teams associated with the org. rejects
 * with error received from github api if fails
 */
addmemberCommand.before = ctx => {
  Logger.gen('initializing...');

  return Team.getTeams(ctx)
    .then(ctx => {
      if (ctx.teams.length === 0) {
        throw new FatalError('it appears you do not have access to any teams. addmember cancelled');
      } else {
        return ctx;
      }
    })
    .then(getAllMembers);
};

/**
 * overwrite the main method of Command
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the context.
 * rejects with error if fails
 */
addmemberCommand.main = ctx => {
  return getTeam(ctx)
    .then(getMember)
    .then(addMember);
};

/**
 * starting point for command. is the method called by external
 * sources for this command
 *
 * @param {Promise<Object>} ctx - the context
 */
export const exec = ctx => {
  github = new Github(ctx.config.github);

  return addmemberCommand.execute(ctx)
    .then(ctx => {
      Logger.complete(`\n[+] ${ctx.user} added to ${ctx.team.name}\n`);

      return ctx;
    });
};

/**
 * method called by external sources to retrieve help/documentation
 * about this command
 */
export const help = () => {
  addmemberCommand.help();
};
