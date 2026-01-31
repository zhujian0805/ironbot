import { describe, expect, it } from "vitest";
import { deriveSlackSessionKey } from "../../src/sessions/session_key.js";

describe("deriveSlackSessionKey", () => {
  it("returns main session for DMs", () => {
    const result = deriveSlackSessionKey({ channel: "D123", ts: "111" });
    expect(result.sessionKey).toBe("main");
    expect(result.isMain).toBe(true);
  });

  it("uses channel and thread for group messages", () => {
    const result = deriveSlackSessionKey({ channel: "C123", threadTs: "168.0001" });
    expect(result.sessionKey).toBe("slack:c123:thread:168.0001");
    expect(result.isMain).toBe(false);
  });

  it("falls back to message ts when thread is missing", () => {
    const result = deriveSlackSessionKey({ channel: "C999", ts: "200.01" });
    expect(result.sessionKey).toBe("slack:c999:thread:200.01");
  });
});
