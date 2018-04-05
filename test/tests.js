import { rollup } from 'rollup';
import { stat, readFile } from 'fs';
import path from 'path';
import rimraf from 'rimraf';
import { expect } from 'chai';

import gltf from '../dist/rollup-plugin-gltf.module'

const output = 'output/bundle.js';
const TEXTURE_FILE = 'TreasureChest_diffuse.png';
const BUFFER_FILE = 'buffer.bin';

const TEXTURE_DATA_ATTR = 'data:image/png;base64';
const BUFFER_DATA_ATTR = 'data:application/octet-stream;base64';

const models = {
  embeddedBinary: './fixtures/import-embedded-buffer.js',
  externalBinary: './fixtures/import-external-buffer.js',
};
const modelOutput = {
  embeddedBinary: 'output/assets/TreasureChest_embedded_buffer.gltf',
  externalBinary: 'output/assets/TreasureChest_external_buffer.gltf',
};

// Change working directory to current
process.chdir(__dirname);

describe('rollup-plugin-gltf', function() {
  afterEach(() => promisify(rimraf, 'output/'));

  it('should copy the gltf file/assets to the output directory', function(done) {
    build(models.externalBinary, {
      inline: false,
      inlineAssetLimit: 1, // copy over EVERYTHING
    }).then(() => checkFilesExist(
      `output/assets/${BUFFER_FILE}`,
      `output/assets/${TEXTURE_FILE}`,
      modelOutput.externalBinary,
    )).then((exists) =>
      expect(exists).to.deep.equal([true, true, true])
    ).then(() => done(), () => done());
  });
  
  it('should only copy assets if inlined', function(done) {
    build(models.externalBinary, {
      inline: true,
      inlineAssetLimit: 1,
    }).then(() => checkFilesExist(
      `output/assets/${BUFFER_FILE}`,
      `output/assets/${TEXTURE_FILE}`,
      modelOutput.externalBinary,
    )).then((exists) =>
      expect(exists).to.deep.equal([true, true, false])
    ).then(() => done(), () => done());
  });

  describe('copied gltf', function() {
    it('should keep valid asset references', function(done) {
      build(models.externalBinary, {
        inline: false,
        inlineAssetLimit: 1,
      }).then(() =>
        getGltfFileOutput(modelOutput.externalBinary)
      ).then((gltf) => {
        // Make sure that the arrays are there
        expect(gltf).to.be.an('object').that.has.keys('asset', 'buffers', 'images');
        expect(gltf.buffers).to.be.an('array').with.lengthOf(1);
        expect(gltf.buffers[0].uri).to.equal(BUFFER_FILE);
        expect(gltf.images).to.be.an('array').with.lengthOf(1);
        expect(gltf.images[0].uri).to.equal(TEXTURE_FILE);
        
        // Make sure the files exist given their paths
        const basedir = path.dirname(modelOutput.externalBinary);
        return checkFilesExist(
          path.join(basedir, gltf.buffers[0].uri),
          path.join(basedir, gltf.images[0].uri)
        );
      }).then((exists) =>
        expect(exists).to.deep.equal([true, true])
      ).then(() => done(), () => done());
    });

    it('should inline assets when they are over the asset limit', function(done) {
      build(models.embeddedBinary, {
        inline: false,
        inlineAssetLimit: 900 * 1024,
      }).then(() =>
        getGltfFileOutput(modelOutput.embeddedBinary)
      ).then((gltf) => {
        // Make sure that the arrays are there
        expect(gltf).to.be.an('object').that.has.keys('asset', 'buffers', 'images');
        expect(gltf.buffers).to.be.an('array').with.lengthOf(1);
        expect(
          gltf.buffers[0].uri.slice(0, BUFFER_DATA_ATTR.length)
        ).to.equal(BUFFER_DATA_ATTR);
        expect(gltf.images).to.be.an('array').with.lengthOf(1);
        expect(
          gltf.images[0].uri.slice(0, TEXTURE_DATA_ATTR.length)
        ).to.equal(TEXTURE_DATA_ATTR);
        
        // Make sure the files dont exist given their paths
        const basedir = path.dirname(modelOutput.embeddedBinary);
        return checkFilesExist(
          path.join(basedir, BUFFER_FILE),
          path.join(basedir, TEXTURE_FILE)
        );
      }).then((exists) =>
        expect(exists).to.deep.equal([false, false])
      ).then(() => done(), () => done());
    });
  });

  describe('inlined gltf', function() {
    it('should keep valid asset references', function(done) {
      build(models.externalBinary, {
        inline: true,
        inlineAssetLimit: 1,
      }).then(() =>
        getGltfInlineOutput()
      ).then((gltf) => {
        // Make sure the arrays are there
        expect(gltf).to.be.an('object').that.has.keys('asset', 'buffers', 'images');
        expect(gltf.buffers).to.be.an('array').with.lengthOf(1);
        expect(gltf.buffers[0].uri).to.equal(BUFFER_FILE);
        expect(gltf.images).to.be.an('array').with.lengthOf(1);
        expect(gltf.images[0].uri).to.equal(TEXTURE_FILE);
  
        // Make sure the files exist given their paths
        const basedir = path.dirname(output);
        return checkFilesExist(
          path.join(basedir, gltf.buffers[0].uri),
          path.join(basedir, gltf.images[0].uri)
        );
      }).then((exists) =>
        expect(exists).to.deep.equal([true, true])
      ).then(() => done(), () => done());
    });

    it('should inline assets when they are over the asset limit', function(done) {
      build(models.embeddedBinary, {
        inline: true,
        inlineAssetLimit: 900 * 1024,
      }).then(() =>
        getGltfInlineOutput(modelOutput.embeddedBinary)
      ).then((gltf) => {
        // Make sure that the arrays are there
        expect(gltf).to.be.an('object').that.has.keys('asset', 'buffers', 'images');
        expect(gltf.buffers).to.be.an('array').with.lengthOf(1);
        expect(
          gltf.buffers[0].uri.slice(0, BUFFER_DATA_ATTR.length)
        ).to.equal(BUFFER_DATA_ATTR);
        expect(gltf.images).to.be.an('array').with.lengthOf(1);
        expect(
          gltf.images[0].uri.slice(0, TEXTURE_DATA_ATTR.length)
        ).to.equal(TEXTURE_DATA_ATTR);
        
        // Make sure the files dont exist given their paths
        const basedir = path.dirname(modelOutput.embeddedBinary);
        return checkFilesExist(
          path.join(basedir, BUFFER_FILE),
          path.join(basedir, TEXTURE_FILE)
        );
      }).then((exists) =>
        expect(exists).to.deep.equal([false, false])
      ).then(() => done(), () => done());
    });
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

// Gets a parsed JSON object representing the inlined gltf output.
function getGltfInlineOutput() {
  return promisify(readFile, 'output/bundle.js')
    .then((buffer) => buffer.toString('utf8'))
    .then((code) => {
      const intro = 'model = \'';
      const outro = '}\';';
      const json = code.slice(
        code.indexOf(intro) + intro.length,
        code.lastIndexOf(outro) + 1
      );
      return JSON.parse(json);
    });
}

// Gets a parsed JSON object representing the copied gltf output.
function getGltfFileOutput(file) {
  return promisify(readFile, file)
    .then((buffer) => buffer.toString('utf8'))
    .then((json) => JSON.parse(json));
}

// Checks whether or not the provided files exist.
function checkFilesExist(...files) {
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
