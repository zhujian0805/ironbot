import { describe, expect, it } from "vitest";
import { toSlackMarkdown, formatForSlack } from "../../src/utils/slack_formatter.ts";

describe("Slack Markdown Formatter", () => {
  describe("toSlackMarkdown", () => {
    it("converts standard markdown bold to Slack bold", () => {
      const input = "This is **bold text** in markdown.";
      const expected = "This is *bold text* in markdown.";
      expect(toSlackMarkdown(input)).toBe(expected);
    });

    it("handles multiple bold sections", () => {
      const input = "**First** and **second** bold.";
      const expected = "*First* and *second* bold.";
      expect(toSlackMarkdown(input)).toBe(expected);
    });

    it("converts markdown links to Slack links", () => {
      const input = "Check out [this link](https://example.com) for more.";
      const expected = "Check out <https://example.com|this link> for more.";
      expect(toSlackMarkdown(input)).toBe(expected);
    });

    it("converts headers to bold text with emojis", () => {
      const input = "# Main Header\n## Sub Header\n### Details";
      const expected = "*🔷 Main Header*\n*📌 Sub Header*\n*📋 Details*\n";
      expect(toSlackMarkdown(input)).toBe(expected);
    });

    it("preserves code blocks", () => {
      const input = "Here is some code: ```const x = 42;```";
      expect(toSlackMarkdown(input)).toBe(input);
    });

    it("preserves inline code", () => {
      const input = "Use the `npm install` command.";
      expect(toSlackMarkdown(input)).toBe(input);
    });

    it("preserves italic formatting", () => {
      const input = "This is _italic_ text.";
      expect(toSlackMarkdown(input)).toBe(input);
    });

    it("handles headers anywhere in text, not just at line start", () => {
      const input = "↪️ ### List of All GPUs\n\nSome content";
      const expected = "↪️ *📋 List of All GPUs*\n\nSome content";
      expect(toSlackMarkdown(input)).toBe(expected);
    });

    it("formats list headers as bold", () => {
      const input = "- Summary: This is a summary\n- Results: Here are results\n- Note: Important note";
      const expected = "- *Summary:* This is a summary\n- *Results:* Here are results\n- *Note:* Important note";
      expect(toSlackMarkdown(input)).toBe(expected);
    });

    it("handles empty strings", () => {
      expect(toSlackMarkdown("")).toBe("");
    });

    it("handles mixed formatting", () => {
      const input = "**Bold** and _italic_ with [a link](https://test.com) and `code`.";
      const expected = "*Bold* and _italic_ with <https://test.com|a link> and `code`.";
      expect(toSlackMarkdown(input)).toBe(expected);
    });

    it("handles real-world AI response", () => {
      const input = "### Results\n\nI found **3 files** in the directory:\n\n- file1.ts\n- file2.ts\n- file3.ts\n\nCheck [the docs](https://docs.example.com) for more info.";
      const expected = "*📋 Results*\n\nI found *3 files* in the directory:\n\n- file1.ts\n- file2.ts\n- file3.ts\n\nCheck <https://docs.example.com|the docs> for more info.";
      expect(toSlackMarkdown(input)).toBe(expected);
    });
  });

  describe("formatForSlack", () => {
    it("calls toSlackMarkdown", () => {
      const input = "**Bold** text";
      const expected = "*Bold* text";
      expect(formatForSlack(input)).toBe(expected);
    });

    it("handles complex messages", () => {
      const input = "### Results\n\n**Success!** Found [documentation](https://example.com).";
      const expected = "*📋 Results*\n\n*Success!* Found <https://example.com|documentation>.";
      expect(formatForSlack(input)).toBe(expected);
    });
  });
});
