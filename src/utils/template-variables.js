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
    ['clientName', ctx?.testData?.client?.name || ''],
    ['dateCreated', getFormattedDate()],
    ['moduleEntryMethodName', ctx?.arguments?.arguments?.entryMethodName || 'init'],
    ['moduleName', ctx?.arguments?.parameters?.name || ''],
    ['numVariations', ctx?.testData?.variations || ''],
    ['statefulImport', ctx?.arguments?.flags?.stateful ? 'import State from \'bbmodules/State\';' : ''],
    ['statefulInit', ctx?.arguments?.flags?.stateful ? '\nexport const initState = (newState, lastState) => {};\n' : ''],
    ['statefulInitCall', ctx?.arguments?.flags?.stateful ? 'initState();\n' : ''],
    ['testName', ctx?.repo?.name || ''],
    ['username', ctx?.config?.github?.username || ''],
    ['variantName', ctx?.variantName || ''],
  ];

  let _contents = contents;

  TEMPLATE_VARIABLES.forEach(tv => {
    if (
      (tv[0] === 'statefulImport' && tv[1] === '') ||
      (tv[0] === 'statefulInit' && tv[1] === '') ||
      (tv[0] === 'statefulInitCall' && tv[1] === '')
    ) {
      _contents = _contents.split(`{{${tv[0]}}}\n`).join(`${tv[1]}`);
    } else {
      _contents = _contents.split(`{{${tv[0]}}}`).join(`${tv[1]}`);
    }
  });

  return _contents;
};
