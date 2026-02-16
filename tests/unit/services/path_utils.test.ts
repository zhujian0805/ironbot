import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { homedir } from "node:os";
import { expandUser } from "../../../src/services/path_utils";

describe("PathUtils", () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    if (originalHome) {
      process.env.HOME = originalHome;
    }
  });

  describe("expandUser", () => {
    it("should expand single tilde to home directory", () => {
      const result = expandUser("~");
      expect(result).toBe(homedir());
    });

    it("should expand tilde with path", () => {
      const result = expandUser("~/.ironbot/skills");
      const expected = homedir() + "/.ironbot/skills";
      expect(result).toBe(expected);
    });

    it("should expand tilde at the beginning of path", () => {
      const result = expandUser("~/config/ironbot.json");
      const expected = homedir() + "/config/ironbot.json";
      expect(result).toBe(expected);
    });

    it("should handle nested paths with tilde", () => {
      const result = expandUser("~/.ironbot/skills/custom");
      const expected = homedir() + "/.ironbot/skills/custom";
      expect(result).toBe(expected);
    });

    it("should not expand tilde in middle of path", () => {
      const input = "/home/user/~/.ironbot";
      const result = expandUser(input);
      expect(result).toBe(input);
    });

    it("should not expand tilde at end of path", () => {
      const input = "/home/user~";
      const result = expandUser(input);
      expect(result).toBe(input);
    });

    it("should leave absolute paths unchanged", () => {
      const input = "/home/user/.ironbot/skills";
      const result = expandUser(input);
      expect(result).toBe(input);
    });

    it("should leave Windows absolute paths unchanged", () => {
      const input = "C:\\Users\\user\\.ironbot\\skills";
      const result = expandUser(input);
      expect(result).toBe(input);
    });

    it("should leave relative paths unchanged", () => {
      const input = "./.ironbot/skills";
      const result = expandUser(input);
      expect(result).toBe(input);
    });

    it("should leave relative parent paths unchanged", () => {
      const input = "../config/ironbot.json";
      const result = expandUser(input);
      expect(result).toBe(input);
    });

    it("should handle empty string", () => {
      const result = expandUser("");
      expect(result).toBe("");
    });

    it("should handle paths with multiple slashes", () => {
      const result = expandUser("~///.ironbot//skills");
      const expected = homedir() + "///.ironbot//skills";
      expect(result).toBe(expected);
    });

    it("should work with dots in path", () => {
      const result = expandUser("~/.config/app.json");
      const expected = homedir() + "/.config/app.json";
      expect(result).toBe(expected);
    });

    it("should work with hyphen in path", () => {
      const result = expandUser("~/.ironbot-config/skills");
      const expected = homedir() + "/.ironbot-config/skills";
      expect(result).toBe(expected);
    });

    it("should work with numbers in path", () => {
      const result = expandUser("~/v1.2.3/skills");
      const expected = homedir() + "/v1.2.3/skills";
      expect(result).toBe(expected);
    });

    it("should preserve trailing slash", () => {
      const result = expandUser("~/.ironbot/");
      const expected = homedir() + "/.ironbot/";
      expect(result).toBe(expected);
    });

    it("should handle very long paths", () => {
      const longPath = "~/" + "a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p";
      const result = expandUser(longPath);
      expect(result).toContain(homedir());
      expect(result).toContain("a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p");
    });

    it("should handle multiple consecutive tildes", () => {
      // Only first tilde should be expanded in this edge case
      const input = "~~/.ironbot";
      const result = expandUser(input);
      // Since ~~/ doesn't match ~/, it won't expand
      expect(result).toBe(input);
    });

    it("should be idempotent for absolute paths", () => {
      const input = "/home/user/.ironbot";
      const result1 = expandUser(input);
      const result2 = expandUser(result1);
      expect(result1).toBe(result2);
    });

    it("should work with special characters in path (except tilde)", () => {
      const result = expandUser("~/@special/config-file.json");
      const expected = homedir() + "/@special/config-file.json";
      expect(result).toBe(expected);
    });

    it("should work with encoded characters in path", () => {
      const result = expandUser("~/folder%20name/file");
      const expected = homedir() + "/folder%20name/file";
      expect(result).toBe(expected);
    });
  });
});
