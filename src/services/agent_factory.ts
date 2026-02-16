import { logger } from "../utils/logging.ts";
import { ClaudeProcessor } from "./claude_processor.ts";
import { PiAgentProcessor } from "./pi_agent_processor.ts";
import { ModelResolver } from "./model_resolver.ts";
import type { MemoryManager } from "../memory/manager.ts";
import type { AppConfig } from "../config.ts";

export type AgentProcessor = ClaudeProcessor | PiAgentProcessor;

export class AgentFactory {
  static create(config: AppConfig, skillDirs: string[], memoryManager?: MemoryManager): AgentProcessor {
    // Initialize ModelResolver
    const modelResolver = new ModelResolver(config.models);

    // Determine which provider to use based on the default model
    let providerId: string;

    if (config.agents?.model) {
      // Extract provider from "provider/model-id" format
      const parts = config.agents.model.split('/');
      if (parts.length >= 2) {
        providerId = parts[0];
      } else {
        throw new Error(`Invalid model reference format: "${config.agents.model}". Expected "provider/model-id"`);
      }
    } else {
      // Fall back to first provider if no default model is specified
      providerId = Object.keys(config.models.providers)[0];
    }

    if (!providerId) {
      logger.error("No providers configured in models");
      throw new Error("At least one LLM provider must be configured in models.providers");
    }

    const providerConfig = config.models.providers[providerId];
    if (!providerConfig || providerConfig.models.length === 0) {
      logger.error({ provider: providerId }, "[AGENT-FACTORY] Provider has no models");
      throw new Error(`Provider '${providerId}' has no models configured`);
    }

    // Use provider's API type, or default to anthropic
    const apiType = providerConfig.api ?? "anthropic";

    logger.info(
      { provider: providerId, apiType, modelCount: providerConfig.models.length, defaultModel: config.agents?.model },
      "[AGENT-FACTORY] Creating agent processor"
    );

    if (apiType === "anthropic") {
      logger.info({ provider: providerId, api: apiType }, "[AGENT-FACTORY] Using Claude Agent SDK (Anthropic API)");
      return new ClaudeProcessor(skillDirs, config, memoryManager, modelResolver);
    }

    if (apiType === "openai") {
      logger.info({ provider: providerId, api: apiType }, "[AGENT-FACTORY] Using Pi Agent (OpenAI-compatible API)");
      return new PiAgentProcessor(skillDirs, config, memoryManager, modelResolver);
    }

    // For any other API type, default to PiAgentProcessor
    logger.warn({ provider: providerId, api: apiType }, "[AGENT-FACTORY] Unknown API type, defaulting to Pi Agent");
    return new PiAgentProcessor(skillDirs, config, memoryManager, modelResolver);
  }
}
