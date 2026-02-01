import fs from "node:fs";
import crypto from "node:crypto";
import type { EmbeddingsConfig } from "../config.ts";

export const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";
export const DEFAULT_GEMINI_MODEL = "gemini-embedding-001";
export const DEFAULT_LOCAL_MODEL = "hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf";

export type EmbeddingProvider = "auto" | "local" | "openai" | "gemini" | "none";

export type EmbeddingClient = {
  provider: Exclude<EmbeddingProvider, "auto">;
  model: string;
  embed: (texts: string[]) => Promise<number[][]>;
};

const isModelPathAvailable = (modelPath?: string): boolean => {
  if (!modelPath) return false;
  if (modelPath.startsWith("hf:")) return true;
  try {
    return fs.existsSync(modelPath);
  } catch {
    return false;
  }
};

const hashToken = (token: string): number => {
  const digest = crypto.createHash("sha256").update(token).digest();
  return digest.readUInt32BE(0);
};

const normalizeVector = (vector: number[]): number[] => {
  const sumSquares = vector.reduce((sum, value) => sum + value * value, 0);
  if (!sumSquares) return vector;
  const norm = Math.sqrt(sumSquares);
  return vector.map((value) => value / norm);
};

const embedWithHashing = async (texts: string[]): Promise<number[][]> => {
  const dimension = 384;
  return texts.map((text) => {
    const vector = new Array<number>(dimension).fill(0);
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const hash = hashToken(token);
      const index = hash % dimension;
      vector[index] += 1;
    }
    return normalizeVector(vector);
  });
};

const resolveOpenAiConfig = (config: EmbeddingsConfig) => {
  const apiKey = config.openai.apiKey ?? process.env.OPENAI_API_KEY;
  const baseUrl = config.openai.baseUrl ?? "https://api.openai.com/v1";
  const model = config.openai.model || DEFAULT_OPENAI_MODEL;
  return { apiKey, baseUrl, model };
};

const resolveGeminiConfig = (config: EmbeddingsConfig) => {
  const apiKey = config.gemini.apiKey ?? process.env.GEMINI_API_KEY;
  const baseUrl = config.gemini.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  const model = config.gemini.model || DEFAULT_GEMINI_MODEL;
  return { apiKey, baseUrl, model };
};

const buildOpenAiClient = (config: EmbeddingsConfig): EmbeddingClient | null => {
  const { apiKey, baseUrl, model } = resolveOpenAiConfig(config);
  if (!apiKey) return null;
  return {
    provider: "openai",
    model,
    embed: async (texts: string[]) => {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model, input: texts })
      });
      if (!response.ok) {
        throw new Error(`OpenAI embeddings request failed: ${response.status}`);
      }
      const data = (await response.json()) as { data?: Array<{ embedding: number[] }> };
      if (!data.data) return [];
      return data.data.map((item) => item.embedding);
    }
  };
};

const buildGeminiClient = (config: EmbeddingsConfig): EmbeddingClient | null => {
  const { apiKey, baseUrl, model } = resolveGeminiConfig(config);
  if (!apiKey) return null;
  return {
    provider: "gemini",
    model,
    embed: async (texts: string[]) => {
      const results: number[][] = [];
      for (const text of texts) {
        const response = await fetch(`${baseUrl}/models/${model}:embedContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: { parts: [{ text }] } })
        });
        if (!response.ok) {
          throw new Error(`Gemini embeddings request failed: ${response.status}`);
        }
        const data = (await response.json()) as { embedding?: { values?: number[] } };
        results.push(data.embedding?.values ?? []);
      }
      return results;
    }
  };
};

const buildLocalClient = (config: EmbeddingsConfig): EmbeddingClient | null => {
  const modelPath = config.local.modelPath || DEFAULT_LOCAL_MODEL;
  const hasModel = isModelPathAvailable(modelPath);
  if (!hasModel) return null;
  return {
    provider: "local",
    model: modelPath,
    embed: embedWithHashing
  };
};

const buildNoneClient = (): EmbeddingClient => ({
  provider: "none",
  model: "",
  embed: async () => []
});

const resolveClientForProvider = (
  provider: EmbeddingProvider,
  config: EmbeddingsConfig
): EmbeddingClient | null => {
  if (provider === "local") return buildLocalClient(config);
  if (provider === "openai") return buildOpenAiClient(config);
  if (provider === "gemini") return buildGeminiClient(config);
  if (provider === "none") return buildNoneClient();
  return null;
};

export const resolveEmbeddingClient = (config: EmbeddingsConfig): EmbeddingClient => {
  const provider = config.provider;

  if (provider === "auto") {
    const localClient = buildLocalClient(config);
    if (localClient) return localClient;
    const openAiClient = buildOpenAiClient(config);
    if (openAiClient) return openAiClient;
    const geminiClient = buildGeminiClient(config);
    if (geminiClient) return geminiClient;
    return buildNoneClient();
  }

  const direct = resolveClientForProvider(provider, config);
  if (direct && direct.provider !== "none") return direct;

  const fallback = config.fallback;
  if (fallback && fallback !== provider && fallback !== "auto") {
    const fallbackClient = resolveClientForProvider(fallback, config);
    if (fallbackClient) return fallbackClient;
  }

  return buildNoneClient();
};
