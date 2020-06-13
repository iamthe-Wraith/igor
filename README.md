# igor

Like the assistant to the famous mad scientist, Dr. Frankenstein, Igor helps to set up and manage everything for internal experiments.

[dependency versions](#dependencyversions)  
[installation](#installation)  
[getting your access token](#gettingyouraccesstoken)  
[commands](#commands)  
[template variables](#templatevariables)  
[customization](#customization)  
[version notes](#versionnotes)  
[future features](#futurefeatures)  

<h3 id="dependencyversions">RECOMMENDED DEPENDENCY VERSIONS</h3>

- Node ----- < v11.7.0
- NPM ------ < v6.5.0

<h3 id="installation">INSTALLATION</h3>

Steps:
1. traverse to directory you would like to store the Igor repo.  
2. run command: `git clone https://github.com/BrooksBellInc/igor.git`  
3. traverse into the newly created directory named: igor  
4. run command `npm install`  
(if this is your first time installing the new version of Igor, you will be presented with some prompts requesting your github username, and a github access token (see section "GETTING YOUR ACCESS TOKEN" if you don't know how to find this). This information will be stored in a file called `.igorrc` in your home directory.)  
5. run command `npm run build` to generate the `bin/igor` file
6. run command `npm install -g`
7. confirm installation by running command: `which igor` (if no path prints in the console, something went wrong)

that's it! Igor should now be ready to do your bidding.

<h3 id="gettingyouraccesstoken">GETTING YOUR ACCESS TOKEN</h3>

Since Igor uses the GitHub API, you are going to need to provide an access token that it will store for later use. If you are unfamiliar with how to generate an access token, you can follow [these instruction](https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/)

Note for step 7, Igor only requires that "repo" and "admin:org" be selected (though you can provide whatever additional permissions you would like) (if you are an admin, I would recommend also including "delete repo" permissions).

Once you have copied the token, you will need to do one of two things:

1. When you install Igor, it looks for a file named .igorrc to exist in your home directory. If that file is not found, you will be presented with a couple of prompts asking for your GitHub credentials. One of these prompts will ask for a token. Paste the token you generated into this prompt and proceed.

2. You may need/want to update your token after installation. Simply open the .igorrc file in your home directory and replace the existing token with your new one.

<h3 id="commands">COMMANDS</h3>

For a list of available commands, in your terminal, run the command: `igor help`  
If you would like to see further documentation for a specific command, you can use the command|c argument. in your terminal, run either of these commands:   
`igor help -c [name of command]`  
`igor help --command [name of command]`  

<h3 id="template-variables">TEMPLATE VARIABLES</h3>
a list of template variables that are available for use.

<h4>Variables Available for Client Templates</h4>
- `{{clientName}}` - the name of the client the test is being created for.
- `{{dateCreated}}` - the date the test is being created (format: YYYY-MM-DD)
- `{{testName}}` - the name of the test being created
- `{{username}}` - the username of the user creating the test

<h4>Variables Available for Module Templates</h4>
- `{{moduleEntryMethodName}}` - the name of the main entry method for the module
- `{{moduleName}}` - the name of the new module being created
- `{{statefulImport}}` - the import statement for `bbmodules/State`. (when added to a template, will only add the import statement if the stateful flag is included with the command)
- `{{statefulInit}}` - the `initState` function. (when added to a template, will only add the `initState` function if the stateful flag is included with the command)
= `{{statefulInitCall}}` - the call to the `initState` function. (when added to a template, will only add the `initState` function call if the stateful flag is included with the command)

<h3 id="customization">CUSTOMIZATION</h3>

You can customize the colors used for all the messages that the Igor prints to the console.

to customize, all that is needed is to update the 'colors' property within the .igorrc file, located in your home directory.

```json
   "colors": {
    "title": "cyan",
    "gen": "white",
    "success": "green",
    "warn": "yellow",
    "error": "red",
    "debug": "gray",
    "complete": "rainbow"
  }
```

don't change the keys in this object, only update the color values with one of the color options listed below:

```text/plain
  black  
  red  
  green  
  yellow  
  blue  
  magenta  
  cyan  
  white  
  gray  
  grey  
  rainbow  
  zebra  
  america  
  trap  
  random  
```

additionally, when you search for repos, Igor will display a limited number of repos if found. if more are found, then you will be instructed to refine your search. The default max is set to 10, but you can increase or decrease this by modifying the `maxReposToShow` property in the .igorrc file.

