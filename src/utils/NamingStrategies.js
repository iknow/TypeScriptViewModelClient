/**
 * @param {string} str
 * @returns {string}
 */
export const CAMEL_CASE_TO_UNDERSCORE = (str) =>
  str.replace(/[A-Z0-9]/g, (m) => `_${m[0].toLowerCase()}`);

/**
 * @param {string} str
 * @return {string}
 */
export const IDENTITY = (str) => str;

// eslint-disable-next-line @typescript-eslint/naming-convention
export default { CAMEL_CASE_TO_UNDERSCORE, IDENTITY };

