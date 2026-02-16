import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig, type AutoRoutingConfig, type AppConfig } from "../config.ts";
import { logger } from "../utils/logging.ts";
import { SkillLoader, type SkillHandler, type SkillInfo } from "./skill_loader.ts";
import { ToolExecutor, getAllowedTools, type ToolResult } from "./tools.ts";
import { RetryManager } from "./retry_manager.ts";
import { ModelResolver } from "./model_resolver.ts";
import type { MemoryManager } from "../memory/manager.ts";
import type { SkillContext } from "./skill_context.ts";

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

Example for complex task "Get disk usage, save to HTML, email it":
### Step 1: Get Disk Usage Information
[Execute command and show actual output]

### Step 2: Create HTML File
Created file at: \`C:\\reports\\disk_usage.html\`
[Show relevant content summary]

### Step 3: Send Email
Email sent successfully to [recipient] with attachment.

### Summary
- ✅ Retrieved disk usage: **500GB used, 1.5TB free**
- ✅ Saved HTML report: \`C:\\reports\\disk_usage.html\`
- ✅ Email delivered to **user@example.com**

**MANDATORY RESPONSE REQUIREMENTS:**
1. **NEVER** respond with just tool names like "Executed run_powershell, write_file" - this is UNACCEPTABLE
2. **ALWAYS** show the actual data, results, or content the user requested
3. **ALWAYS** explain what you did in each step
4. **ALWAYS** provide specific file paths, values, or outputs
5. If you create a file, state the exact path and show a preview of the content
6. If you send email, confirm the recipient and what was sent

**Response Formatting Guidelines:**
- Use headers (###) to organize sections clearly
- Use **bold** for emphasis on key information (like file paths, important values, warnings)
- Use code blocks (\`\`\`) for command output, file contents, or raw data tables
- Use inline code (\`) for command names, file paths, and technical terms
- For tabular data from commands, present it in a code block to preserve formatting
- Always include a "### Summary" section at the end with key takeaways using **bold** for important details
- Keep responses well-structured and easy to scan
- For lists of items, use bullet points (-)
- For summaries, use clear, concise language with key points emphasized

**EXAMPLES:**

❌ BAD: "Executed run_powershell, write_file successfully."

✅ GOOD: 
### Disk Usage Report
\`\`\`
C: 500GB used / 1.5TB free
D: 200GB used / 800GB free
\`\`\`

Saved to: \`C:\\reports\\disk_usage.html\`

### Summary
- **File created**: \`C:\\reports\\disk_usage.html\`
- **Total disk space**: 2.3TB used of 2.3TB total

Be helpful, concise, and safe. Never execute destructive commands without explicit user confirmation.`;

function loadSystemPrompt(): string {
  const customPromptPath = process.env.SYSTEM_PROMPT_FILE;
  
  if (customPromptPath) {
    try {
      const content = readFileSync(customPromptPath, "utf-8");
      logger.info({ path: customPromptPath }, "Loaded custom system prompt");
      return content;
    } catch (error) {
      logger.warn({ path: customPromptPath, error }, "Failed to load custom system prompt, using default");
    }
  }
  
  // Try default location
  try {
    const defaultPath = join(process.cwd(), "system_prompt.txt");
    const content = readFileSync(defaultPath, "utf-8");
    logger.info({ path: defaultPath }, "Loaded system prompt from default location");
    return content;
  } catch {
    logger.info("Using built-in default system prompt");
  }
  
  return DEFAULT_SYSTEM_PROMPT;
}

const SYSTEM_PROMPT = loadSystemPrompt();
const DEFAULT_AUTO_ROUTE_CONFIDENCE = 0.3;

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

export class ClaudeProcessor {
  private client: Anthropic;
  private model: string;
  private devMode: boolean;
  private toolExecutor: ToolExecutor;
  private skills: Record<string, SkillInfo> = {};
  private skillsLoaded = false;
  private retryManager: RetryManager;
  private readonly maxToolIterations: number;
  private skillLoader: SkillLoader;
  private memoryManager?: MemoryManager;
  private autoRoutingConfig: AutoRoutingConfig;
  private autoRouteOptOutSet: Set<string>;
  private modelResolver: ModelResolver;

