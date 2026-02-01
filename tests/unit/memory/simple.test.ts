import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "../../../src/memory/search.ts";

describe("Memory Search", () => {
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
  });
});