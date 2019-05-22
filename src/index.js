import { createFilter } from "rollup-pluginutils";
import {
  stat,
  mkdir,
  readFile,
  writeFile,
  createReadStream,
  createWriteStream,
} from "fs";
import path from "path";

const DEFAULT_INCLUDES = ["**/*.gltf"];

const MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
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
  let basedir = "";

  // If a buffer is already base64 encoded there isn't anything additional for us to do...
  function getBuffers(model, id, basepath) {
    return model.buffers.map(buffer => {
      if (buffer.uri.slice(-4) !== ".bin") {
        return buffer;
      }

      additionalFiles[basepath].push(path.join(id, "../", buffer.uri));

      // Update the model to use the path of the copied asset.
      if (inline) {
        return Object.assign({}, buffer, {
          uri: path.posix.join(path.dirname(basepath), buffer.uri),
        });
      }
      return buffer;
    });
  }

  function getImages(model, stats, basepath) {
    return model.images.map((image, i) => {
      if (image === null) {
        return;
      }

      // If the file is over the asset limit, flag it for copying.
      if (stats[i].stats.size > inlineAssetLimit) {
        additionalFiles[basepath].push(stats[i].file);
        if (inline) {
          return Object.assign({}, image, {
            uri: path.posix.join(path.dirname(basepath), image.uri),
          });
        }
        return image; // Return the original model, nothing to do.
      }

      // Create a copy of the image model with the base64 encoded image
      // instead of an asset uri path.
      const mimetype = MIME_TYPES[path.extname(stats[i].file)];
      const data = stats[i].buffer.toString("base64");
      return Object.assign({}, image, {
        uri: `data:${mimetype};base64,${data}`,
      });
    });
  }

  return {
    name: "gltf",

    options(opts) {
      // Cache the base directory.
      basedir = path.dirname(opts.input);
    },

    async load(id) {
      // Early out if the file is not relevant
      if (id.slice(-5) !== ".gltf" || !filter(id)) {
        return null;
      }

      // Create an array to hold the files that need to be copied
      const basepath = path.relative(basedir, id);
      const normalizedPath = basepath.split(path.sep).join(path.posix.sep);
      additionalFiles[basepath] = [];

      try {
        // Read the file contents
        // Read the gltf file and get the stats of each embedded asset.
        const buffer = await promisify(readFile, id);

        // Copy the asset, adding empty arrays to anything not there
        const model = Object.assign(
          {
            images: [],
          },
          JSON.parse(buffer.toString())
        );

        // Get all of the asset files sizes so we can determine whether or not
        // they should be inlined or just copied over.
        const imageStats = await Promise.all(
          model.images.map(
            async asset => await getFileStats(path.join(id, "../", asset.uri))
          )
        );

        // Copy any buffers over.
        model.buffers = getBuffers(model, id, basepath);

        // Create a copy of the images array with the paths updated.
        model.images = getImages(model, imageStats, basepath);

        // Stringify the model into the transformed models store.
        transformedModels[basepath] = JSON.stringify(model, null, "  ");

        // Return the entire model if we are inlined
        if (inline) {
          return `export default '${JSON.stringify(model)}';`;
        }

        // Otherwise, return the path.
        return `export default '${normalizedPath}';`;
      } catch (e) {
        console.warn("[GLTF Plugin] There was an error.", e);
      }
    },

    generateBundle(options) {
      const outputDir = path.dirname(options.file);
      const files = Object.keys(additionalFiles);

      const copies = files.map(
        file =>
          new Promise((resolve, reject) => {
            // Copy all associated assets
            const assets = additionalFiles[file].map(asset => {
              const output = path.join(
                outputDir,
                path.relative(basedir, asset)
              );
              return ensureFolderExists(output)
                .then(() => copyFile(asset, output))
                .catch(err =>
                  console.error("There was an error copying an asset :(", err)
                );
            });

            // Write the transformed gltf file if we are not inlining it
            let modelCopy = null;
            if (!inline) {
              const targetFile = path.resolve(path.join(outputDir, file));
              const model = transformedModels[file];
              modelCopy = ensureFolderExists(targetFile)
                .then(() => promisify(writeFile, targetFile, model, "utf8"))
                .catch(err =>
                  console.error(
                    "There was an error writing the transformed model :(",
                    err
                  )
                );
            }

            Promise.all([modelCopy, ...assets])
              .then(() => resolve())
              .catch(() => reject());
          })
      );

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
    read.on("error", reject);
    const write = createWriteStream(destination);
    write.on("error", reject);
    write.on("close", resolve);
    read.pipe(write);
  });
}

/**
 * Gets the stats for a given file.
 * @param {string} file The path to the file.
 * @return {Promise<Object>} A promise resolving to the stats and file.
 */
function getFileStats(file) {
  return Promise.all([promisify(stat, file), promisify(readFile, file)]).then(
    ([stats, buffer]) => ({ stats, buffer, file })
  );
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
    if (path.extname(p) !== "") {
      p = path.dirname(file);
    }

    promisify(mkdir, p)
      .then(() => resolve(p))
      .catch(err => {
        if (err.code === "ENOENT") {
          resolve(ensureFolderExists(path.dirname(p)));
        }

        return promisify(stat, p)
          .then(stats => {
            if (stats.isDirectory()) {
              resolve(p);
            }
            reject(err);
          })
          .catch(e => reject(e));
      });
  });
}

/**
 * Promisify's a function.
 * @param {Function} fn The function to turn into a promise.
 * @param {any[]} args The arguments for the function.
 * @return {Promise} A Promise for the function.
 */
function promisify(fn, ...args) {
  //eslint-disable-line
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
