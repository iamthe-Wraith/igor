import fs from 'fs';
import path from 'path';

import { parseTemplateVariables } from '../utils/template-variables';

/**
 * object that houses the template contents
 *
 * @typedef {Object} TemplateContents
 * @property {string} js - the contents of the .js template file
 * @property {string} scss - the contents of the .scss template file
 */

/**
 * object the houses template file paths
 *
 * @typedef {Object} TemplateFiles
 * @property {string} js - the path to the .js template file
 * @property {string} scss - the path to the .scss template file
 */

/**
 * executes the full process of building
 * a new variation.
 *
 * @param {string} name - the name of the varation
 * to be built
 *
 * @param {string} template - the name of the
 * template to be used to build the variation
 * files.
 */
export const build = (name, ctx) => {
  const { template } = ctx;

  if (name && template) {
    const templateFiles = getTemplateFiles(template);
    const templateContents = getTemplatesContents(templateFiles, { ...ctx, variantName: name });
    buildVariation(name, templateContents);
  } else if (!name) {
    throw new Error(`utils:variation:build error\n\nno variation name found`);
  } else {
    throw new Error(`utils:variation:build error\n\nno template name found`);
  }
};

/**
 * builds the variant directory in the current
 * working directory, as well as the variant
 * files within the new directory.
 *
 * @param {string} name - the name of the
 * variant to be created
 *
 * @param {TemplateContents} variantContents -
 * the contents to be added to each variant test file.
 *
 * @param {string} [destination] - the absolute
 * path to where the variant should be created.
 * defaults to the current working directory
 */
export const buildVariation = (name, variantContents, destination = process.cwd()) => {
  let errorMessage = null;

  if (name && variantContents && 'js' in variantContents && 'scss' in variantContents) {
    // build the variant directory
    try {
      fs.mkdirSync(path.resolve(destination, name));
    } catch (err) {
      errorMessage = `utils:variation:buildVariation error\n\nerror creating variant directory\n\n${err.message}`;
    }

    if (errorMessage === null) {
      // create the variant files
      try {
        fs.writeFileSync(path.resolve(destination, name, `${name}.js`), variantContents.js);
        fs.writeFileSync(path.resolve(destination, name, `${name}.scss`), variantContents.scss);
      } catch (err) {
        errorMessage = `utils:variation:buildVariation error\n\nerror creating variant files\n\n${err.message}`;
      }
    }
  } else if (!name) {
    errorMessage = `utils:variation:buildVariation error\n\nno variant name found`;
  } else if (!variantContents) {
    errorMessage = `utils:variation:buildVariation error\n\nno variant contents found`;
  } else if (!('js' in variantContents)) {
    errorMessage = `utils:variation:buildVariation error\n\nno .js file contents found`;
  } else {
    errorMessage = `utils:variation:buildVariation error\n\nno .scss file contents found`;
  }

  if (errorMessage !== null) {
    throw new Error(errorMessage);
  }
};

/**
 * reads the client's templates directory to
 * retrieve all available template options.
 *
 * @returns {string[]} - array of template names
 * found inside client /templates
 */
export const getAvailableTemplates = () => {
  const templatePath = path.resolve(process.cwd(), 'templates');

  if (fs.existsSync(templatePath)) {
    try {
      const templates = fs.readdirSync(templatePath);

      if (templates.length > 0) {
        return templates;
      } else {
        throw new Error(`utils:variation:getAvailableTemplates error\n\nno templates found in ${templatePath}`);
      }
    } catch (err) {
      throw new Error(`utils:variation:getAvailableTemplates error\n\n${err.message}`);
    }
  } else {
    throw new Error(`utils:variation:getAvailableTemplates error\n\n${templatePath} not found`);
  }
};

/**
 * retrieves the contents of the template files
 *
 * @param {TemplateFiles} files - object that
 * contains the paths for the template files
 *
 * @param (Object) variables - key/valye pairs
 * the represent template variables and the values
 * they should be replaced with inside the tempalte
 * contents.
 *
 * @return {TemplateContents} - returns once
 * file contents have been retrieved and all
 * template variables have been replaced
 * successfully
 */
