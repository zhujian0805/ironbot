import { describe, expect, it } from "vitest";
import { validatePermissionPolicy } from "../../src/validation/permission_policy.ts";
import { validateToolRequest } from "../../src/validation/tool_request.ts";

describe("validation", () => {
  it("accepts a valid permission policy shape", () => {
    const policy = {
      tools: [{ priority: 10, name: "read_file", desc: "Allow reads" }],
      commands: [{ priority: 10, name: ".*", desc: "Allow all commands" }],
      skills: [{ priority: 10, name: ".*", desc: "Enable all skills" }],
      mcps: [],
      resurces: [{ priority: 10, name: "/tmp/.*", desc: "Allow /tmp" }]
    };

    expect(() => validatePermissionPolicy(policy)).not.toThrow();
  });

  it("rejects invalid permission policy shapes", () => {
    const invalidPolicy = {
      tools: [{ priority: "high", name: 5, desc: 1 }]
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
