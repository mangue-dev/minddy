import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { navigationPreparationPending, navigationPreparationPriority, subscribeNavigationPreparation } from "@/lib/navigation-preparation-priority";
import { createRestoredTabStartupAdmission } from "./restored-tab-startup-admission";

describe("restored tab startup admission", () => {
  it("keeps construction pure and hands off without a transient optional admission", () => {
    const client = new QueryClient();
    const startup = createRestoredTabStartupAdmission(client);
    expect(navigationPreparationPending(client)).toBe(false);
    startup.mount();
    const worker = navigationPreparationPriority(client), transitions: boolean[] = [];
    const stop = subscribeNavigationPreparation(client, () => transitions.push(navigationPreparationPending(client)));
    startup.handoff(() => worker.acquire());
    expect(navigationPreparationPending(client)).toBe(true);
    expect(transitions).not.toContain(false);
    worker.release();
    expect(navigationPreparationPending(client)).toBe(false);
    stop();
  });

  it("survives synchronous effect replay without releasing or permanently losing the token", async () => {
    const client = new QueryClient(), startup = createRestoredTabStartupAdmission(client);
    const transitions: boolean[] = [];
    const stop = subscribeNavigationPreparation(client, () => transitions.push(navigationPreparationPending(client)));
    const firstCleanup = startup.mount(); firstCleanup();
    const cleanup = startup.mount(); await Promise.resolve();
    expect(navigationPreparationPending(client)).toBe(true);
    expect(transitions).toEqual([true]);
    cleanup(); await Promise.resolve();
    expect(navigationPreparationPending(client)).toBe(false);
    stop();
  });

  it("reattaches the same live session after delayed effect cleanup without dropping later visits", async () => {
    const client = new QueryClient(), startup = createRestoredTabStartupAdmission(client);
    const cleanup = startup.mount(); cleanup(); await Promise.resolve();
    expect(navigationPreparationPending(client)).toBe(false);
    const retiredVisit = vi.fn(); startup.handoff(retiredVisit);
    expect(retiredVisit).not.toHaveBeenCalled();
    const currentCleanup = startup.mount();
    cleanup(); await Promise.resolve();
    expect(navigationPreparationPending(client)).toBe(true);
    const visit = vi.fn(); startup.handoff(visit);
    expect(visit).toHaveBeenCalledOnce();
    expect(navigationPreparationPending(client)).toBe(false);
    currentCleanup(); await Promise.resolve();
  });

  it("releases on terminal failure once and still delivers subsequent normal visits", () => {
    const client = new QueryClient(), startup = createRestoredTabStartupAdmission(client);
    startup.mount(); startup.fail(); startup.fail();
    expect(navigationPreparationPending(client)).toBe(false);
    const visit = vi.fn(); startup.handoff(visit); startup.handoff(visit);
    expect(visit).toHaveBeenCalledTimes(2);
    expect(navigationPreparationPending(client)).toBe(false);
  });

  it("does not retain startup priority when the finite handoff throws", () => {
    const client = new QueryClient(), startup = createRestoredTabStartupAdmission(client);
    startup.mount();
    expect(() => startup.handoff(() => { throw new Error("Preparation failed"); })).toThrow("Preparation failed");
    expect(navigationPreparationPending(client)).toBe(false);
  });

  it("retires only its own client/session and ignores late callbacks", async () => {
    const client = new QueryClient(), otherClient = new QueryClient();
    const old = createRestoredTabStartupAdmission(client), replacement = createRestoredTabStartupAdmission(client);
    const other = createRestoredTabStartupAdmission(otherClient);
    const cleanup = old.mount(); replacement.mount(); other.mount(); cleanup(); await Promise.resolve();
    const late = vi.fn(); old.handoff(late); old.fail();
    expect(late).not.toHaveBeenCalled();
    expect(navigationPreparationPending(client)).toBe(true);
    expect(navigationPreparationPending(otherClient)).toBe(true);
    replacement.fail(); expect(navigationPreparationPending(client)).toBe(false);
    expect(navigationPreparationPending(otherClient)).toBe(true);
    other.fail(); expect(navigationPreparationPending(otherClient)).toBe(false);
  });
});
