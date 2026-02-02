export type HybridSearchConfig = {
  vectorWeight: number;
  textWeight: number;
  candidateMultiplier: number;
  maxResults: number;
  minScore: number;
};

export type MemoryChunk = {
  id: number;
  content: string;
  embedding?: number[];
  source: "memory" | "sessions";
  path: string;
  sessionKey?: string | null;
};

export type MemoryHit = MemoryChunk & {
  score: number;
  vectorScore: number;
  textScore: number;
};

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/\W+/)
    .map((token) => token.trim())
    .filter(Boolean);

export { tokenize };

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (!a.length || !b.length) return 0;
  const size = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < size; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
};

const jaccardSimilarity = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const normalizeHybridWeights = (config: HybridSearchConfig): HybridSearchConfig => {
  const vectorWeight = clamp(config.vectorWeight, 0, 1);
  const textWeight = clamp(config.textWeight, 0, 1);
  const sum = vectorWeight + textWeight;
  const normalizedVector = sum > 0 ? vectorWeight / sum : 0.7;
  const normalizedText = sum > 0 ? textWeight / sum : 0.3;
  return {
    ...config,
    vectorWeight: normalizedVector,
    textWeight: normalizedText,
    candidateMultiplier: Math.max(1, Math.round(config.candidateMultiplier)),
    maxResults: Math.max(1, Math.round(config.maxResults)),
    minScore: clamp(config.minScore, 0, 1)
  };
};

export const hybridSearch = (params: {
  query: string;
  queryEmbedding?: number[];
  chunks: MemoryChunk[];
  config: HybridSearchConfig;
}): MemoryHit[] => {
  const config = normalizeHybridWeights(params.config);
  const tokens = tokenize(params.query);

  const scored: MemoryHit[] = params.chunks.map((chunk) => {
    const textScore = config.textWeight > 0 ? jaccardSimilarity(tokens, tokenize(chunk.content)) : 0;
    const vectorScore =
      config.vectorWeight > 0 && params.queryEmbedding && chunk.embedding
        ? cosineSimilarity(params.queryEmbedding, chunk.embedding)
        : 0;
    const score = config.vectorWeight * vectorScore + config.textWeight * textScore;
    return { ...chunk, score, textScore, vectorScore };
  });

  const vectorCandidates = config.vectorWeight > 0
    ? [...scored].sort((a, b) => b.vectorScore - a.vectorScore)
    : [];
  const textCandidates = config.textWeight > 0
    ? [...scored].sort((a, b) => b.textScore - a.textScore)
    : [];

  const candidateCount = Math.max(1, config.maxResults * config.candidateMultiplier);
  const candidateSet = new Map<number, MemoryHit>();

  for (const candidate of vectorCandidates.slice(0, candidateCount)) {
    candidateSet.set(candidate.id, candidate);
  }
  for (const candidate of textCandidates.slice(0, candidateCount)) {
    candidateSet.set(candidate.id, candidate);
  }

  const combined = Array.from(candidateSet.values())
    .filter((hit) => hit.score >= config.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, config.maxResults);

  return combined;
};
