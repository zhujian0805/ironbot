import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import { resolveEmbeddingClient, buildOpenAiClient, buildGeminiClient, buildLocalClient, buildNoneClient } from "../../../src/memory/embeddings.ts";

// Mock fs
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn()
  }
}));

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("Embedding Clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildNoneClient", () => {
    it("returns a none provider client", () => {
      const client = buildNoneClient();

      expect(client.provider).toBe("none");
      expect(client.model).toBe("");
    });

    it("returns empty embeddings", async () => {
      const client = buildNoneClient();
      const result = await client.embed(["test"]);

      expect(result).toEqual([]);
    });
  });

  describe("buildOpenAiClient", () => {
    it("returns null when no API key", () => {
      const client = buildOpenAiClient({
        provider: "openai",
        openai: { apiKey: undefined },
        fallback: "none"
      });

      expect(client).toBeNull();
    });

    it("creates client with default config", () => {
      const client = buildOpenAiClient({
        provider: "openai",
        openai: { apiKey: "test-key" },
        fallback: "none"
      });

      expect(client?.provider).toBe("openai");
      expect(client?.model).toBe("text-embedding-3-small");
    });

    it("creates embeddings successfully", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { embedding: [0.1, 0.2, 0.3] },
            { embedding: [0.4, 0.5, 0.6] }
          ]
        })
      });

      const client = buildOpenAiClient({
        provider: "openai",
        openai: { apiKey: "test-key" },
        fallback: "none"
      });

      const result = await client!.embed(["text1", "text2"]);

      expect(result).toEqual([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);
      expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: ["text1", "text2"]
        })
      });
    });

    it("handles API errors", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400
      });

      const client = buildOpenAiClient({
        provider: "openai",
        openai: { apiKey: "test-key" },
        fallback: "none"
      });

      await expect(client!.embed(["test"])).rejects.toThrow("OpenAI embeddings request failed: 400");
    });
  });

  describe("buildGeminiClient", () => {
    it("returns null when no API key", () => {
      const client = buildGeminiClient({
        provider: "gemini",
        gemini: { apiKey: undefined },
        fallback: "none"
      });

      expect(client).toBeNull();
    });

    it("creates embeddings successfully", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embedding: { values: [0.1, 0.2, 0.3] }
        })
      });

      const client = buildGeminiClient({
        provider: "gemini",
        gemini: { apiKey: "test-key" },
        fallback: "none"
      });

      const result = await client!.embed(["test text"]);

      expect(result).toEqual([[0.1, 0.2, 0.3]]);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=test-key",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text: "test text" }] }
          })
        }
      );
    });
  });

  describe("buildLocalClient", () => {
    it("returns null when model not available", () => {
      const client = buildLocalClient({
        provider: "local",
        local: { modelPath: "/nonexistent/model" },
        fallback: "none"
      });

      expect(client).toBeNull();
    });

    it("creates hashing-based embeddings", async () => {
      // Mock fs.existsSync to return true for hf: paths
      vi.mocked(fs).existsSync.mockReturnValue(true);

      const client = buildLocalClient({
        provider: "local",
        local: { modelPath: "hf:test/model" },
        fallback: "none"
      });

      expect(client?.provider).toBe("local");
      expect(client?.model).toBe("hf:test/model");

      const result = await client!.embed(["hello world"]);
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(384); // Hashing dimension
      expect(result[0].every(v => typeof v === "number")).toBe(true);
    });
  });

  describe("resolveEmbeddingClient", () => {
    it("returns none client when provider is none", () => {
      const client = resolveEmbeddingClient({
        provider: "none",
        fallback: "none"
      });

      expect(client.provider).toBe("none");
    });

    it("auto-selects local client when available", () => {
      vi.mocked(fs).existsSync.mockReturnValue(true);

      const client = resolveEmbeddingClient({
        provider: "auto",
        local: { modelPath: "hf:test/model" },
        fallback: "none"
      });

      expect(client.provider).toBe("local");
    });

    it("falls back to none when no clients available", () => {
      const client = resolveEmbeddingClient({
        provider: "auto",
        openai: { apiKey: undefined },
        gemini: { apiKey: undefined },
        local: { modelPath: "/nonexistent" },
        fallback: "none"
      });

      expect(client.provider).toBe("none");
    });

    it("uses fallback when primary provider unavailable", () => {
      const client = resolveEmbeddingClient({
        provider: "openai",
        openai: { apiKey: undefined },
        gemini: { apiKey: "gemini-key" },
        fallback: "gemini"
      });

      expect(client.provider).toBe("gemini");
    });
  });
});</content>
