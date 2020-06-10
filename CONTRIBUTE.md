## FILE STRUCTURE
bin     - holds the scripts that get executed when Igor is installed or when a command is entered  
config  - holds any config files used in the development of Igor (ie. webpack.config.js)  
contrib - holds any documents that pertain to contributing to the development of Igor  
lib     - organizes modules to be used in various parts of Igor (including within commands)  

  error  - scripts written to handle/expand errors  
  github - library dedicated to the use of the github api  
  logger - handles all logging to the console for the entire tool (console.log should not be used)  
  parser - used by Igor to parse commands entered in the command line, and also to register the expected types of input for each command  

src - the primary location for development files  

  commands - stores all command files
  utils    - stores utility scripts (smaller scripts and functions that may not warrant being added to the lib directory)  

## WRITING A COMMAND
Igor was written with collaboration in mind. Because of this, you dont need to know a lot about the rest of the tool in order to create your own command (or modify an existing one). All code pertaining to an individual command lives inside the single command file (src/commands/[command name].js) except for modules added to lib/ or external dependencies.

To create a new command...

First, make sure you're in the Igor repo already on your machine (don't clone down a new one.)

Then, create a new branch.

Once you've done that, simply create a new .js file inside `src/commands` that has the same name as the command.

Once the file has been created, open up src/commands/index.js and add the name of your command to the Set (try to keep it in alphabetical order for ease of use). This is an index of all commands, and is used by the main process to identify which file is to be used for the entered command.

Now its time to write some code. Lucky for you, there are only a handful of rules you need to follow when writing your command:

  (if at any point, you do not understand one of the following directions, please refer to one of the existing command files for reference. test.js may be the shortest and easiest to follow.)

  1. you will need to import the following 2 things:
    - the Command class: `import Command from 'commands/Command'`  
    - the Logger: `import { Logger } from 'lib/Logger'`  
    - additionally, if any errors will be thrown in your script (which is likely) you may want to also import the FatalError class, which is a simple class that handles throwing the error AND and setting a flag that tells the process to exit. `import FatalError from 'lib/error/fatal-error'`

  2. you must instantiate an instance of the Command class. `const [commandName] = new Command({...})`
  
This constructor takes 1 argument, an Object with 2 properties:
  - pattern - the pattern the command is to follow including any parameters (see the documentation within the parser  (lib/parser/index.js) for more technical instructions)
  - docs - a high level description of what the command does, and any special instructions pertinent to using it.
  
Example:
```javascript
 const testCommand = new Command({
   pattern: '<test> <username> <password> <optionalParam?>',
   docs: `
     this is just a test command
     and these docs will be used inside the help command
     so be sure to update them for each command created.`
 });
```

  3. if the command takes any input at all, it will be in the form of arguments, flags, and parameters (see below for a description of each). Once the Command class is instantiated, you must then register the arguments, flags, and parameters that can/will be used.

  4. there are 3 methods of the Command class you are able to overwrite: before, main, and after. Most of your comand's execution will occur in main, so this is the function that you will need to overwrite. However, sometimes there are things that need to occur before you can begin execution. You can do these things within the before method, which will always execute before main. Conversely, if there is something you need to do after your command executes, you can do this in the after method, which will always execute after main.

  Each of these methods takes a single argument (the context), and returns a promise. You will need to follow this same pattern in order to overwite them.

  5. your file must export 2 functions:
    - exec - the starting point of your command. this is the function that external sources will call to execute your command. it must received 1 argument (the context) and it must call your command object's execute method.
    - help - the function that is called by the help command if further details are requested about your command. this function takes no arguments, and ONLY calls your command object's help method.



That's it! The rest is up to you, and if you follow these few rules, you command will work as you intend it to with the rest of Igor's functionality.

If you are feeling particularly lazy, it might be easier to copy the test.js file, rename it, and start your command from that point...we wont judge!



#### To test your command...

Save your changes, and run `npm run build`

Troubleshoot any errors that come up. If there are no errors, you should see your command work as intended - good job!

## USER INPUT
Each command is able to accept 3 different types of input, and each one serves its own purpose:

##### Parameters
Parameters are the most strict type of input. Their order must be set in the pattern when a new Command object is instantiated, and they are the only input type that can be required (by default they are required, but they can be marked as optional if you desire --- however, all optional parameters MUST be at the end of the order. an optional parameter cannot come before a required parameter in the order). So if you need input that has to be in a certain order, or the user is required to provide some additional data with the command, this is the input type you should use.

```
igor searchrepos "pdp_test"

// "pdp_test" is the parameter
```

##### Flags
Flags are the most basic of the 3 input types, but they can be very powerful and can allow for a lot of convenience for the user. A flag is a single character or word, preceeded by a single hyphen (if is a single character), or 2 hyphens (if entered in the long form (whole word)). These are optional indicators that activate some kind of functionality when they are entered with the command. An example would be when searching for repos, you can use the all|a flag to show all results even if more than your configured maximum are returned;

```
igor searchrepos pdp_test --all

igor searchrepos pdp_test -a
                        
// --all and -a are flags
```

##### Arguments
Arguments are a little like flags and a little like parameters. Like flags, they are always optional, and they activate some kind of functionality when they are found in the command. But like parameters, they allow the user to enter additional information with the command. To use this input type, you would enter the flag (either as a single character or the entire word, preceeded by hyphen(s)), followed by the value to be sent to the command. An example of this would be when searching for a repo, you can use the team|t argument to filter the search to a single team, rather than all repos in the organization.

```
igor searchrepos pdp_test --team "barnes"

// '--team "barnes"' is an argument
```

## WANT TO CONTRIBUTE BUT DONT HAVE ANY IDEAS?
that's okay, check out the list of issues in the Igor repo. we will work to keep a list of feature requests and bugs available for anyone that wants to contribute to pick from.

## DEBUGGING AND TESTING COUNT TOO!
Even if you don't want to write a new command, or update something, there are other ways to contribute!

Think a little more documentation could be helpful? Or think you can make some of the documentation that already exists better? Writing docs is a huge help and counts as a contribution!  

You could help someone test a command they are working on. This offers them to make sure that their code works on different environments, as well as use the command in different way to see if there are any bugs.

Also, if you find a bug, just reporting it in the Issues tab within the repo is contributing! But if you have a few extra minutes, it couldnt hurt to do a little debugging to provide as much information as possible. Doing this helps whoever decides to implement a fix by saving them time identifying when the issue occurs, or what might be causing it.
