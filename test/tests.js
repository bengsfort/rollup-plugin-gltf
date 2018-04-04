import { rollup } from 'rollup';
import { stat } from 'fs';
import rimraf from 'rimraf';
import { expect } from 'chai';

import gltf from '../dist/rollup-plugin-gltf.module'

const output = 'output/bundle.js';
const models = {
  embeddedBinary: './fixtures/import-embedded-buffer.js',
  externalBinary: './fixtures/import-external-buffer.js',
};

// Change working directory to current
process.chdir(__dirname);

describe('rollup-plugin-gltf', function() {
  beforeEach(() => promisify(rimraf, 'output/'));

  it('should copy the gltf file to the output directory', function(done) {
    build(models.externalBinary, {
      inline: false,
      inlineAssetLimit: 1, // copy over EVERYTHING
    })
      .then(() => getFileStats(
        'output/assets/buffer.bin',
        'output/assets/TreasureChest_diffuse.png',
        'output/assets/TreasureChest_external_buffer.gltf'
      ))
      .then(() => done());
  });
});

// Turn a normal callback async function into a promise.
function promisify(fn, ...args) {
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

function getFileStats(...files) {
  const slice = Array.from(files);
  return Promise.all(slice.map((file) =>
    promisify(stat, file).then(() => true, () => false)
  ));
}

// Asserts that a file does or does not exist.
function getFile(file, shouldExist = true) {
  return promisify(stat, file)
    .then(() => true, () => false)
    .then((exists) => expect(exists).to.be.true);
}

// Run the rollup build with an plugin configuration.
function build(model, config) {
  return rollup({
    input: model,
    plugins: [
      gltf(config),
    ],
  }).then(bundle => bundle.write({
    file: output,
    format: 'iife',
    name: 'test',
  }));
}