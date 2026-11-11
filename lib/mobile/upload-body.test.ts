import { afterEach, describe, expect, it, vi } from "vitest";

import { sendableUpload } from "./upload-body";

afterEach(() => {
  vi.unstubAllGlobals();
});

function insideTheApp() {
  vi.stubGlobal("window", { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } });
}

describe("sendableUpload", () => {
  it("sends a file unchanged outside the mobile app", async () => {
    vi.stubGlobal("window", {});
    const file = new File(["report"], "Mars-2024.pdf", { type: "application/pdf" });
    expect(await sendableUpload(file)).toBe(file);
  });

  it("copies a file into memory inside the app, keeping its name, type and bytes", async () => {
    insideTheApp();
    const file = new File(["report"], "Mars-2024.pdf", { type: "application/pdf", lastModified: 42 });
    const sent = await sendableUpload(file);

    expect(sent).not.toBe(file);
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe("Mars-2024.pdf");
    expect((sent as File).lastModified).toBe(42);
    expect(sent.type).toBe("application/pdf");
    expect(await sent.text()).toBe("report");
  });

  it("leaves a blob already built in memory alone", async () => {
    insideTheApp();
    const compressed = new Blob(["jpeg"], { type: "image/jpeg" });
    expect(await sendableUpload(compressed)).toBe(compressed);
  });
});
