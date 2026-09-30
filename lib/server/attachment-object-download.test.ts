import { afterEach, describe, expect, it } from "vitest";
import { downloadAttachment } from "./attachments";

const originalRoot = process.env.MINDDY_DATA_ROOT_KEY;
afterEach(() => { if (originalRoot === undefined) delete process.env.MINDDY_DATA_ROOT_KEY;
  else process.env.MINDDY_DATA_ROOT_KEY = originalRoot; });

function service(marked: boolean) {
  const path = "projects/project-1/object-1";
  return {
    storage: { from: () => ({ download: async () => ({
      data: new Blob(["cleartext"], { type: "application/octet-stream" }), error: null,
    }) }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: marked ? { path } : null, error: null,
    }) }) }) }),
  };
}

describe("attachment object downgrade protection", () => {
  it("rejects raw bytes when the object is registered as encrypted", async () => {
    delete process.env.MINDDY_DATA_ROOT_KEY;
    await expect(downloadAttachment(service(true) as never,
      "projects/project-1/object-1")).rejects.toThrow(/not encrypted/);
  });

  it("continues reading actual legacy objects", async () => {
    delete process.env.MINDDY_DATA_ROOT_KEY;
    expect(await downloadAttachment(service(false) as never,
      "projects/project-1/object-1")).toEqual(Buffer.from("cleartext"));
  });
});
