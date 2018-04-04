import { createFilter } from 'rollup-pluginutils';
import {
  stat,
  mkdir,
  readFile,
  writeFile,
  createReadStream,
  createWriteStream,
} from 'fs';
import path from 'path';

const DEFAULT_INCLUDES = [
  '**/*.gltf',
];

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

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
    inlineAssetLimit = 75 * 1024,
    inline = false,
  } = opts;

  // Create a file filter
  const filter = createFilter(include, exclude);

  // Store for files that need to be copied over.
  const additionalFiles = {};
  const transformedModels = {};

  // The base directory for the bundle.
  let basedir = '';

  return {
    name: 'gltf',

    options(opts) {
      // Cache the base directory.
      basedir = path.dirname(opts.input);
    },

    load(id) {
      // Early out if the file is not relevant
      if (id.slice(-5) !== '.gltf' || !filter(id)) {
        return null;
      }

      // Create an array to hold the files that need to be copied
      const basepath = path.relative(basedir, id);
      additionalFiles[basepath] = [];

      // Read the file contents
      return promisify(readFile, id)
        // Read the gltf file and get the stats of each embedded asset.
        .then((buffer) => {
          // Copy the asset
          const model = Object.assign({}, JSON.parse(buffer.toString()));

          // Copy any buffers over. If a buffer is already base64 encoded there
          // isn't anything additional for us to do...
          const buffers = model.buffers.filter((buffer) =>
            buffer.uri.slice(-4) === '.bin'
          );
          additionalFiles[basepath] = additionalFiles[basepath].concat(
            buffers.map((buffer) => path.join(id, '../', buffer.uri)
          ));

          // Get all of the asset files sizes so we can determine whether or not
          // they should be inlined or just copied over.
          const imageStats = model.images.map((asset) =>
            getFileStats(path.join(id, '../', asset.uri))
          );

          return Promise.all([model, ...imageStats]);
        })
        // Transform the model, inlining any assets over the asset size limit.
        .then(([model, ...images]) => {
          // Create a copy of the images array with the paths updated.
          model.images = model.images.map((image, i) => {
            // If the file is over the asset limit, flag it for copying.
            if (images[i].stats.size > inlineAssetLimit) {
              additionalFiles[basepath].push(images[i].file);
              return image; // Return the original model, nothing to do.
            }

            // Create a copy of the image model with the base64 encoded image
            // instead of an asset uri path.
            const mimetype = MIME_TYPES[path.extname(images[i].file)];
            const data = images[i].buffer.toString('base64');
            return Object.assign({}, image, {
              uri: `data:${mimetype};base64,${data}`,
            });
          });

          return model;
        })
        // Return a string representing what will be provided to the javascript.
        .then((model) => {
          transformedModels[basepath] = JSON.stringify(model, null, '  ');
          if (inline) {
            // @todo: this is not adding the correct directory prefix to assets
            return `export default '${JSON.stringify(model)}';`;
          }
          return `export default '${basepath}';`;
        })
        .catch((e) => console.warn('There was an error.', e));
    },

    onwrite(options) {
      const outputDir = path.dirname(options.file);
      const files = Object.keys(additionalFiles);

      const copies = files.map((file) => new Promise((resolve, reject) => {
        // Copy all associated assets
        const assets = additionalFiles[file].map((asset) => {
          const output = path.join(outputDir, path.relative(basedir, asset));
          return ensureFolderExists(output)
            .then(() => copyFile(asset, output))
            .catch((err) => console.error(
              'There was an error copying an asset :(', err
            ));
        });

        // Write the transformed gltf file if we are not inlining it
        let modelCopy = null;
        if (!inline) {
          const targetFile = path.resolve(path.join(outputDir, file));
          const model = transformedModels[file];
          modelCopy = ensureFolderExists(targetFile)
            .then(() => promisify(writeFile, targetFile, model, 'utf8'))
            .catch((err) => console.error(
              'There was an error writing the transformed model :(', err
            ));
        }

        Promise.all([modelCopy, ...assets])
          .then(() => resolve())
          .catch(() => reject());
      }));

      return Promise.all(copies);
    },
  };
}

/**
 * Copies a given file to the target destination.
 * @param {string} file The path to the file.
 * @param {string} destination The path to copy the file to.
 * @return {Promise<void>} A promise.
 */
function copyFile(file, destination) {
  return new Promise((resolve, reject) => {
    const read = createReadStream(file);
    read.on('error', reject);
    const write = createWriteStream(destination);
    write.on('error', reject);
    write.on('close', resolve);
    read.pipe(write);
  });
}

/**
 * Gets the stats for a given file.
 * @param {string} file The path to the file.
 * @return {Promise<Object>} A promise resolving to the stats and file.
 */
function getFileStats(file) {
  return Promise.all([
    promisify(stat, file),
    promisify(readFile, file),
  ]).then(([stats, buffer]) => ({ stats, buffer, file }));
}

/**
 * Recursively makes directories until the given directory exists.
 * @todo: This is throwing an error on nested directories:
 *  Error: EISDIR: illegal operation on a directory, open 'output/assets'
 * @param {any} file The file or directory to check.
 * @return {Promise<string>} A promise resolving to the created directory.
 */
function ensureFolderExists(file) {
  return new Promise((resolve, reject) => {
    let p = file;
    if (path.extname(p) !== '') {
      p = path.dirname(file);
    }

    promisify(mkdir, p)
      .then(() => resolve(p))
      .catch((err) => {
        if (err.code === 'ENOENT') {
          resolve(ensureFolderExists(path.dirname(p)));
        }

        return promisify(stat, p)
          .then((stats) => {
            if (stats.isDirectory()) {
              resolve(p);
            }
            reject(err);
          })
          .catch((e) => reject(err));
      });
  });
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
