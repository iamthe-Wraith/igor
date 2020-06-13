import path from 'path';
import fs from 'fs';

import Command from './Command';
import { Logger } from '../../lib/logger';
import FatalError from '../../lib/error/fatal-error';
import { parseTemplateVariables } from '../utils/template-variables';

const testRepoNamePattern = /_\d{4}-\d{2}-\d{2}/;
const testModuleTemplatesDir = path.join('modules', '__templates');

/**
 * creates the module directory that will
 * house all the module's files within /modules.
 *
 * @param {Object} ctx - the context
 *
 * @return {string} - the absolute path to the
 * new module directory.
 */
const createModuleDirectory = ctx => {
  try {
    const modulePath = path.resolve('.', 'modules', ctx.arguments.parameters.name);

    fs.mkdirSync(modulePath);

    return modulePath;
  } catch (err) {
    err.message = `createmodule:createModuleDirectory error - ${err.message}`;
    throw err;
  }
};

/**
 * creates the .js file for the module and
 * populates it with the template content.
 *
 * @param {Object} ctx - the context
 */
const createModuleJS = ctx => {
  const filePath = path.resolve(ctx.module.templatePath, `${ctx.arguments.parameters.template}.template.js`);

  if (fs.existsSync(filePath)) {
    try {
      let template = fs.readFileSync(filePath, 'utf8');

      template = parseTemplateVariables(template, ctx);
      template = `${renderHeaderComment(ctx)}\n\n${template}`;

      fs.writeFileSync(path.resolve(ctx.module.path, 'index.js'), template);

      return true;
    } catch (err) {
      err.message = `createmodule:createModuleJS error - ${err.message}`;
      throw err;
    }
  } else {
    Logger.gen('no .js template file found');
    return false;
  }
};

/**
 * creates the .scss file for the module and
 * populates it with the template content.
 *
 * @param {Object} ctx - the context
 */
const createModuleSCSS = ctx => {
  const filePath = path.resolve(ctx.module.templatePath, `${ctx.arguments.parameters.template}.template.scss`);

  if (fs.existsSync(filePath)) {
    try {
      let template = fs.readFileSync(filePath, 'utf8');

      template = parseTemplateVariables(template, ctx);
      template = `${renderHeaderComment(ctx, true, true)}\n\n${template}`;

      fs.writeFileSync(path.resolve(ctx.module.path, 'styles.scss'), template);

      return true;
    } catch (err) {
      err.message = `createmodule:createModuleSCSS error - ${err.message}`;
      throw err;
    }
  } else {
    Logger.gen('no .scss template file found');
    return false;
  }
};

/**
 * creates a comment to be added to the top
 * of the module files
 *
 * @param {Object} ctx - the context
 *
 * @param {boolean} preventDescription -
 * a flag that will prevent a description
 * from being added to the comment, even if
 * one has been provided.
 *
 * @return {string} - the new comment (includes
 * formatting)
 */
const renderHeaderComment = (ctx, preventDescription, preventModule) => {
  try {
    return `/**${!preventDescription && ctx.arguments.arguments.description ? `
 * ${ctx.arguments.arguments.description}
 *`
   : ''}
 * @author {@link https://github.com/${ctx.config.github.username}}
 ${!preventModule ? `* @module ${ctx.arguments.parameters.name}
 */` : '*/'}`;
  } catch (err) {
    err.message = `createmodule:renderHeaderComment error - ${err.message}`;
    throw err;
  }
};

/**
 * instantiate the Command object and pass in the parameter
 * pattern
 */
const createModuleCommand = new Command({
  pattern: '<createmodule> <name> <template>',
  docs: `
  is a code generator that handles automating the creation of new modules in a tests from user created templates.

  
  [!] IMPORTANT - to execute this command, you must be in root of a test directory, and at least one of the following must be true:
    
    1. a /__templates directory can be found in your test's /modules directory, and at least one template has been set up inside it (see below for instruction on how to set up a module template). (command will look for templates in this location first)
    
    2. you have configured your local machine to house your own module templates (see below for instructions on how to configure your own local module templates). (command will only look here if no template was found within the test directory)

 
  ----------------------------------------
    TO CONFIGURE LOCAL MODULE TEMPLATES:
  ----------------------------------------
  - open your .igorrc file in your editor of choice (you can find your .igorrc file in your home directory (note, this is a dot file, so it may be hidden if you have not configured your environment to show hidden files))
  - add a new "moduleTemplates" property to the configuration object
  - enter the ABSOLUTE PATH to the directory you want to use to house your module templates
    - example:
    -------------------------------------------------
    {
      ...
      "moduleTemplate": "/Users/jdoe/moduleTemplates"
    }
    -------------------------------------------------
  - save .igorrc
  - if the directory specified in your "moduleTemplates" property does not already exist, go ahead and create it
  - inside the directory that "moduleTemplates" refers to, create at least one module template (see below for instructions on how to do this)


  ------------------------------------
    TO SET UP A NEW MODULE TEMPLATE:
  ------------------------------------
  - create a new directory where your modules are stored (see above for more information)
    - the name of this directory will be how this command refers to the template, so it must be descriptive and unique.
  - inside this new directory, create at least one template file
    - templates only support .js and .scss files, and at least one of these file types must be found


  ----------------------------
    TEMPLATE FILE STRUCTURE:
  ----------------------------
    [module templates location]
      |
      |- moduleName
          |
          |- moduleName.template.js
          |- moduleName.template.scss




  `
});

