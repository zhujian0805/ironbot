import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../config.ts";
import { logger } from "../utils/logging.ts";
import { SkillLoader, type SkillHandler, type SkillInfo } from "./skill_loader.ts";
import { ToolExecutor, getAllowedTools } from "./tools.ts";
import { RetryManager } from "./retry_manager.ts";
import type { MemoryManager } from "../memory/manager.ts";

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to system tools. You can execute PowerShell commands, Bash commands, read and write files, and list directory contents.

**CRITICAL RULES:**
1. ALWAYS use tools to get information - NEVER make up or guess command output
2. You MUST execute the appropriate tool for EVERY request that asks for system information
3. NEVER respond with example or fake data - only use actual tool output
4. If asked about system information (hostname, disks, printers, processes, etc.), you MUST use run_powershell or run_bash

When asked to perform system tasks:
1. Use the appropriate tool to accomplish the task
2. Always explain what you're doing before executing commands
3. Report the results clearly to the user
4. If a command fails, explain what went wrong and suggest alternatives
5. If a tool request is denied or blocked, include the exact denial reason in your response
6. Always use the exact output from tools without modifying, filtering, or summarizing it unless explicitly asked
7. Do not reference previous queries or conversations unless directly relevant to the current request

**Response Formatting Guidelines:**
- Use headers (###) to organize sections clearly
- Use **bold** for emphasis on key information (like GPU names, important specs, warnings)
- Use code blocks (\`\`\`) for command output, file contents, or raw data tables
- Use inline code (\`) for command names, file paths, and technical terms
- For tabular data from commands, present it in a code block to preserve formatting
- Always include a "- Summary:" section at the end with key takeaways using **bold** for important details
- Keep responses well-structured and easy to scan
- For lists of items, use bullet points (-)
- For summaries, use clear, concise language with key points emphasized

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

type OperationRecord = {
  kind: "tool" | "skill";
  name: string;
  status?: "success" | "denied" | "error";
  command?: string;
  resourcePath?: string;
  workingDirectory?: string;
  reason?: string;
};

export class ClaudeProcessor {
  private client: Anthropic;
  private model: string;
  private devMode: boolean;
  private toolExecutor: ToolExecutor;
  private skills: Record<string, SkillInfo> = {};
  private skillsLoaded = false;
  private retryManager: RetryManager;
  private readonly maxToolIterations = 6;
  private skillLoader: SkillLoader;
  private memoryManager?: MemoryManager;

  constructor(skillDirs: string[], memoryManager?: MemoryManager) {
    const config = resolveConfig();
    this.client = new Anthropic({
      apiKey: config.anthropicAuthToken,
      baseURL: config.anthropicBaseUrl ?? undefined,
      maxRetries: 2,
      timeout: 20000
    });
    this.model = config.anthropicModel;
    this.devMode = config.devMode;
    this.retryManager = new RetryManager(config.retry);
    this.toolExecutor = new ToolExecutor(undefined, this.retryManager);
    this.skillLoader = new SkillLoader(skillDirs);
    this.memoryManager = memoryManager;
    logger.info({ model: this.model, skillDirs, hasMemoryManager: !!memoryManager }, "[INIT] ClaudeProcessor initialized");
  }

  private async checkAutoRouteSkills(userMessage: string): Promise<string | null> {
    const lowerMessage = userMessage.toLowerCase();
    logger.debug({ userMessage: lowerMessage.substring(0, 100) }, "[SKILL-EXEC] Delegating routing decisions to Claude");

    const matchedSkill = this.findAutoRouteSkill(lowerMessage);
    if (matchedSkill) {
      return this.executeSkillHandler(matchedSkill, userMessage, "auto-route");
    }

    const installerSkill = this.skills["skill_installer"];
    const documentationSkillMatch = this.findDocumentationSkill(lowerMessage);
    if (documentationSkillMatch) {
      logger.debug({ skillName: documentationSkillMatch.name }, "[SKILL-EXEC] Message matches documentation skill; allowing Claude to handle it");
      return null;
    }

    const useSkillPattern = /\buse skill\b/;
    const installSkillPattern = /\binstall (this )?skill\b|\badd skill\b/;
    if (
      installerSkill &&
      (useSkillPattern.test(lowerMessage) || installSkillPattern.test(lowerMessage))
    ) {
      logger.debug({ lowerMessage }, "[SKILL-EXEC] Falling back to skill_installer auto-route");
      return this.executeSkillHandler(installerSkill, userMessage, "auto-route");
    }

    return null;
  }

  private async ensureSkillsLoaded(): Promise<void> {
    if (!this.skillsLoaded) {
      logger.debug("[SKILL-FLOW] Skills not loaded yet, loading now");
      const skillHandlers = await this.skillLoader.loadSkills();
      const skillInfos = this.skillLoader.getSkillInfo();
      this.skills = skillInfos;
      this.skillsLoaded = true;
      logger.info({ loadedSkillCount: Object.keys(this.skills).length, skillNames: Object.keys(this.skills) }, "[SKILL-FLOW] Skills loaded and cached");
    } else {
      logger.debug({ cachedSkillCount: Object.keys(this.skills).length }, "[SKILL-FLOW] Using cached skills");
    }
  }

  private async findRelevantSkillDocumentation(userMessage: string): Promise<string | null> {
    const lowerMessage = userMessage.toLowerCase();
    const docs: string[] = [];

    // Find SKILL.md-based skills that match the message
    for (const skillInfo of Object.values(this.skills)) {
      if (!skillInfo.documentation && !skillInfo.isDocumentationSkill) continue;
      if (!this.skillMatchesMessage(skillInfo, lowerMessage)) continue;

      let documentation = skillInfo.documentation;
      if (!documentation && skillInfo.handler) {
        try {
          documentation = await Promise.resolve(skillInfo.handler(userMessage));
        } catch (error) {
          logger.error({ error, skillName: skillInfo.name }, "[SKILL-CONTEXT] Failed to render documentation from handler");
          documentation = undefined;
        }
      }

      if (!documentation) continue;

      docs.push(documentation);
      logger.debug({ skillName: skillInfo.name }, "[SKILL-CONTEXT] Including SKILL.md documentation for context");
    }

    if (docs.length === 0) {
      return null;
    }

    return `\n\n## Available Skills\n\nYou have access to the following skills. Use run_bash, run_powershell, or other tools as described in each SKILL.md to perform system actions.\n\n${docs.join("\n\n---\n\n")}`;
  }

  private skillMatchesMessage(skillInfo: SkillInfo, lowerMessage: string): boolean {
    if (skillInfo.name && lowerMessage.includes(skillInfo.name.toLowerCase())) {
      return true;
    }
    if (!skillInfo.triggers) {
      return false;
    }
    return skillInfo.triggers.some((trigger) => lowerMessage.includes(trigger.toLowerCase()));
  }

  private messageMentionsSkill(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    for (const skillInfo of Object.values(this.skills)) {
      if (this.skillMatchesMessage(skillInfo, lowerMessage)) {
        return true;
      }
    }
    return false;
  }

  private findAutoRouteSkill(lowerMessage: string): SkillInfo | null {
    for (const skillInfo of Object.values(this.skills)) {
      if (skillInfo.isDocumentationSkill) continue;
      if (this.skillMatchesMessage(skillInfo, lowerMessage)) {
        return skillInfo;
      }
    }
    return null;
  }

  private findDocumentationSkill(lowerMessage: string): SkillInfo | null {
    for (const skillInfo of Object.values(this.skills)) {
      if (!skillInfo.isDocumentationSkill) continue;
      if (this.skillMatchesMessage(skillInfo, lowerMessage)) {
        return skillInfo;
      }
    }
    return null;
  }

  private async executeSkillHandler(skillInfo: SkillInfo, userMessage: string, triggerType: string): Promise<string> {
    logger.info({ skillName: skillInfo.name, triggerType }, "[SKILL-EXEC] Executing skill via auto-routing");
    try {
      const result = await this.invokeSkillHandler(skillInfo, userMessage);
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

  private async invokeSkillHandler(skillInfo: SkillInfo, userMessage: string): Promise<string> {
    if (!this.retryManager) {
      return Promise.resolve(skillInfo.handler(userMessage));
    }
    return this.retryManager.executeWithRetry(
      () => Promise.resolve(skillInfo.handler(userMessage)),
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
    options: { conversationHistory?: MessageParam[]; sessionKey?: string; crossSessionMemory?: boolean } = {}
  ): Promise<string> {
    logger.debug({ messageLength: userMessage.length, hasSessionKey: !!options.sessionKey }, "[MSG-PROCESS] Processing user message");

    await this.ensureSkillsLoaded();

    // Check for automatic skill routing based on command patterns
    const autoRouteResult = await this.checkAutoRouteSkills(userMessage);
    if (autoRouteResult) {
      logger.debug("[MSG-PROCESS] Auto-routing applied, returning result");
      return autoRouteResult;
    }

    // Check for @skillname references
    logger.debug({ availableSkills: Object.keys(this.skills) }, "[MSG-PROCESS] Checking for @skill references");
    for (const skillInfo of Object.values(this.skills)) {
      if (userMessage.includes(`@${skillInfo.name}`)) {
        return this.executeSkillHandler(skillInfo, userMessage, "@reference");
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
    return this.processWithTools(userMessage, conversationHistory, memoryContext);
  }

  private async processWithTools(
    userMessage: string,
    conversationHistory: MessageParam[],
    memoryContext: string
  ): Promise<string> {
    const messages: MessageParam[] = [...conversationHistory, { role: "user", content: userMessage }];
    let finalResponse = "";
    const operations: OperationRecord[] = [];
    
    // Check if message mentions any SKILL.md-based skills and inject their content
    const relevantSkillDocs = await this.findRelevantSkillDocumentation(userMessage);
    
    let systemPrompt = SYSTEM_PROMPT;
    if (relevantSkillDocs) {
      systemPrompt = `${SYSTEM_PROMPT}\n\n${relevantSkillDocs}`;
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
          reason: result.success ? undefined : result.error
        });
      }

      messages.push({ role: "user", content: toolResults as unknown as MessageParam["content"] });
    }

    if (!finalResponse) {
      finalResponse =
        (await this.retryForFinalResponse(userMessage, messages, systemPrompt, operations)) ??
        this.summarizeOperations(operations) ??
        "Sorry, I could not complete the request.";
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
        messages: retryMessages
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
}
