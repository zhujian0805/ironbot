import { logger } from "../utils/logging.ts";
import type { AppConfig } from "../config.ts";
import { ModelResolver } from "./model_resolver.ts";
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
4. **DETERMINE OS FIRST**: Before executing any commands, identify the operating system and use the correct tool:
   - **Windows**: Use \`run_powershell\` for system commands (Get-Volume, Get-ComputerInfo, Get-Process, etc.)
   - **Linux/macOS**: Use \`run_bash\` for system commands (df, free, lscpu, uname, etc.)
5. If asked about system information (hostname, disks, printers, processes, CPUs, RAM, etc.), you MUST determine the OS and use the appropriate tool

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

**MANDATORY RESPONSE REQUIREMENTS:**
1. **NEVER** respond with just tool names like "Executed run_powershell" - this is UNACCEPTABLE
2. **ALWAYS** show the actual data, results, or content the user requested
3. **ALWAYS** explain what you did in each step
4. **ALWAYS** provide specific file paths, values, or outputs
5. If you create a file, state the exact path and show a preview of the content
6. If you send email, confirm the recipient and what was sent
7. For system information requests, ALWAYS show the actual data in a readable format

**Response Formatting Guidelines:**
- Use headers (###) to organize sections clearly
- Use **bold** for emphasis on key information (like file paths, important values, warnings)
- Use code blocks (\`\`\`) for command output, file contents, or raw data tables
- Use inline code (\`) for command names, file paths, and technical terms
- For tabular data from commands, present it in a code block to preserve formatting
- Always include a "### Summary" section at the end with key takeaways using **bold** for important details
- Keep responses well-structured and easy to scan

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
  private modelResolver: ModelResolver;
  private provider: string = "";
  private api: string = "";
  private model: string = "";
  private apiKey?: string;
  private baseUrl?: string;
  private compactionMode?: "safeguard" | "moderate" | "aggressive";
  private workspace?: string;
  private subagentMaxConcurrent?: number;

  constructor(skillDirs: string[], config: AppConfig, memoryManager?: MemoryManager, modelResolver?: ModelResolver) {
    this.config = config;
    this.skillLoader = new SkillLoader(skillDirs);
    this.memoryManager = memoryManager;
    this.devMode = config.devMode;
    this.retryManager = new RetryManager(config.retry);
    this.toolExecutor = new ToolExecutor(undefined, this.retryManager, []);

    // Use provided ModelResolver or create one
    if (!modelResolver) {
      modelResolver = new ModelResolver(config.models);
    }
    this.modelResolver = modelResolver;

    // Initialize provider-specific settings from first provider
    this.initializeProviderSettings();

    // Read agent configuration defaults
    this.compactionMode = config.agents?.defaults?.compactionMode;
    this.workspace = config.agents?.defaults?.workspace;
    this.subagentMaxConcurrent = config.agents?.defaults?.subagents?.maxConcurrent;

    logger.info(
      {
        api: this.api,
        model: this.model,
        skillDirs,
        hasMemoryManager: !!memoryManager,
        hasApiKey: !!this.apiKey,
        compactionMode: this.compactionMode,
        workspace: this.workspace
      },
      "[INIT] PiAgentProcessor initialized"
    );
  }

  private initializeProviderSettings(): void {
    // Get default model from agent config, or use first provider/first model
    let modelRef: string;

    if (this.config.agents?.model) {
      modelRef = this.config.agents.model;
    } else {
      const providers = this.modelResolver.getProviders();
      if (providers.length === 0) {
        throw new Error("No providers configured in models");
      }

      const firstProvider = providers[0];
      const firstModels = this.modelResolver.getModelsForProvider(firstProvider);
      if (firstModels.length === 0) {
        throw new Error(`Provider '${firstProvider}' has no models configured`);
      }

      const firstModelId = firstModels[0].id;
      modelRef = `${firstProvider}/${firstModelId}`;
    }

    const resolvedModel = this.modelResolver.resolveModel(modelRef);
    const [provider, modelId] = modelRef.split("/");

    this.provider = provider;
    this.api = resolvedModel.apiType ?? "openai";
    this.model = modelRef;
    this.apiKey = resolvedModel.apiKey;
    this.baseUrl = resolvedModel.baseUrl;

    if (!this.apiKey) {
      logger.warn(
        { provider: this.provider, api: this.api },
        "[PI-AGENT] No API key configured for provider - connection tests will fail"
      );
    }

    logger.debug(
      { provider: this.provider, model: modelId, api: this.api },
      "[PI-AGENT] Provider settings initialized"
    );
  }

  /**
   * Get workspace configuration for agent state management
   */
  getWorkspaceConfig(): { workspace?: string; compactionMode?: "safeguard" | "moderate" | "aggressive" } {
    return {
      workspace: this.workspace,
      compactionMode: this.compactionMode
    };
  }

  /**
   * Get compaction mode for agent state management
   * Used to control state compression/compaction strategies:
   * - safeguard: Minimal compaction, preserve full history
   * - moderate: Balance between size and history (default)
   * - aggressive: Maximum compaction, minimal history retention
   */
  getCompactionMode(): "safeguard" | "moderate" | "aggressive" {
    return this.compactionMode ?? "moderate";
  }

  /**
   * Get subagent concurrency limit for pool management
   * Controls how many subagents can execute simultaneously
   */
  getSubagentConcurrencyLimit(): number {
    return this.subagentMaxConcurrent ?? 1; // Default: sequential subagent execution
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

  private getOSContext(): string {
    const platform = process.platform;
    let osInfo = "";

    if (platform === "win32") {
      osInfo = "**Operating System**: Windows\n**Tool to use**: run_powershell for system commands (Get-Volume, Get-ComputerInfo, Get-Process, Get-NetIPConfiguration, etc.)";
    } else if (platform === "darwin") {
      osInfo = "**Operating System**: macOS\n**Tool to use**: run_bash for system commands (df, free, system_profiler, etc.)";
    } else if (platform === "linux") {
      osInfo = "**Operating System**: Linux\n**Tool to use**: run_bash for system commands (df, free, lscpu, cat /proc/cpuinfo, etc.)";
    } else {
      osInfo = `**Operating System**: ${platform}\n**Tool to use**: Determine appropriate tool based on OS`;
    }

    return osInfo;
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
    options: { conversationHistory?: MessageParam[]; sessionKey?: string; crossSessionMemory?: boolean; threadHistory?: any[] } = {},
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

    return this.processWithTools(userMessage, memoryContext, options.threadHistory);
  }

  private async processWithTools(userMessage: string, memoryContext: string, threadHistory?: any[]): Promise<string> {
    try {
      // Build system prompt with skill metadata and OS context
      const skillsList = this.formatSkillsForPrompt();
      const osContext = this.getOSContext();
      let systemPrompt = `${DEFAULT_SYSTEM_PROMPT}\n\n<system_context>\n${osContext}\n</system_context>${skillsList}`;
      if (threadHistory && threadHistory.length > 0) {
        const threadContext = this.formatThreadContext(threadHistory, userMessage);
        systemPrompt = `${systemPrompt}\n\n${threadContext}`;
      }
      if (memoryContext) {
        systemPrompt = `${systemPrompt}\n\nRelevant memory:\n${memoryContext}\n\nUse this context if it helps answer the user.`;
      }

      logger.info(
        {
          provider: this.provider,
          api: this.api,
          model: this.model,
          userMessageLength: userMessage.length,
          baseUrl: this.baseUrl,
          hasApiKey: !!this.apiKey
        },
        "[PI-AGENT] Invoking Pi Agent with tool calling"
      );

      // Initialize OpenAI-compatible client based on API type
      if (this.api === "openai" && this.apiKey && this.baseUrl) {
        return await this.processWithAzureOpenAI(systemPrompt, userMessage);
      } else {
        logger.warn(
          { provider: this.provider, api: this.api, hasApiKey: !!this.apiKey, hasBaseUrl: !!this.baseUrl },
          "[PI-AGENT] OpenAI-compatible API not properly configured, returning placeholder response"
        );
        const response = `[Pi Agent - ${this.provider}:${this.model}] Ready to process: "${userMessage.substring(0, 80)}${userMessage.length > 80 ? "..." : ""}"

