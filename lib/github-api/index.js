import axios from 'axios';
import parse from 'parse-link-header';

import FatalError from '../error/fatal-error';

const labels = require('./labels.json');
const defaultLabels = require('./default-labels.json');

/** Class representing library to interact with the GitHub API */
export default class Github {
  constructor (auth) {
    const {
      username = null,
      token = null,
      org = null
    } = auth;

    this._org = org;
    this._username = username;
    this._token = token;
    this._auth = {
      username: this._username,
      password: this._token
    };

    if (!this._username) {
      throw new FatalError('no github username found');
    } else if (!this._token) {
      throw new FatalError('no github token found');
    } else if (!this._org) {
      throw new FatalError('no github org found');
    }
  }

  /**
   * adds a member to a specified team
   *
   * @param {Object} options - the options to be passed to
   * the API
   *
   * @param {string} options.member_id - the username of the
   * member to be added
   *
   * @param {string} options.team_slug - the slug of the
   * team name
   *
   * @param {string} [options.role] - the role the member is
   * to be set to (maintainer (default), member)
   *
   * @returns {Promise<MemberStatus>} - the membership status of the added
   * user
   *
   * @see {@link https://developer.github.com/v3/teams/members/#add-or-update-team-membership}
   */
  addMember (options) {
    const opts = {
      member_id: null,
      team_slug: null,
      role: 'maintainer',
      ...options
    };

    if (!!opts.member_id && !!opts.team_slug) {
      const url = `https://api.github.com/orgs/${this._org}/teams/${opts.team_slug}/memberships/${opts.member_id}`;

      return axios({
        method: 'PUT',
        url,
        auth: this._auth,
        data: { role: opts.role }
      })
        .catch(err => {
          let message = err?.response?.data?.message;
          if (!message) message = err.message;
          throw new Error(message);
        });
    } else {
      if (!opts.member_id) {
        throw new FatalError('no member id found in request to add member');
      } else {
        throw new FatalError('no team slug found in request to add member');
      }
    }
  }

  /**
   * adds a specified repo to a specified team.
   *
   * @param {Object} options - the options to be passed
   * to the github api
   * @param {string} options.repoName - the name of the repo
   * to be added
   * @param {string|number} options.teamSlug - the slug of
   * the team name
   * @param {string} [options.permission] - the permission
   * level the team has to this repo
   *
   * @returns {Promise<void>} - resolves with the repo object
   * once it has been successfully added to the team
   */
  addRepoToTeam (options) {
    const {
      repoName = null,
      teamSlug = null,
      permission = 'pull'
    } = options;

    const url = `https://api.github.com/orgs/${this._org}/teams/${teamSlug}/repos/${this._org}/${repoName}`;

    return axios({
      method: 'PUT',
      url,
      auth: this._auth,
      data: { permission }
    })
      .catch(err => {
        let message = err?.response?.data?.message;
        if (!message) message = err.message;
        throw new Error(message);
      });
  }

  /**
   * creates a new column in a project
   *
   * @param {Object} options - the options to be passed
   * to the github api
   *
   * @param {number} options.projectId - the id of the
   * project the column will be created in
   *
   * @param {string} options.name - the name of the column
   * to be created.
   *
   * @return {Promise<Object>} - the newly created column
   * object.
   */
  async createProjectCol ({ projectId = null, name = null }) {
    if (!!projectId && !!name) {
      try {
        const res = await axios({
          method: 'POST',
          url: `https://api.github.com/projects/${projectId}/columns`,
          auth: this._auth,
          headers: {
            Accept: 'application/vnd.github.inertia-preview+json'
          },
          data: { name }
        });

        return res.data;
      } catch (err) {
        let message = err?.response?.data?.message;
        if (!message) message = err.message;
        throw new Error(message);
      }
    } else {
      const msg = !projectId
        ? 'no projectId found in request to create project column'
        : 'no column name found in request to create project column';

      throw new Error(msg);
    }
  };

