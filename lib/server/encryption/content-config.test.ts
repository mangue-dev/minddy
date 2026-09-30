import { afterEach, describe, expect, it, vi } from "vitest";
import { isContentEncryptionEnabled } from "./content-config";
import { isInvitationEncryptionEnabled } from "./invitation-email";
import { appConfigEncryptionEnabled } from "./app-config-content";

afterEach(() => vi.unstubAllEnvs());

describe("the single content encryption switch", () => {
  it.each([undefined, "", "false", "1", "TRUE"])("stays disabled for %s", (value) => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", value);
    vi.stubEnv("MINDDY_INVITATION_ENCRYPTION_ENABLED", "true");
    vi.stubEnv("MINDDY_APP_CONFIG_ENCRYPTION_ENABLED", "true");
    expect(isContentEncryptionEnabled()).toBe(false);
    expect(isInvitationEncryptionEnabled()).toBe(false);
    expect(appConfigEncryptionEnabled()).toBe(false);
  });

  it("enables invitations and configuration despite retired domain flags", () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    vi.stubEnv("MINDDY_INVITATION_ENCRYPTION_ENABLED", "false");
    vi.stubEnv("MINDDY_APP_CONFIG_ENCRYPTION_ENABLED", "false");
    expect(isContentEncryptionEnabled()).toBe(true);
    expect(isInvitationEncryptionEnabled()).toBe(true);
    expect(appConfigEncryptionEnabled()).toBe(true);
  });
});
