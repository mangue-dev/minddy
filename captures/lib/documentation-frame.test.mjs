import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { captureDocumentationControl } from "./documentation-frame.mjs";

function captureSurface(pixels, { scale = 2, dark = false, failScreenshot = false } = {}) {
  const cleaned = [];
  const control = {
    locator: () => ({ count: async () => 0 }),
    scrollIntoViewIfNeeded: async () => {},
    boundingBox: async () => ({ width: 120, height: 50 }),
    evaluate: async fn => { if (fn.toString().includes("removeAttribute")) cleaned.push("target"); return "rgb(255, 255, 255)"; },
    screenshot: async options => {
      assert.equal(options.scale, "device");
      assert.equal(options.type, "png");
      if (failScreenshot) throw new Error("Interrupted capture");
      return pixels;
    },
  };
  const page = {
    evaluate: async fn => fn.toString().includes("devicePixelRatio") ? scale : undefined,
    locator: () => ({ evaluate: async () => dark, waitFor: async () => {} }),
    addStyleTag: async () => ({ evaluate: async () => cleaned.push("style") }),
  };
  return { page, control, cleaned };
}

test("adds transparent margins while preserving every captured device pixel", async () => {
  const directory = await mkdtemp(join(tmpdir(), "minddy-documentation-frame-"));
  const raw = Buffer.alloc(240 * 100 * 4);
  for (let index = 0; index < raw.length; index += 4) {
    raw[index] = index % 251; raw[index + 1] = (index / 4) % 193; raw[index + 2] = 127; raw[index + 3] = 255;
  }
  const png = await sharp(raw, { raw: { width: 240, height: 100, channels: 4 } }).png().toBuffer();
  const { page, control, cleaned } = captureSurface(png);
  try {
    const result = await captureDocumentationControl(page, control, join(directory, "frame.png"));
    assert.deepEqual(result, { viewport: [168, 98], padding: 24, deviceScaleFactor: 2, theme: "light" });
    const output = await readFile(join(directory, "frame.png"));
    const retained = await sharp(output).extract({ left: 48, top: 48, width: 240, height: 100 }).raw().toBuffer();
    assert.deepEqual(retained, raw);
    const margin = await sharp(output).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.equal(margin[3], 0);
    assert.deepEqual(cleaned, ["style", "target"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects dark and low-density captures before changing the page", async () => {
  for (const options of [{ scale: 1 }, { dark: true }]) {
    const { page, control, cleaned } = captureSurface(null, options);
    await assert.rejects(captureDocumentationControl(page, control, "/unused.png"), /device scale|light mode/);
    assert.deepEqual(cleaned, []);
  }
});

test("restores the page when the browser capture fails", async () => {
  const { page, control, cleaned } = captureSurface(null, { failScreenshot: true });
  await assert.rejects(captureDocumentationControl(page, control, "/unused.png"), /Interrupted capture/);
  assert.deepEqual(cleaned, ["style", "target"]);
});