  /**
   * creates a new project for a specified repo
   *
   * @param {Object} options - the options to be passed
   * to the github api
   *
   * @param {string} options.repo - the name of the
   * repo the project is to be created for
   *
   * @param {string} options.name - the name of the project
   * to be created
   *
   * @param {string[]} options.cols - array of the names of the columns
   * that will be added to the project.
   *
   * @param {string} [options.description] - the description
   * of the project
   *
   * @returns {Promise<Object>} - resolves with the newly
   * created project object.
   */
  async createProject ({ repo = null, name = null, cols = [], description = null }) {
    if (!!repo && !!name && cols.length > 0) {
      const opts = {};
      let project = {};

      if (name) opts.name = name;
      if (description) opts.body = description;

      try {
        const res = await axios({
          method: 'POST',
          url: `https://api.github.com/repos/${this._org}/${repo}/projects`,
          auth: this._auth,
          headers: {
            Accept: 'application/vnd.github.inertia-preview+json'
          },
          data: opts
        });

        project = { ...res.data, columns: [] };

        for (let i = 0; i < cols.length; i++) {
          project.columns.push(await this.createProjectCol({
            projectId: project.id,
            name: cols[i]
          }));
        }

        return project;
      } catch (err) {
        let message = err?.response?.data?.message;
        if (!message) message = err.message;
        throw new Error(message);
      }
    } else {
      const msg = !repo
        ? 'no repo name found in request to create project'
        : 'no project name found in request to create project';

      throw new Error(msg);
    }
  }

  /**
   * creates a new release for a specified
   * repo.
   *
   * @param {Object} options - the options to be passed
   * to the github api
   *
   * @param {string} options.repoName - the name of the
   * repo the release is to be created for
   *
   * @param {string} options.version - the version name
   * used for the tag_name and name parameters
   *
   * @param {string} [options.description] - the description
   * of the release
   *
   * @param {string} [options.targetCommitish] - the branch
   * the release is intended for
   *
   * @param {boolean} [options.draft] - flag indicating
   * if this release is to be a draft (unpublished) or a
   * published one
   *
   * @returns {Promise<Object>} - resolves with the release
   * object once it has been recieved from the github api.
   * response structure can be found here:
   * https://developer.github.com/v3/repos/releases/#create-a-release
   */
  createRelease (options) {
    const {
      repoName = null,
      version = null,
      description = '',
      targetCommitish = 'master',
      draft = false
    } = options;

    const versionFormat = /v[\d]{1,4}.[\d]{1,4}.[\d]{1,4}/g;

    if (repoName !== null && version !== null && versionFormat.test(version)) {
      const url = `https://api.github.com/repos/${this._org}/${repoName}/releases`;

      return axios({
        method: 'POST',
        url,
        auth: this._auth,
        data: {
          tag_name: version,
          name: version,
          target_commitish: targetCommitish,
          draft,
          body: description
        }
      })
        .catch(err => {
          let message = err?.response?.data?.message;
          if (!message) message = err.message;
          throw new Error(message);
        });
    } else if (repoName === null) {
      throw new Error('github:createRelease error\n\nrepoName is required');
    } else if (version === null) {
      throw new Error('github:createRelease error\n\nversion is required');
    } else {
      throw new Error('github:createRelease error\n\ninvalid version format found.\nversion must be in the format: v[d].[d].[d]');
    }
  }

  /**
   * creates a new repo assigned to the specified team
   *
   * @param {Object} options - the options to be sent to
   * the API
   *
   * @param {string} options.name - the name of the repo
   * to be created
   *
   * @param {number} options.team_id - the id of the team
   * the repo is to be created under
   *
   * @param {string} options.team_slug - the slug of the
   * team name
   *
   * @param {boolean} [options.private] - flag to id if
   * the repo is to be private or public (true (default),
   * false)
   *
   * @param {boolean) [options.auto_init] - pass true (default)
   * to create an initial commit with empty README.
   *
   * @returns {Object} - the created repo
   * the response object structure can be found here:
   * https://developer.github.com/v3/repos/#create
   */
  createRepo (options) {
    const opts = {
      name: null,
      team_id: null,
      team_slug: null,
      private: true,
      auto_init: false,
      ...options
    };

    if (!!opts.name && !!opts.team_id && !!opts.team_slug) {
      return axios({
        method: 'POST',
        url: `https://api.github.com/orgs/${this._org}/repos`,
        auth: this._auth,
        data: opts
      })
        .then(res => res.data)
        .then(repo => {
          return axios({
            method: 'PUT',
            url: `https://api.github.com/orgs/${this._org}/teams/${opts.team_slug}/repos/${repo.owner.login}/${repo.name}`,
            auth: this._auth,
            data: { permission: 'push' }
          })
            .then(() => repo);
        })
        .catch(err => {
          let message = err?.response?.data?.message;
          if (!message) message = err.message;
          throw new Error(message);
        });
    } else {
      if (!opts.name) {
        throw new FatalError('no test name found in request to create repo');
      } else if (!opts.team_id) {
        throw new FatalError('no team id found in request to create repo');
      } else {
        throw new FatalError('no team slug found in request to create repo');
      }
    }
  }