  constructor(skillDirs: string[], appConfig: AppConfig, memoryManager?: MemoryManager, modelResolver?: ModelResolver) {
    const config = appConfig || resolveConfig();

    // Use provided ModelResolver or create one
    if (!modelResolver) {
      modelResolver = new ModelResolver(config.models);
    }
    this.modelResolver = modelResolver;

    // Get the default model from agent config, or use first provider/first model
    let modelRef: string;

    if (config.agents?.model) {
      modelRef = config.agents.model;
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
    const [firstProvider, firstModelId] = modelRef.split("/");

    logger.info(
      { provider: firstProvider, model: firstModelId, modelRef },
      "[CLAUDE-PROCESSOR] Initializing with resolved model"
    );

    const anthropicConfig = {
      apiKey: resolvedModel.apiKey,
      baseUrl: resolvedModel.baseUrl,
      model: resolvedModel.model.name
    };

    this.client = new Anthropic({
      apiKey: anthropicConfig.apiKey,
      baseURL: anthropicConfig.baseUrl ?? undefined,
      maxRetries: 2,
      timeout: config.anthropicTimeoutMs
    });
    this.model = resolvedModel.model.id;
    this.devMode = config.devMode;
    this.retryManager = new RetryManager(config.retry);
    this.toolExecutor = new ToolExecutor(undefined, this.retryManager, []);
    this.skillLoader = new SkillLoader(skillDirs);
    this.memoryManager = memoryManager;
    this.autoRoutingConfig = config.autoRouting;
    this.autoRouteOptOutSet = new Set(
      (config.autoRouting.optOutSkills ?? []).map((skill) => skill.toLowerCase())
    );
    this.maxToolIterations = config.maxToolIterations;
    logger.info({ model: this.model, skillDirs, hasMemoryManager: !!memoryManager }, "[INIT] ClaudeProcessor initialized");
  }

  private async checkAutoRouteSkills(userMessage: string, context?: SkillContext): Promise<string | null> {
    if (!this.autoRoutingConfig.enabled) return null;
    const lowerMessage = userMessage.toLowerCase();
    logger.debug({ userMessage: lowerMessage.substring(0, 100) }, "[SKILL-EXEC] Delegating routing decisions to Claude");

    const documentationSkillMatch = this.findDocumentationSkill(lowerMessage);
    if (documentationSkillMatch) {
      logger.debug({ skillName: documentationSkillMatch.name }, "[SKILL-EXEC] Message matches documentation skill; allowing Claude to handle it");
      return null;
    }

    const explicitMatch = this.findExplicitInvocation(lowerMessage);
    if (explicitMatch) {
      if (this.isSkillOptedOut(explicitMatch.skill)) {
        this.logAutoRouteDecision(
          explicitMatch.skill,
          explicitMatch.trigger,
          explicitMatch.confidence,
          this.autoRoutingConfig.confidenceThreshold,
          "suppressed",
          "opted-out"
        );
        return null;
      }
      this.logAutoRouteDecision(
        explicitMatch.skill,
        explicitMatch.trigger,
        explicitMatch.confidence,
        this.autoRoutingConfig.confidenceThreshold,
        "executed-explicit"
      );
      return this.executeSkillHandler(explicitMatch.skill, userMessage, "auto-route", context);
    }

    const installerSkill = this.skills["skill_installer"];
    const installerMatch = this.matchesInstallerPattern(lowerMessage);
    if (installerSkill && installerMatch && !this.isSkillOptedOut(installerSkill)) {
      this.logAutoRouteDecision(
        installerSkill,
        "installer-fallback",
        installerSkill.triggerConfig?.confidence ?? DEFAULT_AUTO_ROUTE_CONFIDENCE,
        this.autoRoutingConfig.confidenceThreshold,
        "executed",
        "installer fallback"
      );
      return this.executeSkillHandler(installerSkill, userMessage, "auto-route", context);
    }

    const candidate = this.findAutoRouteCandidate(lowerMessage);
    if (!candidate) return null;

    if (candidate.confidence < this.autoRoutingConfig.confidenceThreshold) {
      this.logAutoRouteDecision(
        candidate.skill,
        candidate.trigger,
        candidate.confidence,
        this.autoRoutingConfig.confidenceThreshold,
        "suppressed",
        "confidence below threshold"
      );
      return null;
    }

    this.logAutoRouteDecision(
      candidate.skill,
      candidate.trigger,
      candidate.confidence,
      this.autoRoutingConfig.confidenceThreshold,
      "executed"
    );
      return this.executeSkillHandler(candidate.skill, userMessage, "auto-route", context);
  }

  private async ensureSkillsLoaded(): Promise<void> {
    if (!this.skillsLoaded) {
      logger.debug("[SKILL-FLOW] Skills not loaded yet, loading now");
      const skillHandlers = await this.skillLoader.loadSkills();
      const skillInfos = this.skillLoader.getSkillInfo();
      this.skills = skillInfos;
      this.skillsLoaded = true;

      // Update ToolExecutor with skill info for read_skill tool
      const skillInfoList = Object.values(this.skills).map(skill => ({
        name: skill.name,
        description: skill.metadata?.description,
        documentation: skill.documentation,
        isExecutable: !skill.isDocumentationSkill
      }));
      this.toolExecutor.setSkills(skillInfoList);

      logger.info({ loadedSkillCount: Object.keys(this.skills).length, skillNames: Object.keys(this.skills) }, "[SKILL-FLOW] Skills loaded and cached");
    } else {
      logger.debug({ cachedSkillCount: Object.keys(this.skills).length }, "[SKILL-FLOW] Using cached skills");
    }
  }

  private formatSkillsForPrompt(): string {
    const skillList = Object.values(this.skills);
    if (skillList.length === 0) {
      return "\n\n<available_skills>\nNo skills available.\n</available_skills>";
    }

    const skillEntries = skillList.map(skill => {
      const name = skill.name;
      const description = skill.metadata?.description || "No description provided";
      return `  - ${name}: ${description}`;
    }).join("\n");

    return `\n\n<available_skills>\n${skillEntries}\n</available_skills>\n\nTo use a skill, first identify which skill applies, then use the read_skill tool to load its full documentation.`;
  }

  private async findRelevantSkillDocumentation(userMessage: string): Promise<string | null> {
    const lowerMessage = userMessage.toLowerCase();
    const relevantDocs: string[] = [];
    const seenSkills = new Set<string>();

    for (const skillInfo of Object.values(this.skills)) {
      if (!skillInfo.isDocumentationSkill) continue;
      const triggerMatch = this.matchTrigger(skillInfo, lowerMessage);
      const explicitMention = skillInfo.name
        ? lowerMessage.includes(`@${skillInfo.name.toLowerCase()}`)
        : false;
      if (!triggerMatch && !explicitMention) continue;
      if (seenSkills.has(skillInfo.name)) continue;
      seenSkills.add(skillInfo.name);

      let documentation = skillInfo.documentation;
      if (!documentation) {
        try {
          documentation = await skillInfo.handler(userMessage);
        } catch (error) {
          logger.warn({ skillName: skillInfo.name, error }, "[SKILL-FLOW] Failed to load documentation for skill");
          continue;
        }
      }

      if (!documentation) continue;
      relevantDocs.push(documentation);
    }

    if (!relevantDocs.length) return null;

    return [
      "## Available Skills",
      "The following SKILL.md-based instructions match the user request. Use the appropriate system tool (e.g., run_powershell, run_bash) and work inside each skill's directory to execute the documented commands.",
      "",
      relevantDocs.join("\n\n---\n\n")
    ].join("\n");
  }

  private findDocumentationSkill(lowerMessage: string): SkillInfo | null {
    for (const skillInfo of Object.values(this.skills)) {
      if (!skillInfo.isDocumentationSkill) continue;
      if (this.matchTrigger(skillInfo, lowerMessage)) {
        return skillInfo;
      }
    }
    return null;
  }

  private matchTrigger(skillInfo: SkillInfo, lowerMessage: string): string | null {
    const normalizedName = skillInfo.name?.toLowerCase();
    if (normalizedName && lowerMessage.includes(normalizedName)) {
      return skillInfo.name;
    }
    for (const trigger of skillInfo.triggers ?? []) {
      const normalizedTrigger = trigger.toLowerCase();
      if (!normalizedTrigger) continue;
      if (lowerMessage.includes(normalizedTrigger)) return trigger;
    }
    return null;
  }

  private findExplicitInvocation(lowerMessage: string): {
    skill: SkillInfo;
    trigger: string;
    confidence: number;
  } | null {
    for (const skillInfo of Object.values(this.skills)) {
      const mention = skillInfo.name ? `@${skillInfo.name.toLowerCase()}` : null;
      if (mention && lowerMessage.includes(mention)) {
        return {
          skill: skillInfo,
          trigger: mention,
          confidence: skillInfo.triggerConfig?.confidence ?? DEFAULT_AUTO_ROUTE_CONFIDENCE
        };
      }
    }

    const explicitPattern = /\b(?:run|use)\s+skill\s+([a-z0-9_-]+)/i;
    const match = explicitPattern.exec(lowerMessage);
    if (match && match[1]) {
      const candidateSkill = this.getSkillByName(match[1]);
      if (candidateSkill) {
        return {
          skill: candidateSkill,
          trigger: match[0],
          confidence: candidateSkill.triggerConfig?.confidence ?? DEFAULT_AUTO_ROUTE_CONFIDENCE
        };
      }
    }

    return null;
  }

  private matchesInstallerPattern(lowerMessage: string): boolean {
    const useSkillPattern = /\buse skill\b/;
    const installSkillPattern = /\binstall (this )?skill\b|\badd skill\b/;
    return useSkillPattern.test(lowerMessage) || installSkillPattern.test(lowerMessage);
  }

  private getSkillByName(name: string): SkillInfo | undefined {
    const direct = this.skills[name];
    if (direct) return direct;
    const normalized = name.toLowerCase();
    return Object.values(this.skills).find((skill) => skill.name.toLowerCase() === normalized);
  }

  private findAutoRouteCandidate(lowerMessage: string): { skill: SkillInfo; trigger: string; confidence: number } | null {
    let best: { skill: SkillInfo; trigger: string; confidence: number } | null = null;
    for (const skillInfo of Object.values(this.skills)) {
      if (skillInfo.isDocumentationSkill) continue;
      if (this.isSkillOptedOut(skillInfo)) continue;
      const trigger = this.matchTrigger(skillInfo, lowerMessage);
      if (!trigger) continue;
      if (skillInfo.triggerConfig?.autoRoute === false) continue;
      const confidence = skillInfo.triggerConfig?.confidence ?? DEFAULT_AUTO_ROUTE_CONFIDENCE;
      if (!best || confidence > best.confidence) {
        best = { skill: skillInfo, trigger, confidence };
      }
    }
    return best;
  }

  private isSkillOptedOut(skillInfo: SkillInfo): boolean {
    const name = skillInfo.name?.toLowerCase();
    return name ? this.autoRouteOptOutSet.has(name) : false;
  }

  private logAutoRouteDecision(
    skillInfo: SkillInfo,
    trigger: string,
    confidence: number,
    threshold: number,
    decision: string,
    reason?: string
  ): void {
    logger.info(
      {
        skillName: skillInfo.name,
        trigger,
        confidence,
        threshold,
        decision,
        reason
      },
      "[SKILL-EXEC] Auto-routing decision"
    );
  }

  private async executeSkillHandler(
    skillInfo: SkillInfo,
    userMessage: string,
    triggerType: string,
    context?: SkillContext
  ): Promise<string> {
    logger.info({ skillName: skillInfo.name, triggerType }, "[SKILL-EXEC] Executing skill via auto-routing");
    try {
      const result = await this.invokeSkillHandler(skillInfo, userMessage, context);
      logger.info({ skillName: skillInfo.name, triggerType, resultLength: result.length }, "[SKILL-EXEC] Auto-routed skill execution completed successfully");
      return this.appendOperationSummary(result, [
        { kind: "skill", name: skillInfo.name, status: "success" }
      ]);
    } catch (error) {
      logger.error({ error, skillName: skillInfo.name, triggerType }, "[SKILL-EXEC] Auto-routed skill execution failed");
      return this.appendOperationSummary(`Sorry, error executing skill ${skillInfo.name}.`, [
        { kind: "skill", name: skillInfo.name, status: "error", reason: String(error) }
      ]);
    }
  }

  private async invokeSkillHandler(skillInfo: SkillInfo, userMessage: string, context?: SkillContext): Promise<string> {
    const execute = () => Promise.resolve(skillInfo.handler(userMessage, context));
    if (!this.retryManager) {
      return execute();
    }
    return this.retryManager.executeWithRetry(
      execute,
      `skill:${skillInfo.name}`,
      { shouldRetry: () => true }
    );
  }

  private async buildMemoryContext(userMessage: string, sessionKey?: string, crossSessionMemory?: boolean): Promise<string> {
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
      console.error('Memory search error:', error);
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
    options: { conversationHistory?: MessageParam[]; sessionKey?: string; crossSessionMemory?: boolean; threadHistory?: any[] } = {},
    context?: SkillContext
  ): Promise<string> {
    logger.debug({ messageLength: userMessage.length, hasSessionKey: !!options.sessionKey }, "[MSG-PROCESS] Processing user message");

    await this.ensureSkillsLoaded();

    // Check for automatic skill routing based on command patterns
    const autoRouteResult = await this.checkAutoRouteSkills(userMessage, context);
    if (autoRouteResult) {
      logger.debug("[MSG-PROCESS] Auto-routing applied, returning result");
      return autoRouteResult;
    }

    // Check for @skillname references
    logger.debug({ availableSkills: Object.keys(this.skills) }, "[MSG-PROCESS] Checking for @skill references");
    for (const skillInfo of Object.values(this.skills)) {
      if (userMessage.includes(`@${skillInfo.name}`)) {
        return this.executeSkillHandler(skillInfo, userMessage, "@reference", context);
      }
    }

    if (this.devMode) {
      logger.debug("[MSG-PROCESS] Dev mode enabled, returning dev response");
      return this.appendOperationSummary(`[DEV MODE] I would respond to: ${userMessage}`, []);
    }

    logger.debug("[MSG-PROCESS] No skill triggers found, proceeding with normal LLM processing");
    const conversationHistory = options.conversationHistory ?? [];
    const memoryContext = options.crossSessionMemory
      ? await this.buildMemoryContext(userMessage, options.sessionKey, options.crossSessionMemory)
      : ""; // Only use memory when explicitly enabled via /remember
    return this.processWithTools(userMessage, conversationHistory, memoryContext, options.threadHistory);
  }

  private async processWithTools(
    userMessage: string,
    conversationHistory: MessageParam[],
    memoryContext: string,
    threadHistory?: any[]
  ): Promise<string> {
    const messages: MessageParam[] = [...conversationHistory, { role: "user", content: userMessage }];
    let finalResponse = "";
    const operations: OperationRecord[] = [];

    // Build system prompt with skill metadata only (progressive disclosure)
    const skillsList = this.formatSkillsForPrompt();
    const relevantSkillDocs = await this.findRelevantSkillDocumentation(userMessage);

    let systemPrompt = `${SYSTEM_PROMPT}${skillsList}`;
    if (relevantSkillDocs) {
      systemPrompt = `${systemPrompt}\n\n${relevantSkillDocs}`;
    }
    if (threadHistory && threadHistory.length > 0) {
      const threadContext = this.formatThreadContext(threadHistory, userMessage);
      systemPrompt = `${systemPrompt}\n\n${threadContext}`;
    }
    if (memoryContext) {
      systemPrompt = `${systemPrompt}\n\nRelevant memory:\n${memoryContext}\n\nUse this context if it helps answer the user.`;
    }

    for (let iteration = 0; iteration < this.maxToolIterations; iteration += 1) {
      logger.info({ model: this.model }, "LLM call initiated");
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt,
        tools: getAllowedTools() as Tool[],
        messages
      });
      logger.info({ model: this.model }, "LLM response received");

      if (response.stop_reason === "end_turn") {
        finalResponse = this.extractText(response.content);
        break;
      }

      if (response.stop_reason !== "tool_use") {
        finalResponse = this.extractText(response.content);
        break;
      }

      const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      const assistantContent: Array<Record<string, unknown>> = [];

      for (const block of response.content ?? []) {
        if (block.type === "text") {
          assistantContent.push({ type: "text", text: block.text });
        }
        if (block.type === "tool_use") {
          logger.debug({ 
            toolId: block.id, 
            toolName: block.name, 
            toolInput: JSON.stringify(block.input, null, 2) 
          }, "[LLM-FLOW] Tool use requested by LLM");
          assistantContent.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
          toolUses.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
        }
      }

      messages.push({ role: "assistant", content: assistantContent as unknown as MessageParam["content"] });

      const toolResults: Array<Record<string, unknown>> = [];
      for (const toolUse of toolUses) {
        logger.debug({ toolName: toolUse.name, toolId: toolUse.id }, "[LLM-FLOW] Executing tool requested by LLM");
        const result = await this.toolExecutor.executeTool(toolUse.name, toolUse.input);
        const content = result.success
          ? JSON.stringify(result.result ?? result, null, 2)
          : `Error: ${result.error ?? "Unknown error"}`;
        logger.debug({ 
          toolName: toolUse.name, 
          toolId: toolUse.id,
          success: result.success,
          resultLength: content.length,
          error: result.error
        }, "[LLM-FLOW] Tool execution result");
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content });

