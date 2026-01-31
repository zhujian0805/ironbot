import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { resolveConfig } from "../config.js";
import { logger } from "../utils/logging.js";
import { SkillLoader, type SkillHandler } from "./skill_loader.js";
import { ToolExecutor, getAllowedTools } from "./tools.js";

const SYSTEM_PROMPT = `You are a helpful AI assistant with access to system tools. You can execute PowerShell commands, Bash commands, read and write files, and list directory contents.

When asked to perform system tasks:
1. Use the appropriate tool to accomplish the task
2. Always explain what you're doing before executing commands
3. Report the results clearly to the user
4. If a command fails, explain what went wrong and suggest alternatives

Be helpful, concise, and safe. Never execute destructive commands without explicit user confirmation.`;

export class ClaudeProcessor {
  private client: Anthropic;
  private model: string;
  private devMode: boolean;
  private toolExecutor: ToolExecutor;
  private skills: Record<string, SkillHandler> = {};
  private skillsLoaded = false;
  private readonly maxToolIterations = 6;
  private skillLoader: SkillLoader;

  constructor(skillsDir: string) {
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
  }

  private async ensureSkillsLoaded(): Promise<void> {
    if (!this.skillsLoaded) {
      this.skills = await this.skillLoader.loadSkills();
      this.skillsLoaded = true;
    }
  }

  async processMessage(userMessage: string, conversationHistory: MessageParam[] = []): Promise<string> {
    await this.ensureSkillsLoaded();

    for (const [skillName, handler] of Object.entries(this.skills)) {
      if (userMessage.includes(`@${skillName}`)) {
        try {
          const result = await Promise.resolve(handler(userMessage));
          return result;
        } catch (error) {
          logger.error({ error, skillName }, "Skill execution failed");
          return `Sorry, error executing skill ${skillName}.`;
        }
      }
    }

    if (this.devMode) {
      return `[DEV MODE] I would respond to: ${userMessage}`;
    }

    return this.processWithTools(userMessage, conversationHistory);
  }

  private async processWithTools(
    userMessage: string,
    conversationHistory: MessageParam[]
  ): Promise<string> {
    const messages: MessageParam[] = [...conversationHistory, { role: "user", content: userMessage }];
    let finalResponse = "";

    for (let iteration = 0; iteration < this.maxToolIterations; iteration += 1) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: getAllowedTools() as Tool[],
        messages
      });

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
      }

      messages.push({ role: "user", content: toolResults as unknown as MessageParam["content"] });    }

    if (!finalResponse) {
      finalResponse = "Sorry, I could not complete the request.";
    }

    return finalResponse;
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
}