  /**
   * creates a new team in the org account
   *
   * @param {Object} options - the options to pass to the
   * github api
   * @param {string} options.name - the name of the team
   * to be created
   *
   * @returns {Promise<Object>} - resolves with the team object
   * returned from the github api
   * response object can be found here:
   * https://developer.github.com/v3/teams/#create-team
   */
  createTeam (options) {
    const { name = null } = options;
    const url = `https://api.github.com/orgs/${this._org}/teams`;

    if (name) {
      return axios({
        method: 'POST',
        url,
        auth: this._auth,
        data: {
          name,
          description: 'client_team',
          maintainers: [this._username],
          privacy: 'closed'
        }
      })
        .then(res => res.data)
        .catch(err => {
          let message = err?.response?.data?.message;
          if (!message) message = err.message;
          throw new Error(message);
        });
    } else {
      throw new FatalError('github:createTeam error\n\nteam name is required');
    }
  }

  /**
   * creates all labels needed for test.
   *
   * @param {Object} options - the options to be sent to
   * the API
   * @param {string} options.name - the name of the repo
   * to add labels to
   *
   * @returns {Promise<Object[]>} - resolves with labels created if
   * successful. rejects with error if fails.
   * structure of individual response object can be found here:
   * https://developer.github.com/v3/issues/labels/#create-a-label
   */
  createTestLabels (options) {
    const {
      name = null
    } = options;

    if (name !== null) {
      const url = `https://api.github.com/repos/${this._org}/${name}/labels`;

      return Promise.all(labels.map(label => {
        return axios({
          method: 'post',
          url,
          auth: this._auth,
          data: {
            name: label.name,
            color: label.color
          }
        });
      }))
        .then(results => {
          return this.deleteDefaultLabels({ name })
            .then(() => results);
        })
        .catch(err => {
          let message = err?.response?.data?.message;
          if (!message) message = err.message;
          throw new Error(message);
        });
    } else {
      throw new Error('failed to create labels - no repo name found');
    }
  }

  /**
   * deletes the default labels that github creates when
   * the repo is created.
   *
   * @param {Object} options - the options to be sent to the
   * API
   * @param {string} options.name - the name of the repo that
   * contains the labels to be deleted.
   *
   * @returns {Promise<void>} - resolves empty when successful.
   * rejects with error if fails.
   */
  deleteDefaultLabels (options) {
    const { name = null } = options;

    if (name !== null) {
      return Promise.all(defaultLabels.map(label => {
        return axios({
          method: 'delete',
          url: `https://api.github.com/repos/${this._org}/${name}/labels/${label.name}`,
          auth: this._auth
        });
      }))
        .catch(err => {
          let message = err?.response?.data?.message;
          if (!message) message = err.message;
          throw new Error(message);
        });
    } else {
      throw new Error('failed to delete default labels - no repo name found');
    }
  }

