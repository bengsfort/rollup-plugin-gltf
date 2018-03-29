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
  const additionalFiles = {};
  // @todo: path.join will work just fine with extensions.
  // ie: path.join(id, '../', uri);
  return {
    name: 'gltf',
    load(id) {
      if (id.slice(-5) !== '.gltf' || !filter(id)) {
        return null;
      }
      return Promise.all([
        promisify(stat, id), // Get the stats of the file
        promisify(readFile, id), // Read the files contents
      ]).then(([fileStats, buffer]) => {
        const model = Object.assign({}, JSON.parse(buffer.toString()));

        additionalFiles[id] = [];

        // Copy any buffers over
        for (let i = 0; i < model.buffers.length; i++) {
          if (model.buffers[i].uri.slice(-4) !== '.bin') {
            additionalFiles[id].push(model.buffers[i].uri);
          }
        }

        for (let i = 0; i < model.images.length; i++) {
          additionalFiles[id].push(model.images[i].uri);
        }

        if (fileStats.size > inlineAssetLimit) {
          //  Copy the file
          console.log('\tFile is bigger than inline limit, copy the file.');
        } else {
          // Inline the file
          console.log('\tFile is smaller than the limit, embed the file.');
        }
      });
    },
    // transform(json, id) {
    //   if (id.slice(-5) !== '.gltf' || !filter(id)) {
    //     return null;
    //   }
    //   console.log('json in transform ~~', json);
    // },
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
