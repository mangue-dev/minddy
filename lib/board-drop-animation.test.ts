// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoardDropAnimation } from "./board-dnd";

describe("createBoardDropAnimation", () => {
  const dropDestination = {
    activeId: "issue",
    position: 200,
    status: "in_progress",
  };

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false }),
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    vi.restoreAllMocks();
  });

  it("waits for the optimistic layout commit instead of guessing frame count", async () => {
    let finishAnimation!: () => void;
    const finished = new Promise<void>((resolve) => {
      finishAnimation = resolve;
    });
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(() => ({ finished })),
    });
    const source = document.createElement("div");
    source.dataset.issueId = "issue";
    document.body.appendChild(source);
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);

    const coordinator = createBoardDropAnimation();
    coordinator.prepare(dropDestination);
    expect(typeof coordinator.animation).toBe("function");
    if (typeof coordinator.animation !== "function") {
      throw new Error("Expected a drop animation function");
    }
    const landing = coordinator.animation({
      active: { id: "issue" },
      dragOverlay: { node: overlay },
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    } as never);
    expect(source.style.visibility).toBe("hidden");
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();

    const destination = document.createElement("div");
    destination.dataset.issueId = "issue";
    source.replaceWith(destination);
    coordinator.layoutCommitted(() => ({
      id: "issue",
      position: 200,
      status: "in_progress",
    }));
    await Promise.resolve();
    expect(destination.style.visibility).toBe("hidden");
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1);

    finishAnimation();
    await landing;
    expect(destination.style.visibility).toBe("");
  });

  it("starts landing immediately when the rendered drop marker was measured", async () => {
    let finishAnimation!: () => void;
    const finished = new Promise<void>((resolve) => {
      finishAnimation = resolve;
    });
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(() => ({ finished })),
    });
    const source = document.createElement("div");
    source.dataset.issueId = "issue";
    document.body.appendChild(source);
    const overlay = document.createElement("div");
    overlay.getBoundingClientRect = () =>
      ({ left: 20, top: 10, width: 100, height: 50 }) as DOMRect;
    document.body.appendChild(overlay);

    const coordinator = createBoardDropAnimation();
    coordinator.prepare({
      ...dropDestination,
      visualTarget: { left: 80, top: 60, width: 100, height: 50 },
    });
    if (typeof coordinator.animation !== "function") {
      throw new Error("Expected a drop animation function");
    }
    const landing = coordinator.animation({
      active: { id: "issue" },
      dragOverlay: { node: overlay },
      transform: { x: 5, y: 7, scaleX: 1, scaleY: 1 },
    } as never);

    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.animate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          transform: "translate3d(65px, 57px, 0) scaleX(1) scaleY(1)",
        }),
      ]),
      expect.objectContaining({ duration: 180 }),
    );

    const destination = document.createElement("div");
    destination.dataset.issueId = "issue";
    source.replaceWith(destination);
    coordinator.layoutCommitted(() => ({
      id: "issue",
      position: 200,
      status: "in_progress",
    }));
    expect(destination.style.visibility).toBe("hidden");

    finishAnimation();
    await landing;
    expect(destination.style.visibility).toBe("");
  });

  it("keeps the landing reserved until both animation and layout commit finish", async () => {
    let finishAnimation!: () => void;
    const finished = new Promise<void>((resolve) => {
      finishAnimation = resolve;
    });
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(() => ({ finished })),
    });
    const source = document.createElement("div");
    source.dataset.issueId = "issue";
    document.body.appendChild(source);
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);
    const onFinish = vi.fn();

    const coordinator = createBoardDropAnimation();
    coordinator.prepare(
      {
        ...dropDestination,
        visualTarget: { left: 80, top: 60, width: 100, height: 50 },
      },
      onFinish,
    );
    if (typeof coordinator.animation !== "function") {
      throw new Error("Expected a drop animation function");
    }
    const landing = coordinator.animation({
      active: { id: "issue" },
      dragOverlay: { node: overlay },
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    } as never);

    finishAnimation();
    await Promise.resolve();
    expect(onFinish).not.toHaveBeenCalled();

    coordinator.layoutCommitted(() => ({
      id: "issue",
      position: 200,
      status: "in_progress",
    }));
    await landing;
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("releases an immediate landing if dnd-kit never starts its animation", () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const coordinator = createBoardDropAnimation();

    coordinator.prepare(
      {
        ...dropDestination,
        visualTarget: { left: 80, top: 60, width: 100, height: 50 },
      },
      onFinish,
    );

    vi.advanceTimersByTime(2_000);

    expect(onFinish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("restores visibility when WAAPI is cancelled", async () => {
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(() => ({
        finished: Promise.reject(new Error("cancelled")),
      })),
    });
    const destination = document.createElement("div");
    destination.dataset.issueId = "issue";
    destination.getBoundingClientRect = () =>
      ({ left: 80, top: 60, width: 100, height: 50 }) as DOMRect;
    document.body.appendChild(destination);
    const overlay = document.createElement("div");
    overlay.getBoundingClientRect = () =>
      ({ left: 20, top: 10, width: 100, height: 50 }) as DOMRect;
    document.body.appendChild(overlay);

    const coordinator = createBoardDropAnimation();
    coordinator.prepare(dropDestination);
    coordinator.layoutCommitted(() => ({
      id: "issue",
      position: 200,
      status: "in_progress",
    }));
    if (typeof coordinator.animation !== "function") {
      throw new Error("Expected a drop animation function");
    }
    await coordinator.animation({
      active: { id: "issue" },
      dragOverlay: { node: overlay },
      transform: { x: 5, y: 7, scaleX: 1, scaleY: 1 },
    } as never);

    expect(destination.style.visibility).toBe("");
    expect(HTMLElement.prototype.animate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          transform: "translate3d(65px, 57px, 0) scaleX(1) scaleY(1)",
        }),
      ]),
      expect.objectContaining({ duration: 180 }),
    );
  });

  it("ignores unrelated board commits before the dragged issue reaches its destination", async () => {
    let finishAnimation!: () => void;
    const finished = new Promise<void>((resolve) => {
      finishAnimation = resolve;
    });
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(() => ({ finished, cancel: vi.fn() })),
    });
    const card = document.createElement("div");
    card.dataset.issueId = "issue";
    document.body.appendChild(card);
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);

    const coordinator = createBoardDropAnimation();
    coordinator.prepare(dropDestination);
    if (typeof coordinator.animation !== "function") {
      throw new Error("Expected a drop animation function");
    }
    const landing = coordinator.animation({
      active: { id: "issue" },
      dragOverlay: { node: overlay },
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    } as never);

    coordinator.layoutCommitted(() => ({
      id: "issue",
      position: 100,
      status: "todo",
    }));
    await Promise.resolve();
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();

    coordinator.layoutCommitted(() => ({
      id: "issue",
      position: 200,
      status: "in_progress",
    }));
    await Promise.resolve();
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1);

    finishAnimation();
    await landing;
  });

  it("cancels an older landing without releasing ownership of the newer one", async () => {
    let rejectFirst!: (error: Error) => void;
    const cancelFirst = vi.fn(() => rejectFirst(new Error("cancelled")));
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(() => ({
        finished: new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        }),
        cancel: cancelFirst,
      })),
    });
    const card = document.createElement("div");
    card.dataset.issueId = "issue";
    document.body.appendChild(card);
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);
    const firstFinished = vi.fn();
    const secondFinished = vi.fn();

    const coordinator = createBoardDropAnimation();
    coordinator.prepare(dropDestination, firstFinished);
    coordinator.layoutCommitted(() => ({
      id: "issue",
      position: 200,
      status: "in_progress",
    }));
    if (typeof coordinator.animation !== "function") {
      throw new Error("Expected a drop animation function");
    }
    const firstLanding = coordinator.animation({
      active: { id: "issue" },
      dragOverlay: { node: overlay },
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    } as never);
    await Promise.resolve();

    coordinator.prepare(
      { activeId: "next", position: 300, status: "done" },
      secondFinished,
    );
    await firstLanding;

    expect(cancelFirst).toHaveBeenCalledTimes(1);
    expect(firstFinished).toHaveBeenCalledTimes(1);
    expect(secondFinished).not.toHaveBeenCalled();

    coordinator.cancel();
    expect(secondFinished).toHaveBeenCalledTimes(1);
  });
});
