import { logger } from "../utils/logging.ts";
import { ClaudeProcessor } from "./claude_processor.ts";
import { PiAgentProcessor } from "./pi_agent_processor.ts";
import type { MemoryManager } from "../memory/manager.ts";
import type { AppConfig } from "../config.ts";

export type AgentProcessor = ClaudeProcessor | PiAgentProcessor;

export class AgentFactory {
  static create(config: AppConfig, skillDirs: string[], memoryManager?: MemoryManager): AgentProcessor {
    const provider = config.llmProvider.provider;

    logger.info({ provider }, "[AGENT-FACTORY] Creating agent processor");

    // Get the active provider's configuration using bracket notation (allows custom provider names)
    const providerConfig = (config.llmProvider as Record<string, any>)[provider];

    if (!providerConfig) {
      logger.error({ provider }, "[AGENT-FACTORY] Provider not configured");
      throw new Error(`Provider '${provider}' is not configured in llmProvider`);
    }

    // Route based on API type, not provider name
    const apiType = providerConfig.api ?? "anthropic"; // default to anthropic for backwards compatibility

    if (apiType === "anthropic") {
      logger.info({ provider, api: apiType }, "[AGENT-FACTORY] Using Claude Agent SDK (Anthropic API)");
      return new ClaudeProcessor(skillDirs, config, memoryManager);
    }

    if (apiType === "openai") {
      logger.info({ provider, api: apiType }, "[AGENT-FACTORY] Using Pi Agent (OpenAI-compatible API)");
      return new PiAgentProcessor(skillDirs, config, memoryManager);
    }

    // For any other API type, default to PiAgentProcessor
    logger.warn({ provider, api: apiType }, "[AGENT-FACTORY] Unknown API type, defaulting to Pi Agent");
    return new PiAgentProcessor(skillDirs, config, memoryManager);
  }
}
