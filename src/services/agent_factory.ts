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

    if (provider === "anthropic" || provider === "anthropic-compatible") {
      logger.info("Using Claude Agent SDK (Anthropic-compatible provider)");
      return new ClaudeProcessor(skillDirs, config, memoryManager);
    }

    logger.info({ provider }, "Using Pi Agent (multi-provider support)");
    return new PiAgentProcessor(skillDirs, config, memoryManager);
  }
}
