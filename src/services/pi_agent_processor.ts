import { logger } from "../utils/logging.ts";
import type { AppConfig } from "../config.ts";
import type { MemoryManager } from "../memory/manager.ts";
import type { SkillContext } from "./skill_context.ts";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { SkillLoader, type SkillInfo } from "./skill_loader.ts";
import { ToolExecutor, getAllowedTools, type ToolResult, type ToolDefinition, TOOLS } from "./tools.ts";
import { RetryManager } from "./retry_manager.ts";
import { OpenAI } from "openai";

// Wrapper type to match the ClaudeProcessor interface
type OperationRecord = {
  kind: "tool" | "skill";
  name: string;
  status?: "success" | "denied" | "error";
  command?: string;
  resourcePath?: string;
  workingDirectory?: string;
  reason?: string;
  result?: string;
  toolResult?: ToolResult;
};

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to system tools. You can execute PowerShell commands, Bash commands, read and write files, and list directory contents.

**CRITICAL RULES:**
1. ALWAYS use tools to get information - NEVER make up or guess command output
2. You MUST execute the appropriate tool for EVERY request that asks for system information
3. NEVER respond with example or fake data - only use actual tool output
4. If asked about system information (hostname, disks, printers, processes, etc.), you MUST use run_powershell or run_bash

**SKILL SELECTION (Progressive Disclosure Pattern):**
Before responding, scan the <available_skills> list:
- If exactly one skill clearly applies: use the read_skill tool to load its full documentation, then follow its instructions
- If multiple could apply: choose the most specific one, then use read_skill to load and follow it
- If none clearly apply: do not use read_skill, proceed with normal tool usage
- NEVER load more than one skill's documentation upfront - only load after selecting

**TASK PLANNING (MANDATORY for complex requests):**
When given a complex, multi-step task (like "show X, save to file, then email it"):
1. **Plan First**: Break the task into numbered steps before executing
2. **Execute Sequentially**: Complete each step fully before moving to the next
3. **Show Your Work**: After each step, report what was done and the results
4. **Verify Completion**: Confirm each step succeeded before proceeding
5. **Final Summary**: At the end, provide a complete summary of all steps and outcomes