Note: OpenAI-compatible tool calling requires proper configuration.`;
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
    const operations: OperationRecord[] = [];

    // Tool calling loop
    while (iteration < maxIterations) {
      iteration++;
      logger.debug({ iteration, messageCount: messages.length }, "[PI-AGENT] Tool calling iteration");

      // Call OpenAI API with tools
      // Extract model ID from provider/model-id format
      let modelId = this.model!;
      if (modelId.includes('/')) {
        const parts = modelId.split('/');
        modelId = parts[parts.length - 1]; // Take the last part after the /
      }

      logger.debug({ originalModel: this.model, extractedModelId: modelId }, "[PI-AGENT] Model ID extraction");

      const completion = await client.chat.completions.create({
        model: modelId,
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

            const resultContent = toolResult.success
              ? (toolResult.result || toolResult.stdout || "Tool executed successfully")
              : toolResult.error || "Tool execution failed";

            toolResults.push({
              toolCallId: toolCall.id,
              result: resultContent
            });

            // Record operation for potential fallback response
            operations.push({
              kind: "tool",
              name: toolCall.function.name,
              status: toolResult.success ? "success" : "error",
              command: typeof toolArgs.command === "string" ? toolArgs.command : undefined,
              result: this.extractOperationOutput(toolResult),
              toolResult: toolResult
            });
          } catch (error) {
            logger.error({ toolName: toolCall.function.name, error }, "[PI-AGENT] Tool execution error");
            const errorMsg = `Error executing tool: ${String(error)}`;
            toolResults.push({
              toolCallId: toolCall.id,
              result: errorMsg
            });
            operations.push({
              kind: "tool",
              name: toolCall.function.name,
              status: "error",
              reason: String(error),
              result: errorMsg
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

        if (response) {
          return response;
        }

        // If no response text but we executed tools, build response from operations
        if (operations.length > 0) {
          const detailedResponse = this.buildDetailedResponse(operations);
          if (detailedResponse) {
            logger.debug("[PI-AGENT] Built detailed response from operations");
            return detailedResponse;
          }
        }

        return "I have completed the requested task.";
      }
    }

    logger.warn({ maxIterations }, "[PI-AGENT] Reached maximum iterations in tool calling loop");

    // If we hit max iterations but executed tools, build response from operations
    if (operations.length > 0 && !response) {
      const detailedResponse = this.buildDetailedResponse(operations);
      if (detailedResponse) {
        logger.debug("[PI-AGENT] Built detailed response from operations after max iterations");
        return detailedResponse;
      }
    }

    return response || "I have completed the requested task but reached iteration limit.";
  }

  async checkConnection(): Promise<boolean> {
    try {
      logger.debug(
        {
          provider: this.provider,
          api: this.api,
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

  private extractOperationOutput(result: ToolResult): string | undefined {
    if (!result) return undefined;
    if (result.stdout && result.stdout.trim()) {
      return result.stdout.trim();
    }
    if (typeof result.result === "string" && result.result.trim()) {
      return result.result.trim();
    }
    if (result.stderr && result.stderr.trim()) {
      return result.stderr.trim();
    }
    const serialized = JSON.stringify(result.result ?? result, null, 2);
    return serialized.length ? serialized : undefined;
  }

  private truncateForDisplay(text: string | null | undefined, maxLength = 4000): string | null {
    if (!text) return null;
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}\n... (truncated ${text.length - maxLength} chars)`;
  }

  private buildDetailedResponse(operations: OperationRecord[]): string | null {
    if (!operations.length) return null;
    const steps: string[] = [];
    for (let index = 0; index < operations.length; index += 1) {
      const op = operations[index];
      const stepNum = index + 1;
      const description = op.command
        ? `Executed \`${op.command}\``
        : `Invoked tool \`${op.name}\``;
      const lines: string[] = [`### Step ${stepNum}: ${description}`];
      const output = this.truncateForDisplay(op.result);
      if (output) {
        lines.push("```\n" + output + "\n```");
      }
      if (op.reason && !op.result) {
        lines.push(`- **Error**: ${op.reason}`);
      }
      steps.push(lines.join("\n"));
    }
    const summarySection = this.buildSummarySection(operations);
    return [steps.join("\n\n"), summarySection].filter(Boolean).join("\n\n");
  }

  private buildSummarySection(operations: OperationRecord[]): string | null {
    if (!operations.length) return null;
    const summaryLines = ["### Summary"];
    const successCount = operations.filter((op) => op.status === "success").length;
    const errorCount = operations.filter((op) => op.status === "error").length;
    summaryLines.push(`- **Operations performed**: ${operations.length} tool call(s) (${successCount} successful, ${errorCount} failed)`);
    return summaryLines.join("\n");
  }

  private formatThreadContext(threadHistory: any[], currentQuestion: string): string {
    if (!threadHistory || threadHistory.length === 0) {
      return "";
    }

    const lines: string[] = ["<slack_thread_context>"];

    // Add thread messages
    for (const message of threadHistory) {
      const user = message.user ? `<@${message.user}>` : (message.username || "unknown");
      const text = message.text || "(no message text)";
      lines.push(`${user}: ${text}`);
    }

    lines.push("");
    lines.push(`**Current question**: ${currentQuestion}`);
    lines.push("</slack_thread_context>");

    return lines.join("\n");
  }
}
