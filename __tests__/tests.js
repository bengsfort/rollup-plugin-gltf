import { rollup } from "rollup";
import os from "os";
import fs from "fs-extra";
import path from "path";

import gltf from "../src";

const TEXTURE_DATA_ATTR = "data:image/png;base64";
const BUFFER_DATA_ATTR = "data:application/octet-stream;base64";

const models = {
  embeddedBinary: "./fixtures/import-embedded-buffer.js",
  externalBinary: "./fixtures/import-external-buffer.js",
  noImages: "./fixtures/import-no-images.js",
};
const modelOutput = {
  embeddedBinary: "output/assets/TreasureChest_embedded_buffer.gltf",
  externalBinary: "output/assets/TreasureChest_external_buffer.gltf",
};

let TEST_DIR;

beforeEach(async () => {
  TEST_DIR = path.join(os.tmpdir(), "rollup-plugin-gltf");
  await fs.emptyDir(TEST_DIR);
});

afterAll(async () => {
  await fs.emptyDir(TEST_DIR);
});

it("should copy the gltf file/assets to the output directory", async () => {
  const BUNDLE_PATH = path.join(TEST_DIR, "bundle.js");
  const BINARY_PATH = path.join(TEST_DIR, "assets/buffer.bin");
  const TEXTURE_PATH = path.join(TEST_DIR, "assets/TreasureChest_diffuse.png");
  const GLTF_PATH = path.join(
    TEST_DIR,
    "assets/TreasureChest_external_buffer.gltf"
  );

  const bundle = await rollup({
    input: `${__dirname}/fixtures/import-external-buffer.js`,
    plugins: [
      gltf({
        inline: false,
        inlineAssetLimit: 1, // copy over ERRYTHANG
      }),
    ],
  });
  await bundle.write({
    file: BUNDLE_PATH,
    format: "iife",
    name: "test",
  });

  await expect(fs.pathExists(BUNDLE_PATH)).resolves.toEqual(true);
  await expect(fs.pathExists(BINARY_PATH)).resolves.toEqual(true);
  await expect(fs.pathExists(TEXTURE_PATH)).resolves.toEqual(true);
  await expect(fs.pathExists(GLTF_PATH)).resolves.toEqual(true);
});

it("should only copy assets if inlined", async () => {
  const BUNDLE_PATH = path.join(TEST_DIR, "bundle.js");
  const BINARY_PATH = path.join(TEST_DIR, "assets/buffer.bin");
  const TEXTURE_PATH = path.join(TEST_DIR, "assets/TreasureChest_diffuse.png");
  const GLTF_PATH = path.join(
    TEST_DIR,
    "assets/TreasureChest_external_buffer.gltf"
  );

  const bundle = await rollup({
    input: `${__dirname}/fixtures/import-external-buffer.js`,
    plugins: [
      gltf({
        inline: true,
        inlineAssetLimit: 1,
      }),
    ],
  });
  await bundle.write({
    file: BUNDLE_PATH,
    format: "iife",
    name: "test",
  });

  await expect(fs.pathExists(BUNDLE_PATH)).resolves.toEqual(true);
  await expect(fs.pathExists(BINARY_PATH)).resolves.toEqual(true);
  await expect(fs.pathExists(TEXTURE_PATH)).resolves.toEqual(true);
  await expect(fs.pathExists(GLTF_PATH)).resolves.toEqual(false);
});

// Test for: https://github.com/bengsfort/rollup-plugin-gltf/issues/1
it("should not fail if no images are included in the asset", async () => {
  const BUNDLE_PATH = path.join(TEST_DIR, "bundle.js");

  async function build() {
    const bundle = await rollup({
      input: `${__dirname}/fixtures/import-no-images.js`,
      plugins: [
        gltf({
          inline: true,
          inlineAssetLimit: 1,
        }),
      ],
    });
    return await bundle.write({
      file: BUNDLE_PATH,
      format: "iife",
      name: "test",
    });
  }

  await expect(build()).resolves.not.toThrow();
});

