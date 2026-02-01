import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { resolveConfig } from "../config.ts";
import { logger } from "../utils/logging.ts";
import { SkillLoader, type SkillHandler } from "./skill_loader.ts";
import { ToolExecutor, getAllowedTools } from "./tools.ts";
import type { MemoryManager } from "../memory/manager.ts";

const SYSTEM_PROMPT = `You are a helpful AI assistant with access to system tools. You can execute PowerShell commands, Bash commands, read and write files, and list directory contents.

When asked to perform system tasks:
1. Use the appropriate tool to accomplish the task
2. Always explain what you're doing before executing commands
3. Report the results clearly to the user
4. If a command fails, explain what went wrong and suggest alternatives
5. If a tool request is denied or blocked, include the exact denial reason in your response

Be helpful, concise, and safe. Never execute destructive commands without explicit user confirmation.`;

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

  private async buildMemoryContext(userMessage: string, sessionKey?: string): Promise<string> {
    if (!this.memoryManager) return "";
    try {
      const hits = await this.memoryManager.search(userMessage, { sessionKey });
      if (!hits.length) return "";
      return hits
        .map((hit, index) => {
          const label = `${index + 1}. [${hit.source}] ${hit.path}`;
          return `${label}\n${hit.content}`;
        })
        .join("\n\n");
    } catch (error) {
      logger.warn({ error }, "Memory search failed");
      return "";
    }
  }

  async processMessage(
    userMessage: string,
    options: { conversationHistory?: MessageParam[]; sessionKey?: string } = {}
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
    const memoryContext = await this.buildMemoryContext(userMessage, options.sessionKey);
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
          assistantContent.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
          toolUses.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
        }
      }

      messages.push({ role: "assistant", content: assistantContent as unknown as MessageParam["content"] });

      const toolResults: Array<Record<string, unknown>> = [];
      for (const toolUse of toolUses) {
        const result = await this.toolExecutor.executeTool(toolUse.name, toolUse.input);
        const content = result.success
          ? JSON.stringify(result.result ?? result, null, 2)
          : `Error: ${result.error ?? "Unknown error"}`;
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

  private appendOperationSummary(response: string, operations: OperationRecord[]): string {
    if (!operations.length || this.devMode) {
      return response;
    }
    return response;
  }
}
