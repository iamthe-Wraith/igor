import { getFormattedDate } from './date';

/**
 * updates a file's contents by replacing
 * instances of template variables with
 * customized content
 *
 * @param {string} contents - the file contents
 * to be updated.
 *
 * @param {Object} ctx - the context object of
 * the command. this is where the customized
 * content will be found.
 *
 * @returns {string} - the updated contents
 */
export const parseTemplateVariables = (contents, ctx) => {
  /** all registered template variables */
  const TEMPLATE_VARIABLES = [
    // will replace 'replaceclientname' (have seen in webpack config files)
    // update occurs in init command
    ['clientName', ctx?.testData?.client?.name || ''],

    // will replace 'replacedatecreated' (have seen in package.json)
    // init command overrides this with a new custom object...need to update.
    ['dateCreated', getFormattedDate()],

    // update occurs in createmoudle command
    ['moduleEntryMethodName', ctx?.arguments?.arguments?.entryMethodName || 'init'],

    // update occurs in createmoudle command
    ['moduleName', ctx?.arguments?.parameters?.name || ''],

    ['statefulImport', ctx?.arguments?.flags?.stateful ? 'import State from \'bbmodules/State\';' : ''],

    ['statefulInit', ctx?.arguments?.flags?.stateful ? 'export const initState = (newState, lastState) => {};' : ''],

    ['statefulInitCall', ctx?.arguments?.flags?.stateful ? 'initState();' : ''],

    // will replace 'replacetestname' (have seen in README.md, package.json and BB.client.test.config.js)
    // update occurs in init command
    ['testName', ctx?.repo?.name || ''],

    // update package.json to use this instead of defaulting to john
    ['username', ctx?.config?.github?.username || ''],
  ];

  let _contents = contents;

  TEMPLATE_VARIABLES.forEach(tv => {
    _contents = _contents.split(`{{tv[0]}}`).join(tv[1]);
  });

  return _contents;
};