/**
 * register all arguments, parameters, and flags
 */
createModuleCommand
  .parameter('name', {
    type: 'string',
    description: 'the name of the module to be created (case sensitive)'
  })
  .parameter('template', {
    type: 'string',
    description: 'the name of the template to be used to generate the new module. must match the name of a directory found inside either the test\'s modules/__templates directory, or the end point set with `moduleTemplates` within your .igorrc file'
  })
  .argument('description|d', {
    type: 'string',
    description: 'brief description of what the module does'
  })
  .argument('entryMethodName|e', {
    type: 'string',
    description: 'the name to give the main entry method (the initial method that will be exported) for the module. if not provided, method name will default  to "init"'
  })
  .flag('stateful|s', {
    description: 'if provided AND any of the stateful template variables have been added to the template, will make the module stateful. if not provided, will simply remove any stateful template variables found in the template.'
  });

/**
 * confirms if user is in the root of a test dir. if
 * so, checks if a module template with the name entered
 * in command is found, and that valid template files
 * have been added to it
 *
 * @param {Object} - the context
 *
 * @returns {Promise<Object>} - resolves with the context
 * once preparation is complete
 */
createModuleCommand.before = ctx => new Promise((resolve, reject) => {
  Logger.gen('initializing...');

  if (testRepoNamePattern.test(process.cwd())) {
    const testModuleTemplatesPath = path.join(process.cwd(), testModuleTemplatesDir);
    let templates = null;

    /*
     * check if modules dir exists
     *   check if there is a __templates dir in module dir
     *     check if there is a module with matching name
     * if no module found yet
     *   check if moduleTemplates found in config
     *     check if moduleTemplates location found
     *       check if module with matching name found in moduleTemplates location
     */

    // look for template inside test first
    if (fs.existsSync(testModuleTemplatesPath)) {
      try {
        templates = fs.readdirSync(testModuleTemplatesPath);

        if (templates.length !== 0 || templates.includes(ctx.arguments.parameters.template)) {
          ctx.module = {
            templatePath: path.join(testModuleTemplatesPath, ctx.arguments.parameters.template)
          };
        }
      } catch (err) {
        Logger.error(`[-] failed to read contents of directory: ${testModuleTemplatesPath}\n\n${err.message}`);
        templates = null;
      }
    }

    /*
     * if templates === null, module template was not
     * found in test...will now look if local module
     * templates destination has been configured locally
     */
    if (
      !('module' in ctx) &&
      'moduleTemplates' in ctx.config &&
      fs.existsSync(ctx.config.moduleTemplates)
    ) {
      try {
        templates = fs.readdirSync(ctx.config.moduleTemplates);

        if (templates.length !== 0 || templates.includes(ctx.arguments.parameters.template)) {
          ctx.module = {
            templatePath: path.join(ctx.config.moduleTemplates, ctx.arguments.parameters.template)
          };
        }
      } catch (err) {
        Logger.error(`[-] failed to read contents of directory: ${ctx.config.moduleTemplates}\n\n${err.message}`);
        templates = null;
      }
    }

    if ('module' in ctx) {
      // verify that template file(s) exist
      try {
        const templateFiles = fs.readdirSync(ctx.module.templatePath).filter(file => {
          return (file.includes('.template.js') || file.includes('.template.scss'));
        });

        if (templateFiles.length) {
          resolve(ctx);
        } else {
          reject(new FatalError(`[-] no template files found in ${ctx.module.templatePath}`));
        }
      } catch (err) {
        reject(new FatalError(`[-] failed to verify template files\n\n${err.message}`));
      }
    } else {
      reject(new FatalError(`[-] - no module templates found with name: ${ctx.arguments.parameters.template}`));
    }
  } else {
    reject(new FatalError('[-] - you must be in the root of a test directory to execute this command. traverse into a test directory and try again.'));
  }
});

/**
 * creates the new module
 *
 * @param {Object} - the context
 *
 * @returns {Promise<Object>} - resolves with the
 * context once the command has completed executing
 * successfully.
 */
createModuleCommand.main = ctx => new Promise((resolve, reject) => {
  ctx.module.path = createModuleDirectory(ctx);

  const jsCreated = createModuleJS(ctx);
  const scssCreated = createModuleSCSS(ctx);

  if (!jsCreated && !scssCreated) {
    reject(new FatalError('[-] failed to create module - no templates files added'));
  } else {
    resolve(ctx);
  }
});

/**
 * main entry point for command
 *
 * @param {Object} - the initial context
 *
 * @param {Promise<Object>} - resolves with the
 * context once the command has completed executing
 * successfully
 */
export const exec = ctx => {
  return createModuleCommand.execute(ctx)
    .then(ctx => {
      Logger.complete(`\n[+] ${ctx.arguments.parameters.name} created\n`);

      return ctx;
    })
    .catch(err => {
      Logger.error(`\n${err.message}\n`);

      if (err.isFatal) {
        process.exit(1);
      }
    });
};

export const help = () => {
  createModuleCommand.help();
};
