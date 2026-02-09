import path from "node:path";
import { config as loadDotenv } from "dotenv";
import {
  resolveDefaultSessionStorePath,
  resolveSessionTranscriptsDir,
  resolveStateDir,
  resolveUserPath
} from "./sessions/paths.ts";
import { DEFAULT_AGENT_ID, DEFAULT_MAIN_SESSION_KEY } from "./sessions/session_key.ts";
import { resolveCronStorePath } from "./cron/store.ts";

loadDotenv();

type BooleanString = "true" | "false" | "1" | "0";

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (!value) return fallback;
  const normalized = value.toLowerCase() as BooleanString | string;
  return normalized === "true" || normalized === "1";
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = parseNumber(value, fallback);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
};

const parseStringArray = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) return fallback;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
};

export type EmbeddingProvider = "auto" | "local" | "openai" | "gemini" | "none";

const parseEmbeddingProvider = (value: string | undefined, fallback: EmbeddingProvider): EmbeddingProvider => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "auto" || normalized === "local" || normalized === "openai" || normalized === "gemini" || normalized === "none") {
    return normalized;
  }
  return fallback;
};

export type CliArgs = {
  debug?: boolean;
  logLevel?: string;
  logFile?: string;
  permissionsFile?: string;
  skipHealthChecks?: boolean;
};

export type SessionsConfig = {
  storePath: string;
  transcriptsDir: string;
  dmSessionKey: string;
  maxHistoryMessages: number;
};

export type MemoryConfig = {
  workspaceDir: string;
  sessionIndexing: boolean;
};

export type MemorySearchConfig = {
  enabled: boolean;
  vectorWeight: number;
  textWeight: number;
  candidateMultiplier: number;
  maxResults: number;
  minScore: number;
  sources: Array<"memory" | "sessions">;
  crossSessionMemory: boolean;
  storePath?: string;
};

export type SlackRetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type SlackRateLimitConfig = {
  enabled: boolean;
  requestsPerSecond: number;
  burstCapacity: number;
  queueSize: number;
};

export type AutoRoutingConfig = {
  enabled: boolean;
  confidenceThreshold: number;
  optOutSkills: string[];
};

export type EmbeddingsConfig = {
  provider: EmbeddingProvider;
  fallback: EmbeddingProvider;
  local: {
    modelPath: string;
    modelCacheDir?: string;
  };
  openai: {
    apiKey?: string;
    baseUrl?: string;
    model: string;
  };
  gemini: {
    apiKey?: string;
    baseUrl?: string;
    model: string;
  };
};

export type RetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type AppConfig = {
  slackBotToken: string | undefined;
  slackAppToken: string | undefined;
  anthropicBaseUrl: string | undefined;
  anthropicAuthToken: string | undefined;
  anthropicModel: string;
  skillsDir: string;
  stateSkillsDir: string;
  skillDirs: string[];
  permissionsFile: string;
  debug: boolean;
  logLevel: string;
  logFile: string | undefined;
  devMode: boolean;
  skipHealthChecks: boolean;
  sessions: SessionsConfig;
  memory: MemoryConfig;
  memorySearch: MemorySearchConfig;
  embeddings: EmbeddingsConfig;
  retry: RetryConfig;
  slackRetry: SlackRetryConfig;
  slackRateLimit: SlackRateLimitConfig;
  autoRouting: AutoRoutingConfig;
  anthropicTimeoutMs: number;
  cron: CronConfig;
  maxToolIterations: number;
};

export type CronConfig = {
  enabled: boolean;
  storePath: string;
};

const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";
const DEFAULT_GEMINI_MODEL = "gemini-embedding-001";
const DEFAULT_LOCAL_MODEL = "hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf";