Be helpful, concise, and safe. Never execute destructive commands without explicit user confirmation.`;

export class PiAgentProcessor {
  private skillLoader: SkillLoader;
  private skills: Record<string, SkillInfo> = {};
  private skillsLoaded = false;
  private toolExecutor: ToolExecutor;
  private retryManager: RetryManager;
  private memoryManager?: MemoryManager;
  private config: AppConfig;
  private devMode: boolean;
  private provider: string;
  private model: string = "";
  private apiKey?: string;
  private baseUrl?: string;

  constructor(skillDirs: string[], config: AppConfig, memoryManager?: MemoryManager) {
    this.config = config;
    this.skillLoader = new SkillLoader(skillDirs);
    this.memoryManager = memoryManager;
    this.devMode = config.devMode;
    this.retryManager = new RetryManager(config.retry);
    this.toolExecutor = new ToolExecutor(undefined, this.retryManager, []);

    // Initialize provider-specific settings
    this.provider = config.llmProvider.provider;
    this.initializeProviderSettings();

    logger.info(
      {
        provider: this.provider,
        model: this.model,
        skillDirs,
        hasMemoryManager: !!memoryManager,
        hasApiKey: !!this.apiKey
      },
      "[INIT] PiAgentProcessor initialized"
    );
  }

  private initializeProviderSettings(): void {
    switch (this.provider) {
      case "openai":
        if (this.config.llmProvider.openai) {
          this.model = this.config.llmProvider.openai.model;
          this.apiKey = this.config.llmProvider.openai.apiKey;
          this.baseUrl = this.config.llmProvider.openai.baseUrl;
        }
        break;
      case "google":
        if (this.config.llmProvider.google) {
          this.model = this.config.llmProvider.google.model;
          this.apiKey = this.config.llmProvider.google.apiKey;
          this.baseUrl = this.config.llmProvider.google.baseUrl;
        }
        break;
      case "anthropic":
      default:
        if (this.config.llmProvider.anthropic) {
          this.model = this.config.llmProvider.anthropic.model;
          this.apiKey = this.config.llmProvider.anthropic.apiKey;
          this.baseUrl = this.config.llmProvider.anthropic.baseUrl;
        }
        break;
    }

    if (!this.apiKey) {
      logger.warn(
        { provider: this.provider },
        "[PI-AGENT] No API key configured for provider - connection tests will fail"
      );
    }

    if (!this.model) {
      logger.warn(
        { provider: this.provider },
        "[PI-AGENT] No model configured for provider - using provider defaults"
      );
    }
  }

  private async ensureSkillsLoaded(): Promise<void> {
    if (!this.skillsLoaded) {
      logger.debug("[SKILL-FLOW] Skills not loaded yet, loading now");
      await this.skillLoader.loadSkills();
      const skillInfos = this.skillLoader.getSkillInfo();
      this.skills = skillInfos;
      this.skillsLoaded = true;

      const skillInfoList = Object.values(this.skills).map((skill) => ({
        name: skill.name,
        description: skill.metadata?.description,
        documentation: skill.documentation,
        isExecutable: !skill.isDocumentationSkill
      }));
      this.toolExecutor.setSkills(skillInfoList);

      logger.info(
        { loadedSkillCount: Object.keys(this.skills).length, skillNames: Object.keys(this.skills) },
        "[SKILL-FLOW] Skills loaded and cached"
      );
    }
  }

  private formatSkillsForPrompt(): string {
    const skillList = Object.values(this.skills);
    if (skillList.length === 0) {
      return "\n\n<available_skills>\nNo skills available.\n</available_skills>";
    }

    const skillEntries = skillList
      .map((skill) => {
        const name = skill.name;
        const description = skill.metadata?.description || "No description provided";
        return `  - ${name}: ${description}`;
      })
      .join("\n");

    return `\n\n<available_skills>\n${skillEntries}\n</available_skills>\n\nTo use a skill, first identify which skill applies, then use the read_skill tool to load its full documentation.`;
  }

  private async buildMemoryContext(
    userMessage: string,
    sessionKey?: string,
    crossSessionMemory?: boolean
  ): Promise<string> {
    if (!this.memoryManager) return "";
    try {
      const results = await this.memoryManager.search(userMessage, { sessionKey, crossSessionMemory });
      if (!results.length) return "";
      return results
        .map((result, index) => {
          const label = `${index + 1}. [${result.source}] ${result.path}:${result.startLine}-${result.endLine}`;
          return `${label}\n${result.snippet}`;
        })
        .join("\n\n");
    } catch (error) {
      logger.warn({ error }, "Memory search failed");
      return "";
    }
  }

  async clearMemoryForSession(sessionKey: string): Promise<void> {
    if (!this.memoryManager) return;
    await this.memoryManager.clearMemoryForSession(sessionKey);
  }

  async clearAllMemory(): Promise<void> {
    if (!this.memoryManager) return;
    await this.memoryManager.clearAllMemory();
  }

  async processMessage(
    userMessage: string,
    options: { conversationHistory?: MessageParam[]; sessionKey?: string; crossSessionMemory?: boolean } = {},
    context?: SkillContext
  ): Promise<string> {
    logger.debug(
      { messageLength: userMessage.length, hasSessionKey: !!options.sessionKey },
      "[MSG-PROCESS] Processing user message with Pi Agent"
    );

    await this.ensureSkillsLoaded();

    // Check for skill references
    for (const skillInfo of Object.values(this.skills)) {
      if (userMessage.includes(`@${skillInfo.name}`)) {
        return this.executeSkillHandler(skillInfo, userMessage, "@reference", context);
      }
    }

    if (this.devMode) {
      logger.debug("[MSG-PROCESS] Dev mode enabled, returning dev response");
      return `[DEV MODE] I would respond to: ${userMessage}`;
    }

    logger.debug("[MSG-PROCESS] Processing message with Pi Agent (multi-provider LLM)");

    const memoryContext = options.crossSessionMemory
      ? await this.buildMemoryContext(userMessage, options.sessionKey, options.crossSessionMemory)
      : "";

    return this.processWithTools(userMessage, memoryContext);
  }

  private async processWithTools(userMessage: string, memoryContext: string): Promise<string> {
    try {
      // Build system prompt with skill metadata
      const skillsList = this.formatSkillsForPrompt();
      let systemPrompt = `${DEFAULT_SYSTEM_PROMPT}${skillsList}`;
      if (memoryContext) {
        systemPrompt = `${systemPrompt}\n\nRelevant memory:\n${memoryContext}\n\nUse this context if it helps answer the user.`;
      }

      logger.info(
        {
          provider: this.provider,
          model: this.model,
          userMessageLength: userMessage.length,
          baseUrl: this.baseUrl,
          hasApiKey: !!this.apiKey
        },
        "[PI-AGENT] Invoking Pi Agent with tool calling"
      );

      // Initialize Azure OpenAI client based on provider
      if (this.provider === "openai" && this.apiKey && this.baseUrl) {
        return await this.processWithAzureOpenAI(systemPrompt, userMessage);
      } else {
        logger.warn(
          { provider: this.provider, hasApiKey: !!this.apiKey, hasBaseUrl: !!this.baseUrl },
          "[PI-AGENT] Azure OpenAI not properly configured, returning placeholder response"
        );
        const response = `[Pi Agent - ${this.provider}:${this.model}] Ready to process: "${userMessage.substring(0, 80)}${userMessage.length > 80 ? "..." : ""}"

