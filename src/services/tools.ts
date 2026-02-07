import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { logger } from "../utils/logging.ts";
import { getPermissionManager } from "./permission_manager.ts";
import { RetryManager, type RetryContext } from "./retry_manager.ts";

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type ToolResult = {
  success: boolean;
  result?: unknown;
  error?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  skillName?: string;
  isExecutable?: boolean;
};

export const TOOLS: ToolDefinition[] = [
  {
    name: "read_skill",
    description:
      "Load the full documentation for a specific skill. Use this when you've identified a skill that applies to the user's request. The skill name should match exactly from the available_skills list. Returns the complete SKILL.md content with instructions.",
    input_schema: {
      type: "object",
      properties: {
        skill_name: {
          type: "string",
          description: "The exact name of the skill to load, as listed in available_skills"
        }
      },
      required: ["skill_name"]
    }
  },
  {
    name: "run_powershell",
    description:
      "Execute a PowerShell command on the system. Use this for system administration tasks, file operations, getting system information, or running scripts. Returns the command output (stdout) and any errors (stderr).",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The PowerShell command to execute. Can be a single command or a script block."
        },
        working_directory: {
          type: "string",
          description: "Optional working directory to run the command in. Defaults to the current directory."
        },
        timeout: {
          type: "integer",
          description: "Timeout in seconds for the command execution. Defaults to 30 seconds.",
          default: 30
        }
      },
      required: ["command"]
    }
  },
  {
    name: "run_bash",
    description:
      "Execute a Bash command on the system. Use this for Unix-like operations when running on Linux/macOS or Git Bash on Windows. Returns the command output (stdout) and any errors (stderr).",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The Bash command to execute."
        },
        working_directory: {
          type: "string",
          description: "Optional working directory to run the command in. Defaults to the current directory."
        },
        timeout: {
          type: "integer",
          description: "Timeout in seconds for the command execution. Defaults to 30 seconds.",
          default: 30
        }
      },
      required: ["command"]
    }
  },
  {
    name: "read_file",
    description: "Read the contents of a file from the filesystem.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to read."
        },
        encoding: {
          type: "string",
          description: "The file encoding. Defaults to 'utf-8'.",
          default: "utf-8"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description:
      "Write content to a file on the filesystem. Creates the file if it doesn't exist, or overwrites if it does.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to write."
        },
        content: {
          type: "string",
          description: "The content to write to the file."
        },
        encoding: {
          type: "string",
          description: "The file encoding. Defaults to 'utf-8'.",
          default: "utf-8"
        }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "list_directory",
    description: "List the contents of a directory.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the directory to list. Defaults to current directory.",
          default: "."
        },
        include_hidden: {
          type: "boolean",
          description: "Whether to include hidden files (starting with '.'). Defaults to false.",
          default: false
        }
      },
      required: []
    }
  },
  {
    name: "download_file",
    description: "Download a file from a URL and save it to the filesystem.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to download the file from."
        },
        path: {
          type: "string",
          description: "The local path where to save the downloaded file."
        }
      },
      required: ["url", "path"]
    }
  }
];

const runProcess = (
  command: string,
  args: string[],
  workingDirectory: string | undefined,
  timeoutSeconds: number
): Promise<ToolResult> =>
  new Promise((resolve) => {
    const child = spawn(command, args, { cwd: workingDirectory });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ success: false, error: `Command timed out after ${timeoutSeconds} seconds` });
    }, timeoutSeconds * 1000);

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ success: false, error: String(error) });
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ success: true, result: stdout, stdout, stderr, exitCode: code });
      } else {
        resolve({
          success: false,
          error: stderr || `Command failed with exit code ${code}`,
          stdout,
          stderr,
          exitCode: code
        });
      }
    });
  });

export type SkillInfo = {
  name: string;
  description?: string;
  documentation?: string;
  isExecutable?: boolean;
};

export class ToolExecutor {
  private allowedTools?: string[];
  private retryManager?: RetryManager;
  private permissionManager = getPermissionManager();
  private skills: Map<string, SkillInfo> = new Map();

  constructor(allowedTools?: string[], retryManager?: RetryManager, skills?: SkillInfo[]) {
    this.allowedTools = allowedTools;
    this.retryManager = retryManager;
    if (skills) {
      for (const skill of skills) {
        this.skills.set(skill.name, skill);
      }
    }
  }

  setSkills(skills: SkillInfo[]): void {
    this.skills.clear();
    for (const skill of skills) {
      this.skills.set(skill.name, skill);
    }
  }