const loadBaseConfig = (): AppConfig => {
  const stateDir = resolveStateDir();
  const defaultWorkspace = path.join(stateDir, "workspace");
  const storePath = resolveUserPath(
    process.env.IRONBOT_SESSIONS_STORE_PATH ?? resolveDefaultSessionStorePath(DEFAULT_AGENT_ID)
  );
  const transcriptsDir = resolveUserPath(
    process.env.IRONBOT_SESSIONS_TRANSCRIPTS_DIR ?? resolveSessionTranscriptsDir()
  );
  const memoryStorePath = resolveUserPath(
    process.env.IRONBOT_MEMORY_INDEX_PATH ?? path.join(stateDir, "memory", `${DEFAULT_AGENT_ID}.sqlite`)
  );

  const baseSkillsDir = resolveUserPath(process.env.SKILLS_DIR ?? path.join(process.cwd(), "skills"));
  const stateSkillsDir = resolveUserPath(path.join(stateDir, "skills"));
  const dedupedSkillDirs = [baseSkillsDir, stateSkillsDir];

  return {
    slackBotToken: process.env.SLACK_BOT_TOKEN,
    slackAppToken: process.env.SLACK_APP_TOKEN,
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
    anthropicAuthToken: process.env.ANTHROPIC_AUTH_TOKEN,
    anthropicModel: process.env.ANTHROPIC_MODEL ?? "gpt-5-mini",
    skillsDir: baseSkillsDir,
    stateSkillsDir,
    skillDirs: dedupedSkillDirs,
    permissionsFile: process.env.PERMISSIONS_FILE ?? "./permissions.yaml",
    debug: parseBoolean(process.env.DEBUG),
    logLevel: process.env.LOG_LEVEL ?? "INFO",
    logFile: process.env.LOG_FILE,
    devMode: parseBoolean(process.env.DEV_MODE),
    skipHealthChecks: false,
    sessions: {
      storePath,
      transcriptsDir,
      dmSessionKey: process.env.IRONBOT_DM_SESSION_KEY ?? DEFAULT_MAIN_SESSION_KEY,
      maxHistoryMessages: parseInteger(process.env.IRONBOT_SESSION_HISTORY_MAX, 12)
    },
    memory: {
      workspaceDir: resolveUserPath(process.env.IRONBOT_MEMORY_WORKSPACE_DIR ?? defaultWorkspace),
      sessionIndexing: parseBoolean(process.env.IRONBOT_MEMORY_SESSION_INDEXING, false) || parseBoolean(process.env.IRONBOT_MEMORY_CROSS_SESSION, true)
    },
    memorySearch: {
      enabled: parseBoolean(process.env.IRONBOT_MEMORY_SEARCH_ENABLED, true),
      vectorWeight: parseNumber(process.env.IRONBOT_MEMORY_VECTOR_WEIGHT, 0.7),
      textWeight: parseNumber(process.env.IRONBOT_MEMORY_TEXT_WEIGHT, 0.3),
      candidateMultiplier: parseInteger(process.env.IRONBOT_MEMORY_CANDIDATE_MULTIPLIER, 4),
      maxResults: parseInteger(process.env.IRONBOT_MEMORY_MAX_RESULTS, 6),
      minScore: parseNumber(process.env.IRONBOT_MEMORY_MIN_SCORE, 0.35),
      sources: parseStringArray(process.env.IRONBOT_MEMORY_SOURCES, ["memory"]) as Array<"memory" | "sessions">,
      crossSessionMemory: parseBoolean(process.env.IRONBOT_MEMORY_CROSS_SESSION, true),
      storePath: memoryStorePath
    },
    embeddings: {
      provider: parseEmbeddingProvider(process.env.IRONBOT_EMBEDDINGS_PROVIDER, "auto"),
      fallback: parseEmbeddingProvider(process.env.IRONBOT_EMBEDDINGS_FALLBACK, "none"),
      local: {
        modelPath: process.env.IRONBOT_EMBEDDINGS_LOCAL_MODEL ?? DEFAULT_LOCAL_MODEL,
        modelCacheDir: process.env.IRONBOT_EMBEDDINGS_LOCAL_CACHE
      },
      openai: {
        apiKey: process.env.IRONBOT_OPENAI_API_KEY,
        baseUrl: process.env.IRONBOT_OPENAI_BASE_URL,
        model: process.env.IRONBOT_OPENAI_EMBEDDINGS_MODEL ?? DEFAULT_OPENAI_MODEL
      },
      gemini: {
        apiKey: process.env.IRONBOT_GEMINI_API_KEY,
        baseUrl: process.env.IRONBOT_GEMINI_BASE_URL,
        model: process.env.IRONBOT_GEMINI_EMBEDDINGS_MODEL ?? DEFAULT_GEMINI_MODEL
      }
    },
    retry: {
      maxAttempts: parseInteger(process.env.IRONBOT_RETRY_MAX_ATTEMPTS, 3),
      baseDelayMs: parseInteger(process.env.IRONBOT_RETRY_BASE_DELAY_MS, 2000), // Increased from 1000 to 2000ms
      maxDelayMs: parseInteger(process.env.IRONBOT_RETRY_MAX_DELAY_MS, 60000), // Increased from 30000 to 60000ms
      backoffMultiplier: parseNumber(process.env.IRONBOT_RETRY_BACKOFF_MULTIPLIER, 2),
      jitterMax: parseNumber(process.env.IRONBOT_RETRY_JITTER_MAX, 0.1)
    },
    slackRateLimit: {
      enabled: parseBoolean(process.env.SLACK_RATE_LIMIT_ENABLED, true),
      requestsPerSecond: parseInteger(process.env.SLACK_RATE_LIMIT_RPS, 2), // Reduced from 5 to 2 to prevent rate limiting
      burstCapacity: parseInteger(process.env.SLACK_RATE_LIMIT_BURST, 5),  // Reduced from 10 to 5 to prevent rate limiting
      queueSize: parseInteger(process.env.SLACK_RATE_LIMIT_QUEUE_SIZE, 20) // Reduced from 50 to 20
    },
    slackRetry: {
      maxAttempts: parseInteger(process.env.IRONBOT_SLACK_RETRY_MAX_ATTEMPTS, 5), // Increased to 5 for more resilience
      baseDelayMs: parseInteger(process.env.IRONBOT_SLACK_RETRY_BASE_DELAY_MS, 15000), // Increased to 15 seconds to avoid aggressive retries
      maxDelayMs: parseInteger(process.env.IRONBOT_SLACK_RETRY_MAX_DELAY_MS, 300000) // Increased to 5 minutes max for stability
    },
    autoRouting: {
      enabled: parseBoolean(process.env.CLAUDE_AUTO_ROUTE_ENABLED, true),
      confidenceThreshold: parseNumber(process.env.CLAUDE_AUTO_ROUTE_CONFIDENCE, 0.5),
      optOutSkills: parseStringArray(process.env.CLAUDE_AUTO_ROUTE_OPTOUT, [])
    },
    anthropicTimeoutMs: parseInteger(process.env.ANTHROPIC_TIMEOUT_MS, 60000),
    cron: {
      enabled: !parseBoolean(process.env.IRONBOT_SKIP_CRON),
      storePath: resolveCronStorePath(process.env.IRONBOT_CRON_STORE_PATH)
    },
    maxToolIterations: parseInteger(process.env.CLAUDE_MAX_TOOL_ITERATIONS, 10)
  };
};

export const resolveConfig = (cliArgs: CliArgs = {}): AppConfig => {
  const base = loadBaseConfig();

  return {
    ...base,
    debug: cliArgs.debug ?? base.debug,
    logLevel: cliArgs.logLevel ?? base.logLevel,
    logFile: cliArgs.logFile ?? base.logFile,
    permissionsFile: cliArgs.permissionsFile ?? base.permissionsFile,
    skipHealthChecks: cliArgs.skipHealthChecks ?? base.skipHealthChecks
  };
};
