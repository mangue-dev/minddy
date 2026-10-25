import { describe, expect, it } from "vitest";

import {
  LOCAL_ACCOUNT_EMAIL,
  LOCAL_INSTANCE_ORIGIN,
  localDisplayName,
  localSupabaseKeys,
  mayReceiveLocalSession,
  ownerIdFromUserList,
  parseEnvFile,
  sessionFromTokenResponse,
} from "./local-account";

describe("desktop local account", () => {
  it("reads the local Supabase keys the launcher wrote", () => {
    const env = parseEnvFile(
      '# comment\nMINDDY_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321/"\nexport MINDDY_PUBLIC_SUPABASE_ANON_KEY=anon\nSUPABASE_SERVICE_ROLE_KEY=\'service\'\n',
    );
    expect(localSupabaseKeys(env)).toEqual({ url: "http://127.0.0.1:54321", anonKey: "anon", serviceRoleKey: "service" });
    expect(localSupabaseKeys({ ...env, SUPABASE_SERVICE_ROLE_KEY: "" })).toBeNull();
  });

  it("never sends the managed password to a Supabase outside this computer", () => {
    expect(
      localSupabaseKeys({
        MINDDY_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        MINDDY_PUBLIC_SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      }),
    ).toBeNull();
  });

  it("gives the session only to the managed instance while it is the selected server", () => {
    expect(mayReceiveLocalSession("http://localhost:6463/login", LOCAL_INSTANCE_ORIGIN, LOCAL_INSTANCE_ORIGIN)).toBe(true);
    expect(mayReceiveLocalSession("https://www.minddy.app/login", LOCAL_INSTANCE_ORIGIN, LOCAL_INSTANCE_ORIGIN)).toBe(false);
    expect(mayReceiveLocalSession("http://localhost:6463/login", LOCAL_INSTANCE_ORIGIN, "https://tickets.example.com")).toBe(false);
    expect(mayReceiveLocalSession("http://localhost:6463/login", LOCAL_INSTANCE_ORIGIN, null)).toBe(false);
    expect(mayReceiveLocalSession("not a url", LOCAL_INSTANCE_ORIGIN, LOCAL_INSTANCE_ORIGIN)).toBe(false);
  });

  it("keeps only the tokens of a sign-in", () => {
    expect(sessionFromTokenResponse({ access_token: "a", refresh_token: "r", user: { id: "u" } })).toEqual({
      access_token: "a",
      refresh_token: "r",
    });
    expect(sessionFromTokenResponse({ error: "invalid_grant" })).toBeNull();
  });

  it("finds the owner again after a reinstall over kept data", () => {
    expect(ownerIdFromUserList({ users: [{ id: "x", email: "someone@example.com" }, { id: "o", email: LOCAL_ACCOUNT_EMAIL }] })).toBe("o");
    expect(ownerIdFromUserList({ users: [] })).toBeNull();
    expect(ownerIdFromUserList(null)).toBeNull();
  });

  it("names the account after the person on this computer", () => {
    expect(localDisplayName("Camille Roy\n", "camille")).toBe("Camille Roy");
    expect(localDisplayName(undefined, "camille")).toBe("camille");
    expect(localDisplayName("", "")).toBe("minddy");
  });
});
