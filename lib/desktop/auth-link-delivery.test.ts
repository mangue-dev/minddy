import { expect, it, vi } from "vitest";
import { createDesktopAuthLinkDelivery } from "./auth-link-delivery";
import type { DesktopAuthLink } from "./auth-link";

const link: DesktopAuthLink = { kind: "code", code: "callback-code", next: "/home" };
function setup() {
  let renderer: number | null = null;
  const send = vi.fn();
  const delivery = createDesktopAuthLinkDelivery({ currentRenderer: () => renderer, send });
  return { delivery, send, window: (id: number | null) => { renderer = id; } };
}

it("retains cold-start authentication until the current app document subscribes", () => {
  const { delivery, send, window } = setup();
  delivery.receive(link);
  window(1); delivery.flush();
  expect(send).not.toHaveBeenCalled();
  delivery.ready(2);
  expect(send).not.toHaveBeenCalled();
  delivery.ready(1);
  expect(send).toHaveBeenCalledExactlyOnceWith(link);
  delivery.ready(1); delivery.flush();
  expect(send).toHaveBeenCalledTimes(1);
});

it("delivers warm callbacks immediately and queues callbacks after navigation or unmount", () => {
  const { delivery, send, window } = setup();
  window(1); delivery.ready(1);
  delivery.receive(link);
  expect(send).toHaveBeenCalledTimes(1);
  delivery.notReady(2);
  delivery.receive(link);
  expect(send).toHaveBeenCalledTimes(2);
  delivery.notReady(1);
  delivery.receive(link); delivery.flush();
  expect(send).toHaveBeenCalledTimes(2);
  delivery.ready(1);
  expect(send).toHaveBeenCalledTimes(3);
});

it("waits for a replacement window and retries failed sends after a fresh subscription", () => {
  const { delivery, send, window } = setup();
  window(1); delivery.ready(1);
  window(2); delivery.receive(link);
  delivery.ready(1);
  expect(send).not.toHaveBeenCalled();
  send.mockImplementationOnce(() => { throw new Error("Renderer destroyed"); });
  delivery.ready(2);
  expect(send).toHaveBeenCalledTimes(1);
  delivery.flush();
  expect(send).toHaveBeenCalledTimes(1);
  delivery.ready(2);
  expect(send).toHaveBeenCalledTimes(2);
});