  /**
   * deletes a repo on the org account if the user is an
   * admin for the org.
   *
   * @param {Object} options - the options to be passed to
   * the github api
   * @param {string} options.repo - the name of the
   * repository to be deleted
   *
   * @returns {Promise<void>} - resolves once the repo has
   * been successfully deleted. will reject if user is not
   * an admin, if no repo name has been provided, or if
   * api throws an error.
   */
  deleteRepo (options) {
    const { repo = null } = options;

    const url = `https://api.github.com/repos/${this._org}/${repo}`;

    if (repo !== null) {
      return this.isAdmin({ username: this._username })
        .then(isAdmin => {
          if (isAdmin) {
            return axios({
              method: 'DELETE',
              url,
              auth: this._auth
            })
              .catch(err => {
                let message = err?.response?.data?.message;
                if (!message) message = err.message;
                throw new Error(message);
              });
          } else {
            throw new FatalError(`unauthorized user - only admins can delete repos for ${this._org}`);
          }
        });
    } else {
      throw new Error('github:deleteRepo failed - options.repo not found');
    }
  }

  /**
   * gets all branches associated with a repo
   *
   * @param {string} repo - the name of the repo
   * to get all associated branchs for
   *
   * @returns {Object[]} - an array of branch objects
   * as described in the Github API docs
   *
   * @see [github docs](https://developer.github.com/v3/repos/branches/#list-branches)
   */
  getAllBranches ({ repo = null }) {
    if (repo) {
      return axios({
        method: 'GET',
        url: `https://api.github.com/repos/${this._org}/${repo}/branches`,
        auth: this._auth
      })
        .then(res => res.data)
        .catch(err => {
          let message = err?.response?.data?.message;
          if (!message) message = err.message;
          throw new Error(message);
        });
    } else {
      throw new Error('github:getAllBranches failed - no repo name found');
    }
  }

  /**
   * retrieves all members assigned to the org.
   *
   * @param {string} [filter=all] - filters the members
   * returned in the list. can be either '2fa_disabled' or 'all'
   *
   * @param {string} [role=all] - filter members returned
   * by their role. values can be 'all', 'member', 'admin'
   *
   * @returns (Promise<Object[]>) - resolves with array of
   * member objects returned from the github api.
   * structure of individual response object can be found here:
   * https://developer.github.com/v3/orgs/members/#members-list
   */
  getAllMembers ({ filter = 'all', role = 'all' } = {}) {
    return axios({
      method: 'GET',
      url: `https://api.github.com/orgs/${this._org}/members?filter=${filter}&role=${role}`,
      auth: this._auth
    })
      .then(res => res.data)
      .catch(err => {
        let message = err?.response?.data?.message;
        if (!message) message = err.message;
        throw new Error(message);
      });
  }

  /**
   * gets all releases associated with a repo
   *
   * @param {string} repo - the name of the repo
   * to get all releases for
   *
   * @returns {Object[]} - array of release objects
   * as described in Github API docs.
   *
   * @see [github docs](https://developer.github.com/v3/repos/releases/#list-releases-for-a-repository)
   */
  getAllReleases ({ repo = null }) {
    if (repo) {
      return axios({
        method: 'GET',
        url: `https://api.github.com/repos/${this._org}/${repo}/releases`,
        auth: this._auth
      })
        .then(res => res.data)
        .catch(err => {
          let message = err?.response?.data?.message;
          if (!message) message = err.message;
          throw new Error(message);
        });
    } else {
      throw new Error('github:getAllReleases failed - no repo name found');
    }
  }

  /**
   * retrieves all teams under the organization
   *
   * @returns {Object[]} - all teams listed under the organization.
   * structure of individual response object can be found here:
   * https://developer.github.com/v3/teams/#list-teams
   */
  getAllTeams () {
    return axios({
      method: 'GET',
      url: `https://api.github.com/orgs/${this._org}/teams?page=1&per_page=100`,
      auth: this._auth
    })
      .then(res => {
        const parsedTeams = res.data.filter(team => team.description.indexOf('client_team') > -1);

        parsedTeams.sort((x, y) => {
          if (x.name < y.name) {
            return -1;
          } else if (x.name > y.name) {
            return 1;
          } else {
            return 0;
          }
        });

        return parsedTeams;
      })
      .catch(err => {
        let message = err?.response?.data?.message;
        if (!message) message = err.message;
        throw new Error(message);
      });
  }

