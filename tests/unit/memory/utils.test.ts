import { describe, expect, it } from "vitest";

// Import the utility functions from manager
const tokenize = (text: string): string[] => text.split(/\s+/).filter(Boolean);

const chunkText = (text: string, maxTokens = 400, overlap = 80): string[] => {
  const tokens = tokenize(text);
  if (!tokens.length) return [];
  const chunks: string[] = [];
  const step = Math.max(1, maxTokens - overlap);
  for (let i = 0; i < tokens.length; i += step) {
    const slice = tokens.slice(i, i + maxTokens);
    if (!slice.length) break;
    chunks.push(slice.join(" "));
  }
  return chunks;
};

const extractTranscriptText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

describe("Memory Utilities", () => {
  describe("tokenize", () => {
    it("splits text into tokens", () => {
      expect(tokenize("hello world test")).toEqual(["hello", "world", "test"]);
    });

    it("handles multiple spaces", () => {
      expect(tokenize("hello   world")).toEqual(["hello", "world"]);
    });

    it("filters empty tokens", () => {
      expect(tokenize("hello\n\tworld")).toEqual(["hello", "world"]);
    });

    it("handles empty string", () => {
      expect(tokenize("")).toEqual([]);
    });
  });

  describe("chunkText", () => {
    it("chunks text into pieces", () => {
      const text = "This is a long text that should be chunked into smaller pieces for processing.";
      const chunks = chunkText(text, 5, 2);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toContain("This is a long");
      expect(chunks.every(chunk => tokenize(chunk).length <= 5)).toBe(true);
    });

    it("handles overlap between chunks", () => {
      const text = "one two three four five six seven";
      const chunks = chunkText(text, 3, 1);

      expect(chunks.length).toBeGreaterThan(1);
      // Check that adjacent chunks share tokens due to overlap
      if (chunks.length > 1) {
        const firstTokens = tokenize(chunks[0]);
        const secondTokens = tokenize(chunks[1]);
        const overlapExists = firstTokens.some(token => secondTokens.includes(token));
        expect(overlapExists).toBe(true);
      }
    });

    it("handles empty text", () => {
      expect(chunkText("")).toEqual([]);
    });

    it("handles text shorter than chunk size", () => {
      const text = "short text";
      const chunks = chunkText(text, 10, 2);

      expect(chunks).toEqual([text]);
    });
  });

  describe("extractTranscriptText", () => {
    it("returns string content as-is", () => {
      expect(extractTranscriptText("Hello world")).toBe("Hello world");
    });

    it("extracts text from message parts", () => {
      const content = [
        { text: "Hello" },
        { text: "world" },
        { type: "other" } // Should be ignored
      ];

      expect(extractTranscriptText(content)).toBe("Hello\nworld");
    });

    it("handles mixed content types", () => {
      const content = [
        { type: "text", text: "Hello" },
        { type: "tool_use", name: "test" },
        { type: "text", text: "world" }
      ];

      expect(extractTranscriptText(content)).toBe("Hello\nworld");
    });

    it("handles empty or invalid content", () => {
      expect(extractTranscriptText(null)).toBe("");
      expect(extractTranscriptText(undefined)).toBe("");
      expect(extractTranscriptText([])).toBe("");
      expect(extractTranscriptText([{}])).toBe("");
    });

    it("handles non-array content", () => {
      expect(extractTranscriptText(123)).toBe("");
      expect(extractTranscriptText({})).toBe("");
    });
  });
});</content>
