// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Node as PMNode } from "@tiptap/pm/model";

import messages from "@/messages/en.json";
import { PageEditor } from "@/components/pages/page-editor";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { BodyCollaboration } from "@/components/pages/page-collaboration";
import { CollabStream, type CollabTransport } from "@/lib/page-collaboration-stream";
import { canonicalBodyJSON, pageBodySchema } from "@/lib/page-collaboration-document";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const doc = canonicalBodyJSON({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Shared notes" }] }],
});

/** A session whose server has nothing new and accepts every batch. */
function liveSession(): { binding: BodyCollaboration; stream: CollabStream; sent: unknown[] } {
  const sent: unknown[] = [];
  let head = 0;
  const transport: CollabTransport = {
    steps: async (field, since) => ({ kind: "steps", field, from: since, to: since, head: since, steps: [], clientIds: [] }),
    submit: async (submission) => {
      sent.push(submission);
      head += submission.steps.length;
      return { status: "accepted", revision: head };
    },
  };
  // The hook relays the stream's attachment to the editor the same way.
  const attachedListeners = new Set<(attached: boolean) => void>();
  const stream = new CollabStream({
    field: "body",
    clientId: "test-session-1",
    revision: 0,
    transport,
    schema: pageBodySchema,
    docFromSnapshot: (snapshot, schema) => PMNode.fromJSON(schema, snapshot.body.doc),
    toJSON: (node) => node.toJSON(),
    fromJSON: (schema, json) => PMNode.fromJSON(schema, json),
    merge: (_base, mine) => ({ doc: mine }),
    onAttached: (attached) => attachedListeners.forEach((listener) => listener(attached)),
  });
  const binding: BodyCollaboration = {
    stream,
    clientId: "test-session-1",
    canSend: true,
    carets: () => [],
    onCaretsChange: () => () => {},
    publishCaret: () => {},
    onAttachedChange: (listener) => {
      attachedListeners.add(listener);
      return () => attachedListeners.delete(listener);
    },
    canHydrate: () => true,
  };
  return { binding, stream, sent };
}

let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
  container?.remove();
  root = null;
  container = null;
});

async function mount(element: React.ReactNode) {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TooltipProvider>{element}</TooltipProvider>
      </NextIntlClientProvider>
    );
  });
  // `useEditor` creates the editor in an effect, then the session attaches.
  for (let i = 0; i < 10; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}

const editable = () => container?.querySelector(".ProseMirror")?.getAttribute("contenteditable");

describe("PageEditor in a live session (MIN-688)", () => {
  it("becomes editable once its session is attached", async () => {
    const { binding, stream } = liveSession();
    await mount(<PageEditor initialContent={doc} onChange={vi.fn()} collaboration={binding} />);
    expect(stream.attached).toBe(true);
    expect(editable()).toBe("true");
    stream.close();
  });

  it("stays read-only for a reader", async () => {
    const { binding, stream } = liveSession();
    await mount(
      <PageEditor initialContent={doc} onChange={vi.fn()} collaboration={{ ...binding, canSend: false }} editable={false} />
    );
    expect(editable()).toBe("false");
    stream.close();
  });
});
