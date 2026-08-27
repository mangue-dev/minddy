import { describe, expect, it } from "vitest";

import { isWnsChannelUri, parseWnsHelperChannel } from "./wns";

describe("WNS desktop boundary", () => {
  it("accepts the WNS host and its subdomains only over HTTPS", () => {
    expect(isWnsChannelUri("https://notify.windows.com/?token=one")).toBe(true);
    expect(isWnsChannelUri("https://wns2-by3p.notify.windows.com/?token=two")).toBe(true);
    expect(isWnsChannelUri("http://notify.windows.com/?token=one")).toBe(false);
    expect(isWnsChannelUri("https://notify.windows.com.evil.test/?token=one")).toBe(false);
    expect(isWnsChannelUri("https://user@notify.windows.com/?token=one")).toBe(false);
  });

  it("parses only a bounded helper response containing a WNS channel", () => {
    const channelUri = "https://db5p.notify.windows.com/?token=channel";
    expect(parseWnsHelperChannel(JSON.stringify({ channelUri }))).toBe(channelUri);
    expect(parseWnsHelperChannel('{"channelUri":"https://evil.test"}')).toBeNull();
    expect(parseWnsHelperChannel("not json")).toBeNull();
  });
});