Note: Azure OpenAI tool calling requires proper configuration.`;
        return response;
      }
    } catch (error) {
      logger.error({ error }, "[PI-AGENT] Error during message processing");
      return `Sorry, I encountered an error while processing your request. Please try again.`;
    }
  }

  private async processWithAzureOpenAI(systemPrompt: string, userMessage: string): Promise<string> {
    // Create OpenAI client configured for Azure
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      defaultHeaders: {
        "api-key": this.apiKey!
      }
    });

    // Convert internal tool definitions to OpenAI format
    const tools = TOOLS.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));

    logger.debug(
      { toolCount: tools.length, toolNames: tools.map((t) => t.function.name) },
      "[PI-AGENT] Prepared tools for OpenAI"
    );

    // Initialize conversation messages
    const messages: Array<{
      role: "system" | "user" | "assistant" | "tool";
      content: string;
      tool_calls?: unknown;
      tool_call_id?: string;
    }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ];

    let response = "";
    let iteration = 0;
    const maxIterations = 10;

    // Tool calling loop
    while (iteration < maxIterations) {
      iteration++;
      logger.debug({ iteration, messageCount: messages.length }, "[PI-AGENT] Tool calling iteration");

      // Call OpenAI API with tools
      const completion = await client.chat.completions.create({
        model: this.model!,
        messages: messages as Parameters<typeof client.chat.completions.create>[0]["messages"],
        max_completion_tokens: 2000,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined
      });

      const choice = completion.choices[0];
      if (!choice) {
        logger.error({}, "[PI-AGENT] No choice returned from API");
        return "Error: No response from API";
      }

      // Check if we got tool calls
      const toolCalls = choice.message.tool_calls || [];

      if (toolCalls.length > 0) {
        logger.debug({ toolCallCount: toolCalls.length }, "[PI-AGENT] LLM requested tool calls");

        // Add assistant message with tool calls to conversation
        messages.push({
          role: "assistant",
          content: choice.message.content || "",
          tool_calls: toolCalls
        });

        // Execute each tool call
        const toolResults = [];
        for (const toolCall of toolCalls) {
          if (toolCall.type !== "function") continue;

          logger.info({ toolName: toolCall.function.name }, "[PI-AGENT] Executing tool");

          try {
            const toolArgs = JSON.parse(toolCall.function.arguments);
            const toolResult = await this.toolExecutor.executeTool(toolCall.function.name, toolArgs);

            logger.debug(
              { toolName: toolCall.function.name, success: toolResult.success },
              "[PI-AGENT] Tool execution completed"
            );

            toolResults.push({
              toolCallId: toolCall.id,
              result: toolResult.success
                ? (toolResult.result || toolResult.stdout || "Tool executed successfully")
                : toolResult.error || "Tool execution failed"
            });
          } catch (error) {
            logger.error({ toolName: toolCall.function.name, error }, "[PI-AGENT] Tool execution error");
            toolResults.push({
              toolCallId: toolCall.id,
              result: `Error executing tool: ${String(error)}`
            });
          }
        }

        // Add tool results to messages
        for (const toolResult of toolResults) {
          messages.push({
            role: "tool",
            content: typeof toolResult.result === "string" ? toolResult.result : JSON.stringify(toolResult.result),
            tool_call_id: toolResult.toolCallId
          });
        }

        // Continue loop to get LLM response to tool results
        continue;
      } else {
        // No tool calls, extract final response
        if (choice.message.content) {
          response = choice.message.content;
        }

        logger.debug({ responseLength: response.length, iterations: iteration }, "[PI-AGENT] Received final response");
        return response || "I have completed the requested task.";
      }
    }

    logger.warn({ maxIterations }, "[PI-AGENT] Reached maximum iterations in tool calling loop");
    return response || "I have completed the requested task but reached iteration limit.";
  }

  async checkConnection(): Promise<boolean> {
    try {
      logger.debug(
        {
          provider: this.provider,
          model: this.model,
          hasApiKey: !!this.apiKey,
          hasBaseUrl: !!this.baseUrl
        },
        "[PI-AGENT] Checking connection"
      );

      // Validate that required configuration is present
      if (!this.model) {
        logger.error(
          { provider: this.provider },
          "[PI-AGENT] No model configured - cannot establish connection"
        );
        return false;
      }

      if (!this.apiKey) {
        logger.error(
          { provider: this.provider },
          "[PI-AGENT] No API key configured - cannot authenticate with provider"
        );
        return false;
      }

      // In a real implementation, this would make a test request to the provider
      // For now, we consider it healthy if configuration is present
      logger.info(
        { provider: this.provider, model: this.model },
        "[PI-AGENT] Connection check passed"
      );
      return true;
    } catch (error) {
      logger.error({ error, provider: this.provider }, "[PI-AGENT] Connection check failed");
      return false;
    }
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    logger.debug({ toolName }, "[PI-AGENT] Executing tool");
    return await this.toolExecutor.executeTool(toolName, params);
  }

  private async executeSkillHandler(
    skillInfo: SkillInfo,
    userMessage: string,
    triggerType: string,
    context?: SkillContext
  ): Promise<string> {
    logger.info({ skillName: skillInfo.name, triggerType }, "[SKILL-EXEC] Executing skill");
    try {
      const result = await skillInfo.handler(userMessage, context);
      logger.info(
        { skillName: skillInfo.name, triggerType, resultLength: result.length },
        "[SKILL-EXEC] Skill execution completed successfully"
      );
      return result;
    } catch (error) {
      logger.error({ error, skillName: skillInfo.name, triggerType }, "[SKILL-EXEC] Skill execution failed");
      return `Sorry, error executing skill ${skillInfo.name}.`;
    }
  }
}