  async executeTool(toolName: string, toolInput: Record<string, unknown>): Promise<ToolResult> {
    const retryContext = this.buildRetryContext(toolName, toolInput);
    const runAttempt = async (): Promise<ToolResult> => {
      logger.info({ toolName, input: toolInput }, "[TOOL-FLOW] Executing tool");
      logger.debug({ 
        toolName, 
        toolInput: JSON.stringify(toolInput, null, 2),
        hasPermissionManager: Boolean(this.permissionManager) 
      }, "[TOOL-FLOW] Tool execution started with full input");

      let effectiveInput = { ...toolInput };
      const resourcePath =
        typeof toolInput.path === "string"
          ? toolInput.path
          : typeof toolInput.working_directory === "string"
            ? toolInput.working_directory
            : undefined;

      if (this.permissionManager) {
        logger.debug({ toolName }, "[TOOL-FLOW] Checking tool permission");
        if (!this.permissionManager.isToolAllowed(toolName)) {
          const allowedTools = this.permissionManager.listAllowedCapabilities().tools;
          const reason = allowedTools.length
            ? `Tool '${toolName}' is not in the allowed list (allowed: ${allowedTools.join(", ")})`
            : `Tool '${toolName}' is not in the allowed list (no tools are enabled)`;
          logger.debug({ toolName, allowedTools, reason }, "[TOOL-FLOW] Tool execution denied - not in allowed list");
          return {
            success: false,
            error: this.permissionManager.formatDenialMessage("tool", toolName, reason)
          };
        }

        if (resourcePath && !this.permissionManager.isResourceAllowed(resourcePath)) {
          logger.debug({ toolName, resourcePath }, "Tool execution denied by resource policy");
          return {
            success: false,
            error: `Permission denied: Resource path '${resourcePath}' is not allowed by policy`
          };
        }

        const { validateToolRequest } = await import("../validation/tool_request.ts");
        try {
          validateToolRequest({ toolName, arguments: toolInput, requestedResource: resourcePath });
        } catch (error) {
          const reason = `Tool request validation failed: ${String(error)}`;
          logger.debug({ toolName, reason }, "Tool execution denied by validation");
          return { success: false, error: reason };
        }
      } else if (this.allowedTools) {
        if (!this.allowedTools.includes(toolName)) {
          const allowedList = this.allowedTools.join(", ");
          const reason = `Tool '${toolName}' is not allowed in current configuration (allowed: ${allowedList})`;
          logger.debug({ toolName, allowedTools: this.allowedTools, reason }, "Tool execution denied");
          return { success: false, error: reason };
        }
      } else {
        const reason = `Tool '${toolName}' is not allowed (permission manager not initialized)`;
        logger.debug({ toolName, reason }, "Tool execution denied");
        return { success: false, error: reason };
      }

      logger.debug({ toolName, effectiveInput: JSON.stringify(effectiveInput, null, 2) }, "[TOOL-FLOW] Dispatching to tool implementation");
      
      const toolStart = Date.now();
      let result: ToolResult;
      switch (toolName) {
        case "read_skill":
          result = await this.readSkill(effectiveInput);
          break;
        case "run_powershell":
          result = await this.runPowerShell(effectiveInput);
          break;
        case "run_bash":
          result = await this.runBash(effectiveInput);
          break;
        case "read_file":
          result = await this.readFile(effectiveInput);
          break;
        case "write_file":
          result = await this.writeFile(effectiveInput);
          break;
        case "list_directory":
          result = await this.listDirectory(effectiveInput);
          break;
        case "download_file":
          result = await this.downloadFile(effectiveInput);
          break;
        default:
          result = { success: false, error: `Unknown tool: ${toolName}` };
      }
      const durationMs = Date.now() - toolStart;
      logger.info({ toolName, success: result.success, durationMs }, "[TOOL-FLOW] Tool execution completed");
      return result;
    };

    if (!this.retryManager) {
      return runAttempt();
    }

    let lastResult: ToolResult | null = null;
    try {
      const result = await this.retryManager.executeWithRetry(async () => {
        const attemptResult = await runAttempt();
        if (!attemptResult.success) {
          lastResult = attemptResult;
          throw new Error(attemptResult.error ?? `Tool ${toolName} failed`);
        }
        lastResult = null;
        return attemptResult;
      }, retryContext, { shouldRetry: () => true });
      return result;
    } catch (error) {
      return (
        lastResult ??
        {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  private async readSkill(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const skillName = String(toolInput.skill_name ?? "");

    logger.debug({ tool: 'read_skill', skillName }, "[TOOL-EXEC] Reading skill documentation");

    if (!skillName) {
      return { success: false, error: "No skill_name provided" };
    }

    const skill = this.skills.get(skillName);
    if (!skill) {
      const availableSkills = Array.from(this.skills.keys()).join(", ");
      logger.warn({ skillName, availableSkills }, "[TOOL-EXEC] Skill not found");
      return {
        success: false,
        error: `Skill '${skillName}' not found. Available skills: ${availableSkills || 'none'}`
      };
    }

    logger.info({ skillName, hasDocumentation: !!skill.documentation }, "[TOOL-EXEC] Skill documentation loaded");
    return {
      success: true,
      result: skill.documentation || `Skill: ${skill.name}\nDescription: ${skill.description || 'No description provided.'}\n\nThis skill has no additional documentation.`,
      skillName: skill.name,
      isExecutable: skill.isExecutable
    };
  }

  private async runPowerShell(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const command = String(toolInput.command ?? "");
    const workingDirectory =
      typeof toolInput.working_directory === "string" ? toolInput.working_directory : undefined;
    const timeout = typeof toolInput.timeout === "number" ? toolInput.timeout : 30;

    logger.debug({ 
      tool: 'run_powershell',
      command, 
      workingDirectory, 
      timeout 
    }, "[TOOL-EXEC] PowerShell execution parameters");

    if (!command) return { success: false, error: "No command provided" };

    const permissionManager = getPermissionManager();
    logger.debug({ command, hasPermissionManager: Boolean(permissionManager) }, "[TOOL-FLOW] Checking command permission for PowerShell");
    if (permissionManager && !permissionManager.isCommandAllowed(command)) {
      logger.warn({ command }, "[TOOL-FLOW] PowerShell command denied by policy");
      return { success: false, error: "Command blocked: This operation is not permitted by policy" };
    }

    logger.info({ command }, "Running PowerShell command");
    const result = await runProcess("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], workingDirectory, timeout);
    logger.debug({ 
      tool: 'run_powershell',
      command,
      success: result.success,
      exitCode: result.exitCode,
      stdoutLength: result.stdout?.length,
      stderrLength: result.stderr?.length
    }, "[TOOL-EXEC] PowerShell execution completed");
    return result;
  }

  private async runBash(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const command = String(toolInput.command ?? "");
    const workingDirectory =
      typeof toolInput.working_directory === "string" ? toolInput.working_directory : undefined;
    const timeout = typeof toolInput.timeout === "number" ? toolInput.timeout : 30;

    logger.debug({ 
      tool: 'run_bash',
      command, 
      workingDirectory, 
      timeout 
    }, "[TOOL-EXEC] Bash execution parameters");

    if (!command) return { success: false, error: "No command provided" };

    const permissionManager = getPermissionManager();
    logger.debug({ command, hasPermissionManager: Boolean(permissionManager) }, "[TOOL-FLOW] Checking command permission for Bash");
    if (permissionManager && !permissionManager.isCommandAllowed(command)) {
      logger.warn({ command }, "[TOOL-FLOW] Bash command denied by policy");
      return { success: false, error: "Command blocked: This operation is not permitted by policy" };
    }

    logger.info({ command }, "Running Bash command");
    const bashResult = await runProcess("bash", ["-c", command], workingDirectory, timeout);
    logger.debug({ 
      tool: 'run_bash',
      command,
      shell: 'bash',
      success: bashResult.success,
      exitCode: bashResult.exitCode
    }, "[TOOL-EXEC] Bash execution completed");
    if (bashResult.success) return bashResult;
    if (bashResult.error?.includes("ENOENT")) {
      logger.debug({ command }, "[TOOL-EXEC] Bash not found, falling back to sh");
      const shResult = await runProcess("sh", ["-c", command], workingDirectory, timeout);
      logger.debug({ 
        tool: 'run_bash',
        command,
        shell: 'sh',
        success: shResult.success,
        exitCode: shResult.exitCode
      }, "[TOOL-EXEC] Sh execution completed");
      return shResult;
    }
    return bashResult;
  }

  private async readFile(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const filePath = typeof toolInput.path === "string" ? toolInput.path : "";
    const encoding = typeof toolInput.encoding === "string" ? toolInput.encoding : "utf-8";

    logger.debug({ 
      tool: 'read_file',
      filePath, 
      encoding 
    }, "[TOOL-EXEC] Reading file");

    if (!filePath) return { success: false, error: "No path provided" };

    try {
      const content = await fs.readFile(filePath, { encoding: encoding as BufferEncoding });
      logger.debug({ 
        tool: 'read_file',
        filePath,
        success: true,
        contentLength: content.length
      }, "[TOOL-EXEC] File read completed");
      return { success: true, result: content, path: filePath, size: content.length } as ToolResult;
    } catch (error) {
      logger.debug({ 
        tool: 'read_file',
        filePath,
        success: false,
        error: String(error)
      }, "[TOOL-EXEC] File read failed");
      return { success: false, error: String(error) };
    }
  }

  private async writeFile(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const filePath = typeof toolInput.path === "string" ? toolInput.path : "";
    const content = typeof toolInput.content === "string" ? toolInput.content : "";
    const encoding = typeof toolInput.encoding === "string" ? toolInput.encoding : "utf-8";

    logger.debug({ 
      tool: 'write_file',
      filePath, 
      contentLength: content.length,
      encoding 
    }, "[TOOL-EXEC] Writing file");

    if (!filePath) return { success: false, error: "No path provided" };

    try {
      await fs.writeFile(filePath, content, { encoding: encoding as BufferEncoding });
      logger.debug({ 
        tool: 'write_file',
        filePath,
        success: true,
        bytesWritten: content.length
      }, "[TOOL-EXEC] File write completed");
      return {
        success: true,
        result: `Successfully wrote ${content.length} bytes to ${filePath}`,
        path: filePath,
        size: content.length
      } as ToolResult;
    } catch (error) {
      logger.debug({ 
        tool: 'write_file',
        filePath,
        success: false,
        error: String(error)
      }, "[TOOL-EXEC] File write failed");
      return { success: false, error: String(error) };
    }
  }

  private async listDirectory(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const dirPath = typeof toolInput.path === "string" ? toolInput.path : ".";
    const includeHidden = Boolean(toolInput.include_hidden ?? false);

    logger.debug({ 
      tool: 'list_directory',
      dirPath, 
      includeHidden 
    }, "[TOOL-EXEC] Listing directory");

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items = entries
        .filter((entry) => includeHidden || !entry.name.startsWith("."))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file"
        }));
      logger.debug({ 
        tool: 'list_directory',
        dirPath,
        success: true,
        itemCount: items.length
      }, "[TOOL-EXEC] Directory listing completed");
      return { success: true, result: items, path: dirPath, count: items.length } as ToolResult;
    } catch (error) {
      logger.debug({ 
        tool: 'list_directory',
        dirPath,
        success: false,
        error: String(error)
      }, "[TOOL-EXEC] Directory listing failed");
      return { success: false, error: String(error) };
    }
  }

  private async downloadFile(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const url = typeof toolInput.url === "string" ? toolInput.url : "";
    const filePath = typeof toolInput.path === "string" ? toolInput.path : "";

    logger.debug({ 
      tool: 'download_file',
      url, 
      filePath 
    }, "[TOOL-EXEC] Downloading file");

    if (!url) return { success: false, error: "No URL provided" };
    if (!filePath) return { success: false, error: "No path provided" };

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
      const buffer = await response.arrayBuffer();
      await fs.writeFile(filePath, new Uint8Array(buffer));
      logger.debug({ 
        tool: 'download_file',
        url,
        filePath,
        success: true,
        bytesDownloaded: buffer.byteLength
      }, "[TOOL-EXEC] File download completed");
      return {
        success: true,
        result: `Successfully downloaded ${buffer.byteLength} bytes from ${url} to ${filePath}`,
        path: filePath,
        size: buffer.byteLength
      } as ToolResult;
    } catch (error) {
      logger.debug({ 
        tool: 'download_file',
        url,
        filePath,
        success: false,
        error: String(error)
      }, "[TOOL-EXEC] File download failed");
      return { success: false, error: String(error) };
    }
  }

  private buildRetryContext(toolName: string, toolInput: Record<string, unknown>): RetryContext {
    if (toolName === "run_powershell" || toolName === "run_bash") {
      const context: Record<string, unknown> = {
        label: `tool:${toolName}`,
        tool: toolName
      };
      const command = typeof toolInput.command === "string" ? toolInput.command : undefined;
      const workingDirectory =
        typeof toolInput.working_directory === "string" ? toolInput.working_directory : undefined;
      const timeoutSeconds = typeof toolInput.timeout === "number" ? toolInput.timeout : undefined;
      if (command) context.command = command;
      if (workingDirectory) context.workingDirectory = workingDirectory;
      if (timeoutSeconds !== undefined) context.timeoutSeconds = timeoutSeconds;
      return context;
    }
    return `tool:${toolName}`;
  }
}

export const getToolDefinitions = (): ToolDefinition[] => TOOLS;

export const getAllowedTools = (): ToolDefinition[] => {
  const permissionManager = getPermissionManager();
  if (!permissionManager) return [];
  return TOOLS.filter((tool) => permissionManager.isToolAllowed(tool.name));
};
