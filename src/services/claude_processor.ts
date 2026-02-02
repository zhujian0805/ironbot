import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../config.ts";
import { logger } from "../utils/logging.ts";
import { SkillLoader, type SkillHandler } from "./skill_loader.ts";
import { ToolExecutor, getAllowedTools } from "./tools.ts";
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
  private skills: Record<string, SkillHandler> = {};
  private skillsLoaded = false;
  private readonly maxToolIterations = 6;
  private skillLoader: SkillLoader;
  private memoryManager?: MemoryManager;

  constructor(skillsDir: string, memoryManager?: MemoryManager) {
    const config = resolveConfig();
    this.client = new Anthropic({
      apiKey: config.anthropicAuthToken,
      baseURL: config.anthropicBaseUrl ?? undefined,
      maxRetries: 2,
      timeout: 20000
    });
    this.model = config.anthropicModel;
    this.devMode = config.devMode;
    this.toolExecutor = new ToolExecutor();
    this.skillLoader = new SkillLoader(skillsDir);
    this.memoryManager = memoryManager;
    logger.info({ model: this.model }, "LLM model initialized");
  }

  private async ensureSkillsLoaded(): Promise<void> {
    if (!this.skillsLoaded) {
      this.skills = await this.skillLoader.loadSkills();
      this.skillsLoaded = true;
    }
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

  async processMessage(
    userMessage: string,
    options: { conversationHistory?: MessageParam[]; sessionKey?: string; crossSessionMemory?: boolean } = {}
  ): Promise<string> {
    await this.ensureSkillsLoaded();

    for (const [skillName, handler] of Object.entries(this.skills)) {
      if (userMessage.includes(`@${skillName}`)) {
        try {
          const result = await Promise.resolve(handler(userMessage));
          return this.appendOperationSummary(result, [
            { kind: "skill", name: skillName, status: "success" }
          ]);
        } catch (error) {
          logger.error({ error, skillName }, "Skill execution failed");
          return this.appendOperationSummary(`Sorry, error executing skill ${skillName}.`, [
            { kind: "skill", name: skillName, status: "error", reason: String(error) }
          ]);
        }
      }
    }

    if (this.devMode) {
      return this.appendOperationSummary(`[DEV MODE] I would respond to: ${userMessage}`, []);
    }

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
    const systemPrompt = memoryContext
      ? `${SYSTEM_PROMPT}\n\nRelevant memory:\n${memoryContext}\n\nUse this context if it helps answer the user.`
      : SYSTEM_PROMPT;

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
      finalResponse = "Sorry, I could not complete the request.";
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
