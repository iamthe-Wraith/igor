import Github from '../../lib/github-api';

/**
 * retrieves all teams associated with the org.
 *
 * @param {Object} ctx - the context
 * @return {Promise<Object|Error>} - resolves with the
 * updated context. the update adds the 'teams' property
 * which is an array of all the teams retrieved. rejects
 * with new FatalError if fails.
 */
export const getTeams = ctx => {
  const github = new Github(ctx.config.github);

  return github.getAllTeams()
    .then(teams => {
      ctx.teams = teams;

      return ctx;
    });
};

/**
 * assembles team options for select prompt
 *
 * @param {Array<Object>} - all available teams
 * @return {Array<Object>} - team options in required
 * prompt format
 */
export const getPromptOptions = teams => {
  return teams.map(team => {
    return {
      title: team.name,
      value: {
        id: team.id,
        name: team.name.toLowerCase()
      }
    };
  });
};
