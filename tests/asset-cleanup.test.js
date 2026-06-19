import test from "node:test";
import assert from "node:assert/strict";

import { findUnusedAssets, removeUnusedAssets } from "../src/assetCleanup.js";

const usedByPost = { id: "asset-post", name: "Post Image.png", type: "image/png", dataBase64: "post-data", size: 10 };
const usedByPageText = { id: "asset-page", name: "Page Hero.png", type: "image/png", dataBase64: "page-data", size: 20 };
const usedByMarkdownPath = { id: "asset-markdown", name: "Cursor Image.png", fileName: "cursor-image.png", type: "image/png", dataBase64: "path-data", size: 25 };
const usedByCurrentEditor = { id: "asset-editor", name: "Unsaved.png", type: "image/png", dataBase64: "editor-data", size: 30 };
const unused = { id: "asset-unused", name: "Unused.png", type: "image/png", dataBase64: "unused-data", size: 40 };

test("findUnusedAssets ignores asset self data and keeps assets referenced elsewhere in the Shell", () => {
  const workspace = {
    posts: [{ id: "p1", title: "Post", imageIds: ["asset-post"], body: "Body\n\n![cursor](/assets/cursor-image.png)" }],
    assets: [usedByPost, usedByPageText, usedByMarkdownPath, usedByCurrentEditor, unused],
    plugins: {
      state: {
        "postsnail-pages": {
          pages: [{ id: "home", body: "![hero](Page Hero.png)" }],
        },
      },
    },
  };

  const result = findUnusedAssets(workspace, {
    extraReferences: [{ imageIds: ["asset-editor"] }],
  });

  assert.deepEqual(result.map((asset) => asset.id), ["asset-unused"]);
});

test("removeUnusedAssets returns a cleaned copy and does not mutate the original workspace", () => {
  const workspace = {
    posts: [{ id: "p1", imageIds: ["asset-post"] }],
    assets: [usedByPost, unused],
  };

  const result = removeUnusedAssets(workspace);

  assert.deepEqual(result.removedAssets.map((asset) => asset.id), ["asset-unused"]);
  assert.deepEqual(result.state.assets.map((asset) => asset.id), ["asset-post"]);
  assert.deepEqual(workspace.assets.map((asset) => asset.id), ["asset-post", "asset-unused"]);
});
