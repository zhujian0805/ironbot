import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../src/config.ts";
import { resolveEmbeddingClient } from "../../src/memory/embeddings.ts";

const ORIGINAL_ENV = { ...process.env };

const resetEnv = () => {
  process.env = { ...ORIGINAL_ENV } as NodeJS.ProcessEnv;
  delete process.env.IRONBOT_EMBEDDINGS_PROVIDER;
  delete process.env.IRONBOT_EMBEDDINGS_FALLBACK;
  delete process.env.IRONBOT_EMBEDDINGS_LOCAL_MODEL;
  delete process.env.IRONBOT_OPENAI_API_KEY;
  delete process.env.IRONBOT_GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.IRONBOT_MEMORY_SEARCH_ENABLED;
  delete process.env.IRONBOT_MEMORY_VECTOR_WEIGHT;
  delete process.env.IRONBOT_MEMORY_TEXT_WEIGHT;
  delete process.env.IRONBOT_MEMORY_CANDIDATE_MULTIPLIER;
  delete process.env.IRONBOT_MEMORY_MAX_RESULTS;
  delete process.env.IRONBOT_MEMORY_MIN_SCORE;
};

describe("memory config defaults", () => {
  beforeEach(() => resetEnv());
  afterEach(() => resetEnv());

  it("uses openclaw default memory search weights", () => {
    const config = resolveConfig();
    expect(config.memorySearch.vectorWeight).toBe(0.7);
    expect(config.memorySearch.textWeight).toBe(0.3);
    expect(config.memorySearch.candidateMultiplier).toBe(4);
    expect(config.memorySearch.maxResults).toBe(6);
    expect(config.memorySearch.minScore).toBe(0.35);
    expect(config.memorySearch.crossSessionMemory).toBe(true);
  });

  it("selects local embeddings by default with auto provider", () => {
    const config = resolveConfig();
    const client = resolveEmbeddingClient(config.embeddings);
    expect(client.provider).toBe("local");
  });

  it("falls back to none when openai provider is missing credentials", () => {
    process.env.IRONBOT_EMBEDDINGS_PROVIDER = "openai";
    process.env.IRONBOT_EMBEDDINGS_FALLBACK = "none";
    const config = resolveConfig();
    const client = resolveEmbeddingClient(config.embeddings);
    expect(client.provider).toBe("none");
  });
});