describe("copied gltf", () => {
  it("should give the js a valid gltf asset path", async () => {
    const BUNDLE_PATH = path.join(TEST_DIR, "bundle.js");
    const GLTF_PATH = path.join(
      TEST_DIR,
      "assets/TreasureChest_external_buffer.gltf"
    );

    const bundle = await rollup({
      input: `${__dirname}/fixtures/import-external-buffer.js`,
      plugins: [
        gltf({
          inline: false,
          inlineAssetLimit: 1,
        }),
      ],
    });
    await bundle.write({
      file: BUNDLE_PATH,
      format: "iife",
      name: "test",
    });

    // Validate that the generated bundle contains the correct path
    const generatedBuffer = await fs.readFile(BUNDLE_PATH);
    const code = generatedBuffer.toString("utf8");
    const lines = code.split("\n");
    const expectedPath = "assets/TreasureChest_external_buffer.gltf";
    expect(lines).toEqual(
      expect.arrayContaining([`\tvar model = '${expectedPath}';`])
    );

    // Validate the file got moved over
    await expect(fs.pathExists(BUNDLE_PATH)).resolves.toEqual(true);
    await expect(fs.pathExists(GLTF_PATH)).resolves.toEqual(true);
  });

  it("should keep valid asset references", async () => {
    const BUNDLE_PATH = path.join(TEST_DIR, "bundle.js");
    const BINARY_PATH = path.join(TEST_DIR, "assets/buffer.bin");
    const TEXTURE_PATH = path.join(
      TEST_DIR,
      "assets/TreasureChest_diffuse.png"
    );
    const GLTF_PATH = path.join(
      TEST_DIR,
      "assets/TreasureChest_external_buffer.gltf"
    );

    const bundle = await rollup({
      input: `${__dirname}/fixtures/import-external-buffer.js`,
      plugins: [
        gltf({
          inline: false,
          inlineAssetLimit: 1,
        }),
      ],
    });
    await bundle.write({
      file: BUNDLE_PATH,
      format: "iife",
      name: "test",
    });

    const gltfOutput = await getGltfFileOutput(GLTF_PATH);
    expect(gltfOutput).toHaveProperty("asset");
    expect(gltfOutput).toHaveProperty("buffers");
    expect(gltfOutput.buffers[0].uri).toEqual("buffer.bin");
    expect(gltfOutput).toHaveProperty("images");
    expect(gltfOutput.images[0].uri).toEqual("TreasureChest_diffuse.png");

    await expect(fs.pathExists(BINARY_PATH)).resolves.toEqual(true);
    await expect(fs.pathExists(TEXTURE_PATH)).resolves.toEqual(true);
    await expect(fs.pathExists(GLTF_PATH)).resolves.toEqual(true);
  });

  it("should inline assets when they are over the asset limit", async () => {
    const BUNDLE_PATH = path.join(TEST_DIR, "bundle.js");
    const BINARY_PATH = path.join(TEST_DIR, "assets/buffer.bin");
    const TEXTURE_PATH = path.join(
      TEST_DIR,
      "assets/TreasureChest_diffuse.png"
    );
    const GLTF_PATH = path.join(
      TEST_DIR,
      "assets/TreasureChest_embedded_buffer.gltf"
    );

    const bundle = await rollup({
      input: `${__dirname}/fixtures/import-embedded-buffer.js`,
      plugins: [
        gltf({
          inline: false,
          inlineAssetLimit: 900 * 1024,
        }),
      ],
    });
    await bundle.write({
      file: BUNDLE_PATH,
      format: "iife",
      name: "test",
    });

    // Make sure everything is inlined
    const output = await getGltfFileOutput(GLTF_PATH);
    expect(output).toHaveProperty("asset");
    expect(output).toHaveProperty("buffers");
    expect(output.buffers[0].uri.slice(0, BUFFER_DATA_ATTR.length)).toEqual(
      BUFFER_DATA_ATTR
    );
    expect(output).toHaveProperty("images");
    expect(output.images[0].uri.slice(0, TEXTURE_DATA_ATTR.length)).toEqual(
      TEXTURE_DATA_ATTR
    );

    await expect(fs.pathExists(GLTF_PATH)).resolves.toEqual(true);
    await expect(fs.pathExists(BINARY_PATH)).resolves.toEqual(false);
    await expect(fs.pathExists(TEXTURE_PATH)).resolves.toEqual(false);
  });
});

