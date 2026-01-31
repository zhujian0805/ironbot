import { config as loadDotenv } from "dotenv";

loadDotenv();

type BooleanString = "true" | "false" | "1" | "0";

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (!value) return fallback;
  const normalized = value.toLowerCase() as BooleanString | string;
  return normalized === "true" || normalized === "1";
};

export type CliArgs = {
  debug?: boolean;
  logLevel?: string;
  logFile?: string;
  permissionsFile?: string;
  skipHealthChecks?: boolean;
};

export type AppConfig = {
  slackBotToken: string | undefined;
  slackAppToken: string | undefined;
  slackSigningSecret: string | undefined;
  anthropicBaseUrl: string | undefined;
  anthropicAuthToken: string | undefined;
  anthropicModel: string;
  skillsDir: string;
  permissionsFile: string;
  debug: boolean;
  logLevel: string;
  logFile: string | undefined;
  devMode: boolean;
  skipHealthChecks: boolean;
};

const loadBaseConfig = (): AppConfig => ({
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  slackAppToken: process.env.SLACK_APP_TOKEN,
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET,
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
  anthropicAuthToken: process.env.ANTHROPIC_AUTH_TOKEN,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "gpt-5-mini",
  skillsDir: process.env.SKILLS_DIR ?? "./skills",
  permissionsFile: process.env.PERMISSIONS_FILE ?? "./permissions.yaml",
  debug: parseBoolean(process.env.DEBUG),
  logLevel: process.env.LOG_LEVEL ?? "INFO",
  logFile: process.env.LOG_FILE,
  devMode: parseBoolean(process.env.DEV_MODE),
  skipHealthChecks: false
});

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
