/**
 * @typedef {Object} INonClientTeam
 *
 * @property {number} id - the github team
 * id for this team
 */

/**
 * is a list of team ids that will be
 * added to all test repos on init.
 * these are non client teams, so will
 * not be selectable in team prompts.
 *
 * @type {Object.<INonClientTeam>}
 */
const nonClientTeams = {
  AllDevs: {
    id: 2145144,
    slug: 'all-devs'
  },
  Analysts: {
    id: 3706995,
    slug: 'analysts'
  },
  ReadOnly: {
    id: 3662623,
    slug: 'readonly'
  }
};

export default nonClientTeams;
