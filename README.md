# rollup-plugin-gltf

![build status](https://api.travis-ci.org/bengsfort/rollup-plugin-gltf.svg?branch=master) [![npm version](https://badge.fury.io/js/rollup-plugin-gltf.svg)](https://www.npmjs.com/package/rollup-plugin-gltf)

Rollup plugin for embedding or copying glTF models into your bundles.

## Installation

```shell
npm install --save-dev rollup-plugin-gltf
```

## Usage

```js
// rollup.config.js
import gltf from 'rollup-plugin-gltf';

export default {
  entry: 'src/index.js',
  dest: 'dist/js/bundle.js',
  plugins: [
    gltf({
      include: '**/*.gltf',
	  exclude: 'artwork/*.gltf',
	  inlineAssetLimit: 250 * 1000, // 250kb
	  inline: false,
    }),
  ],
};
```
The importer will read through the `gltf` file and copy over / embed any assets within the file, then expose the file to JS as either a json object or uri.

```js
// three.js usecase example
import chestModel from './assets/chest.gltf';

const loader = new GLTFLoader();

// If `options.inline` is true
loader.parse(chestModel, function(gltf) {
	scene.add(gltf.scene);
});

// If `options.inline` is false
loader.load(chestModel, function(gltf) {
	scene.add(gltf.scene);
});
```

### Options

- `include`: **(optional)** The glob for file patterns that should be included.
- `exclude`: **(optional)** The glob for file patterns that should be excluded.
- `inlineAssetLimit`: **(optional)** The size (in bytes) at which to copy asset files over rather than embed them into the gltf file. Defaults to 75000 (75kb).
- `inline`: Boolean 

## License

MIT