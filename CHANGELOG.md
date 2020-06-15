### v1.0.0
- rebranded from `Build Tool` to `Igor`
- added new addnonclientteams command to handle adding teams like the ReadOnly and Analytics teams that are dedicated to a single client
- added global template support
- added project creation on init
- added sharable module templates support
- added hot test reloading
- removed user only teams retrieval. now all calls to get teams will retrieve all teams associated with org
- removed anti-pattern project wide
- github api endpoint deprecation updates
- github api error messages updated
- removed github-api dependency
- implemented eslint
- added version flag to namespace
- updated BrooksBellInc dependency listings
- updated installation instructions
- postinstall bug fix

-----

# legacy Build Tool

### v3.3.0  
- adds necessary non-client teams to all new repos
- new labels added to each test
- version notes migrated to CHANGELOG.md

### v3.2.5
- new cmd: createmodule - code generator for individual modules within a test
- terser dependency vulnerability fixed
- github "status of undefined" error resolved

[all version between 3.2.0 and 3.2.2 were caused by launching issues, but no code changes were made]

### v3.2.4
- init command updated to install latest version of bb webpack plugins (same as bbmodules and [client]\_modules)

### v3.2.3
- createteam bug fix - was hanging on retrieval of starter kit

### v3.2.0
- new cmd: createteam - handles everything associated with creating a new client team  
- new cmd: deleterepo - deletes a specified repo from the org's github    
- new cmd: listmembers - lists members in org or specified team  
- new cmd: removemember - removes a member from a team  
- new cmd: renamerepo - renames a repo (remote and local)  
- cmd:addmember refactored to show all teams to admins and only members who are not already part of the selected team in prompts  
- cmd:addvariation refactored to prevent argument:count values < 1, to prevent the command being used on non-test directories, and to prevent variations beyond bounds of 'Z' being created  
- cmd:convert refactored to show all teams to admins in prompt list, and to allow admins to convert tests for all teams, not just those they are assigned to  
- cmd:searchrepos query is no longer case sensitive  
- implemented support for multiple boilerplate tempates for client tests
- gulpless setup and auto populated variant template variables  
- updated variations to be able to go beyond 'Z'
- outdated version notifications add to notify user when their version of the build tool is outdated and a new version of the tool is available
- improved error messaging  
- updated JSDocs
- test README.md auto populated with additional notes headers  
- resolution of prompt random duplication of messages  
- miscellaneous bugfixes  
- github api:add team member deprecation update  
- functions migrated to utils library for reuse

### v3.0.0
- using github to store tests and client modules, and to control access to client codebases
- file structure updated for easier contribution
- command line arguments and flags for additional command entry formats and optional configurations.
- addmember command - to add members to github teams from the command line
- self-documenting commands
- bbmodules and client modules are now npm dependencies
- releases are now used for bbmodules and client modules to enforce each test uses the correct version unless manually updated
- dependencies updated
- client modules directory structure updated to allows for easier documentation
- tests built with previous version of the build tool (bbwp) can be converted to the new structure with single command
- client modules and templates must be reviewed before can be merged to master, which ensure multiple people look at the code before it gets shared and used by others 
