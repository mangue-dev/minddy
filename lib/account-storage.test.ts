import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/sign-out/route";
import { clearAccountStorage, isAccountStorageKey } from "@/lib/account-storage";

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  keys() {
    return [...this.items.keys()].sort();
  }
}

describe("account storage sweep", () => {
  it("removes every account key, including keys the old list missed", () => {
    const storage = new MemoryStorage();
    for (const key of [
      "minddy.query-cache",
      "minddy-cp:favorites",
      "minddy-cp:usage",
      "minddy.pages.last.project-1",
      "minddy:database-active-view:page-1",
      "minddy:drafts:issue",
      "assistant-active-conv-user-1",
      "minddy.sidebar-hidden",
      "minddy:keyboard-height",
      "minddy:welcome-seen",
      "mangue-ui-theme",
      "cookie_consent",
      "ph_phc_consent_test_posthog",
    ]) {
      storage.setItem(key, "x");
    }

    clearAccountStorage([storage]);

    expect(storage.keys()).toEqual([
      "cookie_consent",
      "mangue-ui-theme",
      "minddy.sidebar-hidden",
      "minddy:drafts:issue",
      "minddy:keyboard-height",
      "minddy:welcome-seen",
      "ph_phc_consent_test_posthog",
    ]);
  });

  it("keeps device keys and foreign keys", () => {
    expect(isAccountStorageKey("minddy.dismissed-version")).toBe(false);
    expect(isAccountStorageKey("mangue-ui-theme")).toBe(false);
    expect(isAccountStorageKey("minddy.app-tabs.owner")).toBe(true);
    // Owner-sealed drafts survive for the same owner (30 days, per the manual).
    expect(isAccountStorageKey("minddy:drafts:issue")).toBe(false);
    expect(isAccountStorageKey("minddy:drafts:objective")).toBe(false);
  });

  it("never throws when storage access fails", () => {
    const broken = {
      get length(): number {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(() => clearAccountStorage([broken])).not.toThrow();
  });
});

describe("sign-out route", () => {
  it("clears the HTTP cache only, without a body", async () => {
    const response = POST();
    expect(response.status).toBe(204);
    expect(response.headers.get("Clear-Site-Data")).toBe('"cache"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });
});