  /**
   * retrieves the latest release of the specified repo
   *
   * @param {Object} options
   * @param {string} options.repoName - the name of the
   * repo to get releases for
   *
   * @returns {Promise<Object[]>} - resolves with the
   * release object returned from the github api.
   * structure of individual response object can be found here:
   * https://developer.github.com/v3/repos/releases/#list-releases-for-a-repository
   */
  getLatestRelease ({ repoName = null } = {}) {
    if (repoName) {
      return axios({
        method: 'GET',
        url: `https://api.github.com/repos/${this._org}/${repoName}/releases?page=1&per_page=100`,
        auth: this._auth
      })
        .then(res => res.data)
        .then(releases => {
          let newest = releases[0];

          releases.forEach(release => {
            if (new Date(release.created_at).getTime() > new Date(newest.created_at).getTime()) {
              newest = release;
            }
          });

          return newest;
        })
        .catch(err => {
          let message = err?.response?.data?.message;
          if (!message) message = err.message;
          throw new Error(message);
        });
    } else {
      throw new Error('no repo name provided');
    }
  }

  /**
   * retrieves all repositories that are listed under the
   * organization, or only under a team (if provided)
   *
   * @param {number} [page=1] - page for github api pagination.
   * if more than 100 repos are returned, will need to make
   * additional requests to get all repos
   *
   * @param {Object[]} [repos=[]] - the repos that have been
   * retrieved so far. if pagination is used, new results
   * will be added to this array for each request made
   *
   * @param {string} [teamSlug=null] - the team slug. if
   * provided, will only retrieve repos for that team.
   *
   * @returns {Object[]} - qualifying repos
   * if retrieving team repos, structure of individual
   * response object can be found here:
   * https://developer.github.com/v3/teams/#list-team-repos
   * else if retrieving all org repos, structure of
   * individual response object can be found here:
   * https://developer.github.com/v3/repos/#list-organization-repositories
   */
  getRepos ({
    page = 1,
    repos = [],
    teamSlug = null
  } = {}) {
    const url = teamSlug
      ? `https://api.github.com/orgs/${this._org}/teams/${teamSlug}/repos`
      : `https://api.github.com/orgs/${this._org}/repos`;

    return axios({
      method: 'GET',
      url: `${url}?page=${page}&per_page=100`,
      auth: this._auth
    })
      .then(res => {
        const _repos = [...repos, ...res.data];

        if ('link' in res.headers) {
          const parsedLink = parse(res.headers.link);

          if ('next' in parsedLink) {
            return this.getRepos({
              page: parsedLink.next.page,
              repos: _repos,
              teamSlug
            });
          } else {
            return _repos;
          }
        } else {
          return _repos;
        }
      })
      .then(repos => {
        return repos.sort((x, y) => {
          if (x.name < y.name) {
            return -1;
          } else if (x.name > y.name) {
            return 1;
          } else {
            return 0;
          }
        });
      })
      .catch(err => {
        let message = err?.response?.data?.message;
        if (!message) message = err.message;
        throw new Error(message);
      });
  }

  /**
   * retrieves all members of a specified team
   *
   * @param {Object} options - the options to be passed to
   * the github api
   * @param {string|number} options.teamSlug - the slug of
   * the team name
   * @param {string} [options.role] - the role to filter the
   * list of members returned by
   *
   * @returns {Promise<Object[]>} - resolves with array of
   * team member objects returned from the github api
   * structure of individual response object can be found here:
   * https://developer.github.com/v3/teams/members/#list-team-members
   */
  getTeamMembers (options) {
    const {
      teamSlug = null,
      role = 'all'
    } = options;

    const url = `https://api.github.com/orgs/${this._org}/teams/${teamSlug}/members?role=${role}`;

    return axios({
      method: 'GET',
      url,
      auth: this._auth
    })
      .then(res => {
        if ('data' in res) {
          return res.data;
        } else {
          throw new Error('github:getTeamMembers error\n\ndata property not found in response');
        }
      })
      .catch(err => {
        let message = err?.response?.data?.message;
        if (!message) message = err.message;
        throw new Error(message);
      });
  }

