import { rollup } from 'rollup';
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
  it('should be true', function(done) {
    console.log('inside should be true');
    build(models.embeddedBinary, {})
      .then(() => done());
  });
});



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
