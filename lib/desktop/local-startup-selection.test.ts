import { expect, it, vi } from "vitest";
import { createLocalStartupSelection } from "./local-startup-selection";

it("shares one folder dialog and startup between overlapping menu and picker requests", async () => {
  let finish!: (result: { error?: string }) => void;
  const start = vi.fn(() => new Promise<{ error?: string }>(resolve => { finish = resolve; }));
  const select = createLocalStartupSelection(start);
  const menu = select();
  const picker = select();
  expect(menu).toBe(picker);
  await Promise.resolve();
  expect(start).toHaveBeenCalledTimes(1);
  finish({});
  await expect(menu).resolves.toEqual({});
  await expect(picker).resolves.toEqual({});
  const next = select();
  await Promise.resolve();
  expect(start).toHaveBeenCalledTimes(2);
  finish({ error: "Local startup was canceled." });
  await expect(next).resolves.toEqual({ error: "Local startup was canceled." });
});

it("releases a failed folder selection so a later request can retry", async () => {
  const start = vi.fn().mockRejectedValueOnce(new Error("Folder dialog unavailable")).mockResolvedValueOnce({});
  const select = createLocalStartupSelection(start);
  await expect(select()).rejects.toThrow("Folder dialog unavailable");
  await expect(select()).resolves.toEqual({});
  expect(start).toHaveBeenCalledTimes(2);
});

it("joins automatic startup without opening an interactive folder dialog or replacing its root", async () => {
  let ready!: (result: { error?: string }) => void;
  const chooseFolder = vi.fn(async () => ({}));
  const restore = vi.fn(() => new Promise<{ error?: string }>(resolve => { ready = resolve; }));
  const select = createLocalStartupSelection(chooseFolder);
  const automatic = select.run(restore);
  const interactive = select();
  expect(interactive).toBe(automatic);
  await Promise.resolve();
  expect(restore).toHaveBeenCalledTimes(1);
  expect(chooseFolder).not.toHaveBeenCalled();
  ready({ error: "Local startup was canceled." });
  await expect(interactive).resolves.toEqual({ error: "Local startup was canceled." });
  await expect(select()).resolves.toEqual({});
  expect(chooseFolder).toHaveBeenCalledTimes(1);
});