describe("inlined gltf", () => {
  it("should keep valid asset references", async () => {
    const BUNDLE_PATH = path.join(TEST_DIR, "bundle.js");
    const BINARY_PATH = path.join(TEST_DIR, "assets/buffer.bin");
    const TEXTURE_PATH = path.join(
      TEST_DIR,
      "assets/TreasureChest_diffuse.png"
    );
    const GLTF_PATH = path.join(
      TEST_DIR,
      "assets/TreasureChest_external_buffer.gltf"
    );

    const bundle = await rollup({
      input: `${__dirname}/fixtures/import-external-buffer.js`,
      plugins: [
        gltf({
          inline: true,
          inlineAssetLimit: 1,
        }),
      ],
    });
    await bundle.write({
      file: BUNDLE_PATH,
      format: "iife",
      name: "test",
    });

    // Make sure everything is inlined
    const output = await getGltfInlineOutput(BUNDLE_PATH);
    expect(output).toHaveProperty("asset");
    expect(output).toHaveProperty("buffers");
    expect(output.buffers[0].uri).toEqual("assets/buffer.bin");
    expect(output).toHaveProperty("images");
    expect(output.images[0].uri).toEqual("assets/TreasureChest_diffuse.png");

    await expect(fs.pathExists(GLTF_PATH)).resolves.toEqual(false);
    await expect(fs.pathExists(BINARY_PATH)).resolves.toEqual(true);
    await expect(fs.pathExists(TEXTURE_PATH)).resolves.toEqual(true);
  });

  it("should inline assets when they are over the asset limit", async () => {
    const BUNDLE_PATH = path.join(TEST_DIR, "bundle.js");
    const BINARY_PATH = path.join(TEST_DIR, "assets/buffer.bin");
    const TEXTURE_PATH = path.join(
      TEST_DIR,
      "assets/TreasureChest_diffuse.png"
    );
    const GLTF_PATH = path.join(
      TEST_DIR,
      "assets/TreasureChest_embedded_buffer.gltf"
    );

    const bundle = await rollup({
      input: `${__dirname}/fixtures/import-embedded-buffer.js`,
      plugins: [
        gltf({
          inline: true,
          inlineAssetLimit: 900 * 1024,
        }),
      ],
    });
    await bundle.write({
      file: BUNDLE_PATH,
      format: "iife",
      name: "test",
    });

    // Make sure everything is inlined
    const output = await getGltfInlineOutput(BUNDLE_PATH);
    expect(output).toHaveProperty("asset");
    expect(output).toHaveProperty("buffers");
    expect(output.buffers[0].uri.slice(0, BUFFER_DATA_ATTR.length)).toEqual(
      BUFFER_DATA_ATTR
    );
    expect(output).toHaveProperty("images");
    expect(output.images[0].uri.slice(0, TEXTURE_DATA_ATTR.length)).toEqual(
      TEXTURE_DATA_ATTR
    );

    await expect(fs.pathExists(BUNDLE_PATH)).resolves.toEqual(true);
    await expect(fs.pathExists(GLTF_PATH)).resolves.toEqual(false);
    await expect(fs.pathExists(BINARY_PATH)).resolves.toEqual(false);
    await expect(fs.pathExists(TEXTURE_PATH)).resolves.toEqual(false);
  });
});

// Gets a parsed JSON object representing the inlined gltf output.
async function getGltfInlineOutput(file) {
  const buffer = await fs.readFile(file);
  const code = buffer.toString("utf8");
  const intro = "model = '";
  const outro = "}';";
  const json = code.slice(
    code.indexOf(intro) + intro.length,
    code.lastIndexOf(outro) + 1
  );
  return JSON.parse(json);
}

// Gets a parsed JSON object representing the copied gltf output.
async function getGltfFileOutput(file) {
  const buffer = await fs.readFile(file);
  const json = buffer.toString("utf8");
  return JSON.parse(json);
}
