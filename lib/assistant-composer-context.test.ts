// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  uploads: {
    pending: [],
    addFiles: vi.fn(),
    addLink: vi.fn(),
    addPage: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    restore: vi.fn(),
    inputs: [],
    uploading: false,
  },
}));

vi.mock("./auth-context", () => ({
  useAuth: () => ({ user: { id: "user" } }),
}));
vi.mock("./use-attachment-uploads", () => ({
  useAttachmentUploads: () => h.uploads,
}));

import {
  AssistantComposerProvider,
  useAssistantComposer,
} from "./assistant-composer-context";

let root: Root;
let value: ReturnType<typeof useAssistantComposer>;

function Probe() {
  value = useAssistantComposer();
  return null;
}

async function render(show = true) {
  await act(async () => {
    root.render(
      createElement(AssistantComposerProvider, {
        children: show ? createElement(Probe) : null,
      }),
    );
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("shared assistant composer", () => {
  it("retains tokenized draft markup and uploads between surface mounts", async () => {
    await render();
    const uploads = value.uploads;
    await act(async () => {
      value.setDraftHtml(
        'Review <span data-mention-id="issue">MIN-523</span>',
      );
    });

    await render(false);
    await render();

    expect(value.draftHtml).toContain("data-mention-id");
    expect(value.uploads).toBe(uploads);
  });
});
