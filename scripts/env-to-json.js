#!/usr/bin/env node

/**
 * Convert .env file to ironbot.json
 * Usage: node scripts/env-to-json.js [input-file] [output-file]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const inputFile = process.argv[2] || ".env";
const outputFile = process.argv[3] || "ironbot.json";

// Mapping from .env variable names to JSON paths
const envToJsonMap: Record<string, (value: string) => any> = {
  SLACK_BOT_TOKEN: (val) => ({ slack: { botToken: val } }),
  SLACK_APP_TOKEN: (val) => ({ slack: { appToken: val } }),
  ANTHROPIC_BASE_URL: (val) => ({ anthropic: { baseUrl: val } }),
  ANTHROPIC_AUTH_TOKEN: (val) => ({ anthropic: { authToken: val } }),
  ANTHROPIC_MODEL: (val) => ({ anthropic: { model: val } }),
  ANTHROPIC_API_KEY: (val) => ({ llmProvider: { anthropic: { apiKey: val } } }),
  OPENAI_API_KEY: (val) => ({ llmProvider: { openai: { apiKey: val } } }),
  OPENAI_MODEL: (val) => ({ llmProvider: { openai: { model: val } } }),
  OPENAI_BASE_URL: (val) => ({ llmProvider: { openai: { baseUrl: val } } }),
  GOOGLE_API_KEY: (val) => ({ llmProvider: { google: { apiKey: val } } }),
  GOOGLE_MODEL: (val) => ({ llmProvider: { google: { model: val } } }),
  GOOGLE_BASE_URL: (val) => ({ llmProvider: { google: { baseUrl: val } } }),
  LLM_PROVIDER: (val) => ({ llmProvider: { provider: val } }),
  SKILLS_DIR: (val) => ({ skills: { directory: val } }),
  DEBUG: (val) => ({ logging: { debug: val === "true" || val === "1" } }),
  LOG_LEVEL: (val) => ({ logging: { level: val } }),
  LOG_FILE: (val) => ({ logging: { file: val } }),
  PERMISSIONS_FILE: (val) => ({ permissions: { file: val } }),
  DEV_MODE: (val) => ({ dev: { mode: val === "true" || val === "1" } }),
  IRONBOT_CRON_STORE_PATH: (val) => ({ cron: { storePath: val } }),
  IRONBOT_SESSION_HISTORY_MAX: (val) => ({ sessions: { maxHistoryMessages: parseInt(val) } }),
  CLAUDE_MAX_TOOL_ITERATIONS: (val) => ({ claude_max_tool_iterations: parseInt(val) }),
  ANTHROPIC_TIMEOUT_MS: (val) => ({ anthropic_timeout_ms: parseInt(val) }),
};

function mergeObjects(target: any, source: any): any {
  for (const key in source) {
    if (typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== "object") {
        target[key] = {};
      }
      mergeObjects(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

try {
  // Check if input file exists
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  // Read .env file
  const envContent = fs.readFileSync(inputFile, "utf-8");
  const lines = envContent.split("\n");

  let config: any = {};

  // Parse .env file
  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Parse key=value
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();

    // Remove quotes if present
    const cleanValue = value.replace(/^["']|["']$/g, "");

    if (envToJsonMap[key]) {
      const jsonPart = envToJsonMap[key](cleanValue);
      config = mergeObjects(config, jsonPart);
    } else {
      // Warn about unmapped variables
      console.warn(`⚠️  Warning: Unmapped environment variable: ${key}`);
    }
  }

  // Check if output file exists
  if (fs.existsSync(outputFile)) {
    console.warn(`⚠️  Warning: File already exists: ${outputFile}`);
    const overwrite = process.argv[4] === "--force";
    if (!overwrite) {
      console.error("Use --force flag to overwrite");
      process.exit(1);
    }
  }

  // Write JSON config
  fs.writeFileSync(outputFile, JSON.stringify(config, null, 2) + "\n", "utf-8");

  console.log(`✅ Successfully converted ${inputFile} to ${outputFile}`);
  console.log(`📝 Total settings: ${Object.keys(config).length}`);
  console.log("\n📋 Configuration structure:");
  console.log(JSON.stringify(config, null, 2).split("\n").slice(0, 20).join("\n"));
  if (Object.keys(config).length > 10) {
    console.log("...\n");
  }
  console.log("\n💡 Next steps:");
  console.log("1. Review the generated ironbot.json file");
  console.log("2. Add any missing configuration values");
  console.log("3. Remove sensitive data from version control");
  console.log("4. Test the application with the new config");
} catch (error) {
  console.error("❌ Error during conversion:", error);
  process.exit(1);
}
