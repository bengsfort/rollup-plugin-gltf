import { createFilter } from 'rollup-pluginutils';
import { stat, readFile } from 'fs';

const DEFAULT_INCLUDES = [
  '**/*.gltf',
];

/**
 * Rollup plugin for importing gltf models as modules.
 * @export
 * @param {Object} opts The options object.
 * @param {String[]} opts.include The glob for files that should be included.
 * @param {String[]} opts.exclude The glob for files that should be excluded.
 * @param {Number} opts.inlineAssetLimit The size (in bytes) to copy assets.
 * @param {Boolean} opts.inline Boolean to expose gltf files as json.
 * @return {Object} A rollup plugin.
 */
export default function gltf(opts = {}) {
  const {
    include = DEFAULT_INCLUDES,
    exclude,
    inlineAssetLimit = 75 * 1024, //eslint-disable-line
    inline = false, //eslint-disable-line
  } = opts;
  const filter = createFilter(include, exclude);

  return {
    name: 'gltf',
    load(id) {
      if (!filter(id)) {
        return null;
      }
      return Promise.all([
        promisify(stat, id), // Get the stats of the file
        promisify(readFile, id), // Read the files contents
      ]).then(([fileStats, buffer]) => {
        console.log(fileStats);
      });
    },
  };
}

/**
 * Promisify's a function.
 * @param {Function} fn The function to turn into a promise.
 * @param {any[]} args The arguments for the function.
 * @return {Promise} A Promise for the function.
 */
function promisify(fn, ...args) { //eslint-disable-line
  return new Promise((resolve, reject) => {
    try {
      fn(...args, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    } catch (e) {
      reject(e);
    }
  });
}
