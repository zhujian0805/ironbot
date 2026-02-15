import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import {
  resolveDefaultSessionStorePath,
  resolveSessionTranscriptsDir,
  resolveStateDir,
  resolveUserPath
} from "./sessions/paths.ts";
import { DEFAULT_AGENT_ID, DEFAULT_MAIN_SESSION_KEY } from "./sessions/session_key.ts";
import { resolveCronStorePath } from "./cron/store.ts";

type BooleanString = "true" | "false" | "1" | "0";

const parseBoolean = (value: string | boolean | undefined, fallback = false): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).toLowerCase() as BooleanString | string;
  return normalized === "true" || normalized === "1";
};

const parseNumber = (value: string | number | undefined, fallback: number): number => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseInteger = (value: string | number | undefined, fallback: number): number => {
  const parsed = parseNumber(value, fallback);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
};

const parseStringArray = (value: string | string[] | undefined, fallback: string[]): string[] => {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  const items = String(value)
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

const parseLlmProvider = (value: string | undefined): LlmProvider => {
  if (!value) {
    return "anthropic"; // default to anthropic
  }
  // Accept any provider name (custom or predefined)
  // Validation happens at runtime when checking if the provider is configured
  return value.trim().toLowerCase() as LlmProvider;
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

// Allows both predefined providers and custom provider names
export type LlmProvider = "anthropic" | "openai" | "google" | "groq" | "mistral" | "cerebras" | "xai" | "bedrock" | "alibaba" | "anthropic-compatible" | (string & {});

export type LlmApiType = "anthropic" | "openai";

export type LlmProviderConfig = {
  provider: LlmProvider;
  anthropic?: {
    api?: LlmApiType;
    apiKey?: string;
    baseUrl?: string;
    model: string;
  };
  openai?: {
    api?: LlmApiType;
    apiKey?: string;
    baseUrl?: string;
    model: string;
  };
  google?: {
    api?: LlmApiType;
    apiKey?: string;
    baseUrl?: string;
    model: string;
  };
  alibaba?: {
    api?: LlmApiType;
    apiKey?: string;
    baseUrl?: string;
    model: string;
  };
  anthropicCompatible?: {
    api?: LlmApiType;
    apiKey?: string;
    baseUrl?: string;
    model: string;
  };
  // Allow custom providers with any name (e.g., "copilot-api", "my-provider", etc.)
  [key: string]: {
    api?: LlmApiType;
    apiKey?: string;
    baseUrl?: string;
    model: string;
  } | LlmProvider | undefined;
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
  backoffMultiplier: number;
  jitterMax: number; // Maximum jitter as fraction of delay (0.1 = 10%)
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
  llmProvider: LlmProviderConfig;
};

export type CronConfig = {
  enabled: boolean;
  storePath: string;
};

const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";
const DEFAULT_GEMINI_MODEL = "gemini-embedding-001";
const DEFAULT_LOCAL_MODEL = "hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf";

// JSON Configuration loading
type JsonConfig = Partial<{
  slack: {
    botToken: string;
    appToken: string;
  };
  anthropic: {
    baseUrl: string;
    authToken: string;
    model: string;
  };
  llmProvider: {
    provider: LlmProvider;
    anthropic: {
      api: string;
      apiKey: string;
      baseUrl: string;
      model: string;
    };
    openai: {
      api: string;
      apiKey: string;
      baseUrl: string;
      model: string;
    };
    google: {
      api: string;
      apiKey: string;
      baseUrl: string;
      model: string;
    };
    alibaba: {
      api: string;
      apiKey: string;
      baseUrl: string;
      model: string;
    };
    anthropicCompatible: {
      api: string;
      apiKey: string;
      baseUrl: string;
      model: string;
    };
  };
  skills: {
    directory: string;
  };
  logging: {
    debug: boolean;
    level: string;
    file: string;
  };
  permissions: {
    file: string;
  };
  dev: {
    mode: boolean;
  };
  cron: {
    enabled: boolean;
    storePath: string;
  };
  sessions: {
    storePath: string;
    transcriptsDir: string;
    dmSessionKey: string;
    maxHistoryMessages: number;
  };
  memory: {
    workspaceDir: string;
    sessionIndexing: boolean;
  };
  memorySearch: {
    enabled: boolean;
    vectorWeight: number;
    textWeight: number;
    candidateMultiplier: number;
    maxResults: number;
    minScore: number;
    sources: Array<"memory" | "sessions">;
    crossSessionMemory: boolean;
    storePath: string;
  };
  embeddings: {
    provider: EmbeddingProvider;
    fallback: EmbeddingProvider;
    local: {
      modelPath: string;
      modelCacheDir: string;
    };
    openai: {
      apiKey: string;
      baseUrl: string;
      model: string;
    };
    gemini: {
      apiKey: string;
      baseUrl: string;
      model: string;
    };
  };
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitterMax: number;
  };
  slack_retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  slack_rate_limit: {
    enabled: boolean;
    requestsPerSecond: number;
    burstCapacity: number;
    queueSize: number;
  };
  auto_routing: {
    enabled: boolean;
    confidenceThreshold: number;
    optOutSkills: string[];
  };
  anthropic_timeout_ms: number;
  claude_max_tool_iterations: number;
}>;

function loadJsonConfig(configPath: string): JsonConfig {
  try {
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as JsonConfig;
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config file ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

function findConfigFile(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || homedir();

  // Check for config file in order of precedence
  const candidates = [
    process.env.IRONBOT_CONFIG,
    path.join(homeDir, ".ironbot", "ironbot.json"),
    path.join(process.cwd(), "ironbot.json"),
    path.join(process.cwd(), "config", "ironbot.json")
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      console.log(`[CONFIG] Loaded from: ${candidate}`);
      return candidate;
    }
  }

  // No config file found - provide helpful error
  const suggestions = [
    `  1. Create ~/.ironbot/ironbot.json (global config)`,
    `  2. Or create ironbot.json in your project directory`,
    `  3. Or copy from template: cp ironbot.json.example ironbot.json`,
    `  4. Or set IRONBOT_CONFIG environment variable to point to config file`,
    ``,
    `  Checked locations (in order):`,
    ...candidates.map(c => `    - ${c}`)
  ];

  throw new Error(
    `Configuration file not found. Ironbot requires ironbot.json.\n\n${suggestions.join('\n')}`
  );
}

const loadBaseConfig = (): AppConfig => {
  // Load JSON config - this is mandatory
  const configPath = findConfigFile();
  const jsonConfig = loadJsonConfig(configPath);

  const stateDir = resolveStateDir();
  const defaultWorkspace = path.join(stateDir, "workspace");

  // Validate required fields
  if (!jsonConfig.slack?.botToken) {
    throw new Error("Configuration error: slack.botToken is required in ironbot.json");
  }
  if (!jsonConfig.slack?.appToken) {
    throw new Error("Configuration error: slack.appToken is required in ironbot.json");
  }
  if (!jsonConfig.llmProvider?.provider) {
    throw new Error("Configuration error: llmProvider.provider is required in ironbot.json");
  }

  // Resolve session paths
  const storePath = resolveUserPath(
    jsonConfig.sessions?.storePath ?? resolveDefaultSessionStorePath(DEFAULT_AGENT_ID)
  );
  const transcriptsDir = resolveUserPath(
    jsonConfig.sessions?.transcriptsDir ?? resolveSessionTranscriptsDir()
  );
  const memoryStorePath = resolveUserPath(
    path.join(stateDir, "memory", `${DEFAULT_AGENT_ID}.sqlite`)
  );

  // Resolve skills directories
  const baseSkillsDir = resolveUserPath(
    jsonConfig.skills?.directory ?? path.join(process.cwd(), "skills")
  );
  const stateSkillsDir = resolveUserPath(path.join(stateDir, "skills"));
  const dedupedSkillDirs = [baseSkillsDir, stateSkillsDir];

  // Resolve LLM provider
  const provider = parseLlmProvider(jsonConfig.llmProvider.provider);

  // Helper function to get default model names for known providers
  const getDefaultModel = (providerName: string): string => {
    const defaults: Record<string, string> = {
      anthropic: "claude-3-5-sonnet-20241022",
      openai: "gpt-4o",
      google: "gemini-2.0-flash",
      alibaba: "qwen-max-latest",
      "anthropic-compatible": "grok-code-fast-1",
      "copilot-api": "grok-code-fast-1"
    };
    return defaults[providerName] || "gpt-4o"; // fallback to gpt-4o for unknown providers
  };

  return {
    slackBotToken: jsonConfig.slack.botToken,
    slackAppToken: jsonConfig.slack.appToken,
    anthropicBaseUrl: jsonConfig.anthropic?.baseUrl,
    anthropicAuthToken: jsonConfig.anthropic?.authToken,
    anthropicModel: jsonConfig.anthropic?.model ?? "claude-3-5-sonnet-20241022",
    skillsDir: baseSkillsDir,
    stateSkillsDir,
    skillDirs: dedupedSkillDirs,
    permissionsFile: jsonConfig.permissions?.file
      ? path.resolve(jsonConfig.permissions.file)
      : path.resolve("./permissions.yaml"),
    debug: parseBoolean(jsonConfig.logging?.debug, false),
    logLevel: jsonConfig.logging?.level ?? "INFO",
    logFile: jsonConfig.logging?.file,
    devMode: parseBoolean(jsonConfig.dev?.mode, false),
    skipHealthChecks: false,
    sessions: {
      storePath,
      transcriptsDir,
      dmSessionKey: jsonConfig.sessions?.dmSessionKey ?? DEFAULT_MAIN_SESSION_KEY,
      maxHistoryMessages: parseInteger(jsonConfig.sessions?.maxHistoryMessages, 12)
    },
    memory: {
      workspaceDir: resolveUserPath(jsonConfig.memory?.workspaceDir ?? defaultWorkspace),
      sessionIndexing: parseBoolean(jsonConfig.memory?.sessionIndexing, false)
    },
    memorySearch: {
      enabled: parseBoolean(jsonConfig.memorySearch?.enabled, true),
      vectorWeight: parseNumber(jsonConfig.memorySearch?.vectorWeight, 0.7),
      textWeight: parseNumber(jsonConfig.memorySearch?.textWeight, 0.3),
      candidateMultiplier: parseInteger(jsonConfig.memorySearch?.candidateMultiplier, 4),
      maxResults: parseInteger(jsonConfig.memorySearch?.maxResults, 6),
      minScore: parseNumber(jsonConfig.memorySearch?.minScore, 0.35),
      sources: parseStringArray(jsonConfig.memorySearch?.sources, ["memory"]) as Array<"memory" | "sessions">,
      crossSessionMemory: parseBoolean(jsonConfig.memorySearch?.crossSessionMemory, true),
      storePath: memoryStorePath
    },
    embeddings: {
      provider: parseEmbeddingProvider(jsonConfig.embeddings?.provider, "auto"),
      fallback: parseEmbeddingProvider(jsonConfig.embeddings?.fallback, "none"),
      local: {
        modelPath: jsonConfig.embeddings?.local?.modelPath ?? DEFAULT_LOCAL_MODEL,
        modelCacheDir: jsonConfig.embeddings?.local?.modelCacheDir
      },
      openai: {
        apiKey: jsonConfig.embeddings?.openai?.apiKey,
        baseUrl: jsonConfig.embeddings?.openai?.baseUrl,
        model: jsonConfig.embeddings?.openai?.model ?? DEFAULT_OPENAI_MODEL
      },
      gemini: {
        apiKey: jsonConfig.embeddings?.gemini?.apiKey,
        baseUrl: jsonConfig.embeddings?.gemini?.baseUrl,
        model: jsonConfig.embeddings?.gemini?.model ?? DEFAULT_GEMINI_MODEL
      }
    },
    retry: {
      maxAttempts: parseInteger(jsonConfig.retry?.maxAttempts, 3),
      baseDelayMs: parseInteger(jsonConfig.retry?.baseDelayMs, 2000),
      maxDelayMs: parseInteger(jsonConfig.retry?.maxDelayMs, 60000),
      backoffMultiplier: parseNumber(jsonConfig.retry?.backoffMultiplier, 2.0),
      jitterMax: parseNumber(jsonConfig.retry?.jitterMax, 0.1)
    },
    slackRateLimit: {
      enabled: parseBoolean(jsonConfig.slack_rate_limit?.enabled, true),
      requestsPerSecond: parseInteger(jsonConfig.slack_rate_limit?.requestsPerSecond, 2),
      burstCapacity: parseInteger(jsonConfig.slack_rate_limit?.burstCapacity, 5),
      queueSize: parseInteger(jsonConfig.slack_rate_limit?.queueSize, 20)
    },
    slackRetry: {
      maxAttempts: parseInteger(jsonConfig.slack_retry?.maxAttempts, 5),
      baseDelayMs: parseInteger(jsonConfig.slack_retry?.baseDelayMs, 15000),
      maxDelayMs: parseInteger(jsonConfig.slack_retry?.maxDelayMs, 300000)
    },
    autoRouting: {
      enabled: parseBoolean(jsonConfig.auto_routing?.enabled, true),
      confidenceThreshold: parseNumber(jsonConfig.auto_routing?.confidenceThreshold, 0.5),
      optOutSkills: parseStringArray(jsonConfig.auto_routing?.optOutSkills, [])
    },
    anthropicTimeoutMs: parseInteger(jsonConfig.anthropic_timeout_ms, 60000),
    cron: {
      enabled: parseBoolean(jsonConfig.cron?.enabled, true),
      storePath: resolveCronStorePath(jsonConfig.cron?.storePath)
    },
    maxToolIterations: parseInteger(jsonConfig.claude_max_tool_iterations, 10),
    llmProvider: {
      provider,
      // Dynamically load all configured providers (including custom ones)
      ...Object.fromEntries(
        Object.entries(jsonConfig.llmProvider || {})
          .filter(([key]) => key !== "provider") // Skip the "provider" key itself
          .map(([key, config]: [string, any]) => [
            key,
            {
              api: config?.api ?? (key === "alibaba" ? "openai" : key === "anthropic-compatible" ? "anthropic" : key),
              apiKey: config?.apiKey,
              baseUrl: config?.baseUrl,
              model: config?.model ?? getDefaultModel(key)
            }
          ])
      )
    }
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
