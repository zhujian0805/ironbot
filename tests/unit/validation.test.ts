import { describe, expect, it } from "vitest";
import { validatePermissionPolicy } from "../../src/validation/permission_policy.ts";
import { validateToolRequest } from "../../src/validation/tool_request.ts";

describe("validation", () => {
  it("accepts a valid permission policy shape", () => {
    const policy = {
      version: "1.0",
      settings: { default_deny: true, log_denials: false },
      tools: { allowed: ["read_file"], restrictions: {} },
      skills: { allowed: [] },
      mcps: { allowed: [], settings: {} },
      resources: { denied_paths: [] }
    };

    expect(() => validatePermissionPolicy(policy)).not.toThrow();
  });

  it("rejects invalid permission policy shapes", () => {
    const invalidPolicy = {
      version: 1,
      tools: { allowed: "read_file" }
    };

    expect(() => validatePermissionPolicy(invalidPolicy)).toThrow();
  });

  it("validates tool request shapes", () => {
    const request = {
      toolName: "read_file",
      arguments: { path: "/tmp/example.txt" }
    };

    expect(() => validateToolRequest(request)).not.toThrow();
  });

  it("rejects tool requests missing required fields", () => {
    const request = { arguments: {} };

    expect(() => validateToolRequest(request)).toThrow();
  });
});