export const getTemplatesContents = (files, ctx) => {
  const {
    js = null,
    scss = null
  } = files;

  let jscontents = null;
  let scsscontents = null;
  let errorMessage = null;

  if (js !== null && scss !== null) {
    try {
      jscontents = fs.readFileSync(js, 'utf8');
      scsscontents = fs.readFileSync(scss, 'utf8');
    } catch (err) {
      errorMessage = `utils:variation:getTemplatesContents error\n\nerror reading contents\n${err.message}`;
    }
  } else if (js === null) {
    errorMessage = `utils:variation:getTemplatesContents error\n\nno .js file path found`;
  } else {
    errorMessage = `utils:variation:getTemplatesContents error\n\nno .scss file path found`;
  }

  if (jscontents !== null && scsscontents !== null && errorMessage === null) {
    // jscontents = replaceTemplateVariables(jscontents, variables);
    jscontents = parseTemplateVariables(jscontents, ctx);
    // scsscontents = replaceTemplateVariables(scsscontents, variables);
    scsscontents = parseTemplateVariables(scsscontents, ctx);

    return {
      js: jscontents,
      scss: scsscontents
    };
  } else if (errorMessage !== null) {
    throw new Error(errorMessage);
  } else {
    throw new Error(`utils:variation:getTeplatesContents error\n\nuh oh...something broke...no idea what, but something definitely broke...`);
  }
};

/**
 * retrieves the template files from the specified
 * template. will confirm that a single .js file
 * and a single .scss file exists.
 *
 * @param {string} template - the name of the template
 * to retrieve the template files from.
 *
 * @returns {TemplateFiles} - returns once has been
 * verified that only 1x .js file and 1x .scss file
 * have been found in the template directory.
 */
export const getTemplateFiles = template => {
  const templatePath = path.resolve(process.cwd(), 'templates', template);
  const jsregex = /.js$/g;
  const scssregex = /.scss$/g;
  let jsFile = null;
  let scssFile = null;
  let errorMessage = null;

  if (fs.existsSync(templatePath)) {
    const templateFiles = fs.readdirSync(templatePath);

    if (templateFiles.length >= 2) {
      templateFiles.forEach(file => {
        if (jsregex.test(file)) {
          if (jsFile === null) {
            jsFile = path.resolve(templatePath, file);
          } else {
            errorMessage = `utils:variation:getTemplateFile error\n\ninvalid template files found in directory: ${templatePath}.\n\nexpected 1x .js file and 1x .scss file, but found multiple .js files\n\nplease confirm only 1x .js file, and 1x .scss file exists in ${path.resolve(process.cwd(), 'templates', template)} and try again.\n\nplease also request an admin to delete the repo that was just created.`;
          }
        } else if (scssregex.test(file)) {
          if (scssFile === null) {
            scssFile = path.resolve(templatePath, file);
          } else {
            errorMessage = `addvariation:buildVariation error\n\ninvalid template files found in directory: ${path.resolve(process.cwd(), 'templates', template)}.\n\nexpected 1x .js file and 1x .scss file, but found multiple .scss files\n\nplease confirm only 1x .js file, and 1x .scss file exists in ${path.resolve(process.cwd(), 'templates', template)} and try again.\n\nplease also request an admin to delete the repo that was just created.`;
          }
        }
      });
    } else {
      errorMessage = `utils:variation:getTemplateFiles error\n\nexpected 2 templates files, 1x .js file, 1x .scss file, but found ${templateFiles.length} template files`;
    }

    if (jsFile !== null && scssFile !== null && errorMessage === null) {
      return {
        js: jsFile,
        scss: scssFile
      };
    } else if (errorMessage !== null) {
      throw new Error(errorMessage);
    } else {
      throw new Error(`utils:variation:getTemplateFiles error\n\nummmm...something bad happened, but I'm not really sure what...`);
    }
  } else {
    throw new Error(`utils:variation:getTemplateFiles error\n\n${templatePath} not found`);
  }
};

/**
 * looks over a provided string, and replaces any
 * template variables found with other contents.
 * template variables to be searched for are the
 * keys found in templateVariables (see object at
 * top of this file) and/or keys found in variables
 * param. these template variables are replaced
 * with the corresponding value of the key.
 *
 * @param {string} contents - the string to be
 * updated
 *
 * @param {Object} [variables] - additional key/value
 * pairs not already included in the templateVariables
 * object found at the top of this file. these are
 * usually passed in because they are dynamic.
 *
 * @return {string} - the updated content.
 */
export const replaceTemplateVariables = (content, variables = {}) => {
  let _content = typeof content === 'string' ? content : null;
  const _variables = { ...templateVariables, ...variables };

  if (_content === null) {
    throw new Error(`utils:variation:replaceTemplateVariables error\n\nno content received`);
  } else {
    const keys = Object.keys(_variables);

    if (keys.length) {
      keys.forEach(key => {
        while (_content.indexOf(key) > -1) {
          _content = _content.replace(key, _variables[key]);
        }
      });
    }

    return _content;
  }
};
