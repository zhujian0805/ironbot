import { describe, expect, it, vi, beforeEach } from "vitest";
import { hybridSearch, normalizeHybridWeights, cosineSimilarity, jaccardSimilarity } from "../../../src/memory/search.ts";

describe("Memory Search", () => {
  describe("normalizeHybridWeights", () => {
    it("normalizes weights to sum to 1", () => {
      const config = normalizeHybridWeights({
        vectorWeight: 0.6,
        textWeight: 0.4,
        candidateMultiplier: 2,
        maxResults: 10,
        minScore: 0.1
      });

      expect(config.vectorWeight + config.textWeight).toBeCloseTo(1, 5);
      expect(config.vectorWeight).toBe(0.6);
      expect(config.textWeight).toBe(0.4);
    });

    it("handles zero weights", () => {
      const config = normalizeHybridWeights({
        vectorWeight: 0,
        textWeight: 0,
        candidateMultiplier: 2,
        maxResults: 10,
        minScore: 0.1
      });

      expect(config.vectorWeight).toBe(0.7);
      expect(config.textWeight).toBe(0.3);
    });

    it("clamps values within bounds", () => {
      const config = normalizeHybridWeights({
        vectorWeight: -0.5,
        textWeight: 1.5,
        candidateMultiplier: 0.5,
        maxResults: -1,
        minScore: 1.5
      });

      expect(config.vectorWeight).toBe(0);
      expect(config.textWeight).toBe(1);
      expect(config.candidateMultiplier).toBe(1);
      expect(config.maxResults).toBe(1);
      expect(config.minScore).toBe(1);
    });
  });

  describe("cosineSimilarity", () => {
    it("calculates similarity between identical vectors", () => {
      const vector = [1, 2, 3];
      expect(cosineSimilarity(vector, vector)).toBe(1);
    });

    it("calculates similarity between orthogonal vectors", () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it("calculates similarity between opposite vectors", () => {
      const a = [1, 2];
      const b = [-1, -2];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
    });

    it("handles zero vectors", () => {
      expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
      expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
    });

    it("handles vectors of different lengths", () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    });
  });

  describe("jaccardSimilarity", () => {
    it("calculates similarity between identical sets", () => {
      const tokens = ["hello", "world"];
      expect(jaccardSimilarity(tokens, tokens)).toBe(1);
    });

    it("calculates similarity between disjoint sets", () => {
      const a = ["hello", "world"];
      const b = ["foo", "bar"];
      expect(jaccardSimilarity(a, b)).toBe(0);
    });

    it("calculates similarity between overlapping sets", () => {
      const a = ["hello", "world", "test"];
      const b = ["world", "test", "other"];
      expect(jaccardSimilarity(a, b)).toBe(0.5); // 2 intersection, 4 union
    });

    it("handles empty sets", () => {
      expect(jaccardSimilarity([], ["hello"])).toBe(0);
      expect(jaccardSimilarity(["hello"], [])).toBe(0);
      expect(jaccardSimilarity([], [])).toBe(0);
    });
  });

  describe("hybridSearch", () => {
    const mockChunks = [
      {
        id: 1,
        content: "The quick brown fox jumps over the lazy dog",
        embedding: [0.1, 0.2, 0.3],
        source: "memory" as const,
        path: "/test/file1.md"
      },
      {
        id: 2,
        content: "A fast brown animal leaps above a sleeping canine",
        embedding: [0.15, 0.25, 0.35],
        source: "memory" as const,
        path: "/test/file2.md"
      },
      {
        id: 3,
        content: "Unrelated content about technology and programming",
        embedding: [0.8, 0.9, 0.1],
        source: "memory" as const,
        path: "/test/file3.md"
      }
    ];

    it("performs vector-only search", () => {
      const results = hybridSearch({
        query: "quick fox",
        queryEmbedding: [0.1, 0.2, 0.3],
        chunks: mockChunks,
        config: {
          vectorWeight: 1,
          textWeight: 0,
          candidateMultiplier: 2,
          maxResults: 10,
          minScore: 0
        }
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe(1); // Should match first chunk best
      expect(results[0].vectorScore).toBeGreaterThan(0);
      expect(results[0].textScore).toBe(0); // Text weight is 0
    });

    it("performs text-only search", () => {
      const results = hybridSearch({
        query: "quick brown fox",
        chunks: mockChunks,
        config: {
          vectorWeight: 0,
          textWeight: 1,
          candidateMultiplier: 2,
          maxResults: 10,
          minScore: 0
        }
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe(1); // Should match first chunk best
      expect(results[0].textScore).toBeGreaterThan(0);
      expect(results[0].vectorScore).toBe(0); // Vector weight is 0
    });

    it("combines vector and text search", () => {
      const results = hybridSearch({
        query: "quick brown fox",
        queryEmbedding: [0.1, 0.2, 0.3],
        chunks: mockChunks,
        config: {
          vectorWeight: 0.7,
          textWeight: 0.3,
          candidateMultiplier: 2,
          maxResults: 10,
          minScore: 0
        }
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeDefined();
      expect(results[0].vectorScore).toBeDefined();
      expect(results[0].textScore).toBeDefined();
    });

    it("respects maxResults limit", () => {
      const results = hybridSearch({
        query: "content",
        queryEmbedding: [0.5, 0.5, 0.5],
        chunks: mockChunks,
        config: {
          vectorWeight: 0.5,
          textWeight: 0.5,
          candidateMultiplier: 2,
          maxResults: 1,
          minScore: 0
        }
      });

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("filters by minScore", () => {
      const results = hybridSearch({
        query: "unrelated",
        queryEmbedding: [0.9, 0.9, 0.9],
        chunks: mockChunks,
        config: {
          vectorWeight: 0.5,
          textWeight: 0.5,
          candidateMultiplier: 2,
          maxResults: 10,
          minScore: 0.8
        }
      });

      expect(results.every(hit => hit.score >= 0.8)).toBe(true);
    });

    it("handles empty chunks array", () => {
      const results = hybridSearch({
        query: "test",
        chunks: [],
        config: {
          vectorWeight: 0.5,
          textWeight: 0.5,
          candidateMultiplier: 2,
          maxResults: 10,
          minScore: 0
        }
      });

      expect(results).toEqual([]);
    });

    it("handles chunks without embeddings in vector search", () => {
      const chunksWithoutEmbeddings = mockChunks.map(chunk => ({
        ...chunk,
        embedding: undefined
      }));

      const results = hybridSearch({
        query: "test",
        queryEmbedding: [0.1, 0.2, 0.3],
        chunks: chunksWithoutEmbeddings,
        config: {
          vectorWeight: 1,
          textWeight: 0,
          candidateMultiplier: 2,
          maxResults: 10,
          minScore: 0
        }
      });

      expect(results.every(hit => hit.vectorScore === 0)).toBe(true);
    });
  });
});