        const command = typeof toolUse.input.command === "string" ? toolUse.input.command : undefined;
        const resourcePath =
          typeof toolUse.input.path === "string"
            ? toolUse.input.path
            : typeof toolUse.input.working_directory === "string"
              ? toolUse.input.working_directory
              : undefined;
        const workingDirectory =
          typeof toolUse.input.working_directory === "string" ? toolUse.input.working_directory : undefined;

        operations.push({
          kind: "tool",
          name: toolUse.name,
          status: result.success ? "success" : "denied",
          command,
          resourcePath,
          workingDirectory,
          reason: result.success ? undefined : result.error,
          result: this.extractOperationOutput(result),
          toolResult: result
        });
      }

      messages.push({ role: "user", content: toolResults as unknown as MessageParam["content"] });
    }

    if (!finalResponse) {
      const retryResult = await this.retryForFinalResponse(userMessage, messages, systemPrompt, operations);
      if (retryResult) {
        finalResponse = retryResult;
      } else {
        finalResponse = this.buildDetailedResponse(operations) ?? "Sorry, I could not complete the request.";
      }
    }

    finalResponse = this.sanitizeResponse(finalResponse);
    return this.appendOperationSummary(finalResponse, operations);
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 8,
        messages: [{ role: "user", content: "Hello" }]
      });
      return true;
    } catch (error) {
      logger.error({ error }, "Claude connection check failed");
      return false;
    }
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    return await this.toolExecutor.executeTool(toolName, params);
  }

  private extractText(content: Array<{ type: string; text?: string }>): string {
    if (!content) return "";
    const parts = content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "");
    return parts.join("\n");
  }

  private summarizeOperations(operations: OperationRecord[]): string | null {
    if (!operations.length) return null;
    const successOps = operations.filter((op) => op.status === "success");
    const failedOps = operations.filter((op) => op.status && op.status !== "success");

    if (successOps.length && !failedOps.length) {
      const toolNames = Array.from(new Set(successOps.map((op) => op.name)));
      return `✅ Executed ${toolNames.join(", ")} successfully.`;
    }

    const parts: string[] = [];
    if (successOps.length) {
      const toolNames = Array.from(new Set(successOps.map((op) => op.name)));
      parts.push(`✅ Success: ${toolNames.join(", ")}`);
    }
    if (failedOps.length) {
      const toolNames = Array.from(new Set(failedOps.map((op) => op.name)));
      parts.push(`⚠️ Failed: ${toolNames.join(", ")}`);
    }

    if (parts.length) {
      return parts.join(" • ");
    }

    return null;
  }

  private async retryForFinalResponse(
    userMessage: string,
    messages: MessageParam[],
    systemPrompt: string,
    operations: OperationRecord[]
  ): Promise<string | null> {
    if (!operations.length) return null;
    const summary = this.summarizeOperations(operations);
    if (!summary) return null;

    const retryPrompt = `${summary} Please provide a concise confirmation that the work is done for "${userMessage}" and highlight any key outputs or next steps.`;
    const retryMessages = [...messages, { role: "user", content: retryPrompt }];

    try {
      logger.info({ userMessage }, "[LLM-FLOW] Retrying for final response");
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        system: systemPrompt,
        tools: getAllowedTools() as Tool[],
        messages: retryMessages as MessageParam[]
      });
      const text = this.extractText(response.content);
      if (text) {
        return text;
      }
      logger.warn("[LLM-FLOW] Retry returned no textual content");
    } catch (error) {
      logger.warn({ error }, "[LLM-FLOW] Retry for final response failed");
    }

    return null;
  }

  private sanitizeResponse(response: string): string {
    // Remove LaTeX \boxed{} syntax and other LaTeX commands that don't render in markdown
    return response
      .replace(/\\boxed\{[^}]*\}/g, (match) => {
        // Extract content inside \boxed{} and format as bold markdown
        const content = match.match(/\\boxed\{([^}]*)\}/)?.[1] || '';
        return `**${content}**`;
      })
      .replace(/\\[a-zA-Z]+\{[^}]*\}/g, (match) => {
        // Remove other LaTeX commands like \frac{}, \sqrt{}, etc.
        const content = match.match(/\\[a-zA-Z]+\{([^}]*)\}/)?.[1] || '';
        return content; // Just return the inner content
      })
      .replace(/\\[a-zA-Z]+/g, ''); // Remove standalone LaTeX commands
  }

  private appendOperationSummary(response: string, operations: OperationRecord[]): string {
    if (!operations.length || this.devMode) {
      return response;
    }
    return response;
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

  private truncateForDisplay(text: string | null | undefined, maxLength = 800): string | null {
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
      if (op.resourcePath) {
        lines.push(`- **Affected resource**: \`${op.resourcePath}\``);
      }
      if (op.workingDirectory) {
        lines.push(`- **Working directory**: \`${op.workingDirectory}\``);
      }
      steps.push(lines.join("\n"));
    }
    const summarySection = this.buildSummarySection(operations);
    return [steps.join("\n\n"), summarySection].filter(Boolean).join("\n\n");
  }

  private buildSummarySection(operations: OperationRecord[]): string | null {
    if (!operations.length) return null;
    const summaryLines = ["### Summary"];
    summaryLines.push(`- **Operations performed**: ${operations.length} tool call(s)`);
    const uniqueResources = Array.from(
      new Set(operations.filter((op) => op.resourcePath).map((op) => op.resourcePath as string))
    );
    if (uniqueResources.length) {
      summaryLines.push(`- **Resources touched**: ${uniqueResources.map((path) => `\`${path}\``).join(", ")}`);
    }
    const recipients = this.extractEmailRecipients(operations);
    if (recipients.length) {
      summaryLines.push(`- **Email sent to**: ${recipients.join(", ")}`);
    }
    return summaryLines.join("\n");
  }

  private extractEmailRecipients(operations: OperationRecord[]): string[] {
    const recipientPattern = /--to\s+([^\s]+)/i;
    const recipients = new Set<string>();
    for (const op of operations) {
      if (!op.command) continue;
      const match = recipientPattern.exec(op.command);
      if (match && match[1]) {
        recipients.add(match[1]);
      }
    }
    return Array.from(recipients);
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