  /**
   * retrieves all teams the user is assigned to
   *
   * @return {Promise<Object[]>} - all teams the current authenticated
   * user is assigned to
   * structure of individual response object can be found here:
   * https://developer.github.com/v3/teams/#list-user-teams
   */
  getUserTeams () {
    return axios({
      method: 'get',
      url: 'https://api.github.com/user/teams',
      auth: this._auth
    })
      .then((res) => {
        const parsedTeams = res.data.filter(team => team.description.indexOf('client_team') > -1);

        parsedTeams.sort((x, y) => {
          if (x.name < y.name) {
            return -1;
          } else if (x.name > y.name) {
            return 1;
          } else {
            return 0;
          }
        });

        return parsedTeams;
      })
      .catch((err) => {
        let message = err?.response?.data?.message;
        if (!message) message = err.message;
        throw new Error(message);
      });
  }

  /**
   * identifies if the username specified is an admin or not.
   *
   * @param {Object} options
   * @param {string} options.username - the username of the
   * user to check if is admin
   *
   * @returns {Promise<boolean>} - resolves with boolean
   * indivating if user is admin or not after username is
   * compared to usernames of all admins. resolves true is
   * username is an admin, otherwise returns false.
   */
  isAdmin (options) {
    const url = `https://api.github.com/orgs/${this._org}/members?role=admin`;

    return axios({
      url,
      method: 'GET',
      auth: this._auth
    })
      .then(res => {
        let userIsAdmin = false;

        res.data.forEach(admin => {
          if (admin.login === options.username) userIsAdmin = true;
        });

        return userIsAdmin;
      })
      .catch(err => {
        let message = err?.response?.data?.message;
        if (!message) message = err.message;
        throw new Error(message);
      });
  }

  /**
   * removes a member from a specified team if that member is
   * apart of that team
   *
   * @param {Object} options - the options to be passed to the
   * API
   *
   * @param {string} memberID - the username of the member who
   * is being removed
   *
   * @param {number|string} teamSlug - the slug of the team
   * name
   *
   * @returns {Promise<void>} - resolves once the user has been
   * removed from the team successfully. will reject if user is not
   * on the team, or if an error occurred during the removal process
   */
  removeMember (options) {
    const {
      username = null,
      teamSlug = null
    } = options;

    const url = `https://api.github.com/orgs/${this._org}/teams/${teamSlug}/memberships/${username}`;

    return axios({
      method: 'delete',
      url,
      auth: this._auth
    })
      .catch(err => {
        let message = err?.response?.data?.message;
        if (!message) message = err.message;
        throw new Error(message);
      });
  }

  /**
   * renames an existing repo name to a new name
   *
   * @param {Object} options - the options to pass to the
   * github api
   *
   * @returns {Promise<Object>} - resolves with update repo object
   * once repo has been successfully updated.
   * structure of response object can be found here:
   * https://developer.github.com/v3/repos/#edit
   */
  renameRepo (options) {
    const {
      originalName = null,
      newName = null
    } = options;

    if (originalName !== null && newName !== null) {
      const url = `https://api.github.com/repos/${this._org}/${originalName}`;

      return axios({
        method: 'PATCH',
        url,
        auth: this._auth,
        data: {
          name: newName
        }
      })
        .then(res => res.data)
        .catch(err => {
          let message = err?.response?.data?.message;
          if (!message) message = err.message;
          throw new Error(message);
        });
    } else if (originalName === null) {
      throw new Error('github:renameRepo error - original repo name required');
    } else {
      throw new Error('github:renameRepo error - new repo name required');
    }
  }

  /**
   * searches for repo names registered under the organization
   * (or filtered only to team if teamId specified) that contain
   * query as substring
   *
   * @param {Object} options
   * @param {string} options.query - the string to search for
   * @param {number} [options.teamId] - the id of the team to
   * filter search results by
   *
   * @returns {Promise<Object[]>} - qualifying repos
   * if retrieving team repos, structure of individual
   * response object can be found here:
   * https://developer.github.com/v3/teams/#list-team-repos
   * else if retrieving all org repos, structure of
   * individual response object can be found here:
   * https://developer.github.com/v3/repos/#list-organization-repositories
   */
  searchForRepo (options) {
    const {
      query = null,
      teamId = null
    } = options;

    if (query) {
      return this.getRepos(teamId)
        .then(repos => {
          const results = repos.filter(repo => repo.name.toLowerCase().indexOf(query.toLowerCase()) > -1);

          results.sort((x, y) => {
            if (x.name < y.name) {
              return -1;
            } else if (x.name > y.name) {
              return 1;
            } else {
              return 0;
            }
          });

          return results;
        });
    } else {
      throw new FatalError('no query found in search request');
    }
  }

  /**
   * updates the protections of a specified branch of a specified
   * repo
   *
   * @param (Object) options - the options to be passed to the
   * github api
   *
   * @param {string} options.repoName - the name of the repo the
   * branch belongs to
   *
   * @param {string} options.branch - the name of the branch to
   * be updated
   *
   * @param {Object} [options.requiredStatusChecks] - Require status
   * checks to pass before merging
   *
   * @param {boolean} [options.requireStatusChecks.strict] - Require
   * branches to be up to date before merging.
   *
   * @param {string[]} [options.requireStatusChecks.contexts] - The
   * list of status checks to require in order to merge into this
   * branch
   *
   * @param {boolean} [options.enforceAdmins] - set to true to
   * enfoce these protection rules to admins as well
   *
   * @param {Object} [options.requiredPullRequestReviews] - Require
   * at least one approving review on a pull request, before merging.
   *
   * @param {Object} [options.requiredPullRequestReviews.dismissal_restrictions] -
   * Specify which users and teams can dismiss pull request reviews.
   *
   * @param {string[]} [options.requiredPullRequestReviews.dismissal_restrictions.users] -
   * The list of user logins with dismissal access
   *
   * @param {string[]} [options.requiredPullRequestReviews.dismissal_restrictions.users] -
   * The list of team slugs with dismissal access
   *
   * @param {boolean} [options.requiredPullRequestReviews.dismiss_stale_reviews] -
   * Set to true if you want to automatically dismiss approving reviews
   * when someone pushes a new commit.
   *
   * @param {boolean} [options.requiredPullRequestReviews.require_code_owner_reviews] -
   * Blocks merging pull requests until code owners review them.
   *
   * @param {number} [options.requiredPullRequestReviews.required_approving_review_count] -
   * Specify the number of reviewers required to approve pull
   * requests. Use a number between 1 and 6.
   *
   * @param {Object} [options.restrictions] - Restrict who can push
   * to this branch.
   *
   * @param {string[]} [options.restrictions.users] - The
   * list of user logins with push access
   *
   * @param {string[]} [options.restrictions.teams] - The
   * list of team slugs with push access
   *
   * @returns {Promise<void>} - resolves once the permissions have
   * been updated successfully
   */
  updateBranchProtection (options) {
    const {
      repoName = null,
      branch = null,
      requiredStatusChecks = {},
      enforceAdmins = false,
      requiredPullRequestReviews = {},
      restrictions = {}
    } = options;

    if (repoName !== null && branch !== null) {
      const url = `https://api.github.com/repos/${this._org}/${repoName}/branches/${branch}/protection`;

      const data = {
        required_status_checks: {
          strict: false,
          contexts: [],
          ...requiredStatusChecks
        },
        enforce_admins: enforceAdmins,
        required_pull_request_reviews: {
          dismissal_restrictions: {
            users: [],
            teams: []
          },
          dismiss_stale_reviews: false,
          require_code_owner_reviews: false,
          required_approving_review_count: 1,
          ...requiredPullRequestReviews
        },
        restrictions: {
          users: [],
          teams: [],
          ...restrictions
        }
      };

      return axios({
        url,
        method: 'PUT',
        auth: this._auth,
        headers: {
          Accept: 'application/vnd.github.luke-cage-preview+json' // required for beta/preview of this feature
        },
        data
      })
        .catch(err => {
          let message = err?.response?.data?.message;
          if (!message) message = err.message;
          throw new Error(message);
        });
    } else if (repoName === null) {
      return new Error('github:updateBranchProtection error\nyou must specify a repo name');
    } else {
      return new Error('github:updateBranchProtection error\nyou must specify a branch');
    }
  }
}
