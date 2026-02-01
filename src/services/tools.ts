import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { logger } from "../utils/logging.ts";
import { getPermissionManager } from "./permission_manager.ts";

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
};

export const TOOLS: ToolDefinition[] = [
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
  }
];

const normalize = (command: string): string => command.toLowerCase().trim();

const commandMatchesPattern = (command: string, patterns: string[]): boolean => {
  logger.debug({ command, patterns }, "Checking command against patterns");
  if (!patterns.length || !command) return false;
  const normalizedCmd = normalize(command);
  logger.debug({ normalizedCmd }, "Normalized command");
  return patterns.some((pattern) => {
    const normalized = normalize(pattern);
    logger.debug({ pattern, normalized }, "Checking pattern");
    if (normalized === "*") {
      logger.debug("Wildcard pattern '*' detected - allowing all commands");
      return true; // Wildcard allows all commands
    }
    const matches = normalizedCmd.startsWith(normalized) ||
           normalizedCmd.startsWith(`${normalized} `) ||
           normalizedCmd.startsWith(`${normalized}(`) ||
           normalizedCmd.startsWith(`${normalized}\n`);
    logger.debug({ pattern: normalized, command: normalizedCmd, matches }, "Pattern match result");
    return matches;
  });
};

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

const escapeRegex = (input: string): string =>
  input.replace(/[.+^${}()|[\]\\]/g, "\\$&");

const matchPattern = (value: string, patterns: string[]): boolean => {
  if (!patterns.length) return false;
  return patterns.some((pattern) => {
    const regex = new RegExp(`^${escapeRegex(pattern).replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
    return regex.test(value);
  });
};

const findMatchingPattern = (value: string, patterns: string[]): string | undefined => {
  if (!patterns.length) return undefined;
  for (const pattern of patterns) {
    const regex = new RegExp(`^${escapeRegex(pattern).replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
    if (regex.test(value)) return pattern;
  }
  return undefined;
};

export class ToolExecutor {
  private allowedTools?: string[];
  private permissionManager = getPermissionManager();

  constructor(allowedTools?: string[]) {
    this.allowedTools = allowedTools;
  }

  async executeTool(toolName: string, toolInput: Record<string, unknown>): Promise<ToolResult> {
    logger.info({ toolName, input: toolInput }, "[TOOL-FLOW] Executing tool");
    logger.debug({ toolName, hasPermissionManager: Boolean(this.permissionManager) }, "[TOOL-FLOW] Permission manager status");

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

      const deniedPattern = resourcePath ? this.permissionManager.getDeniedResourcePattern(resourcePath) : undefined;
      if (resourcePath && deniedPattern) {
        logger.debug({ toolName, resourcePath, rule: deniedPattern }, "Tool execution denied by resource rule");
        this.permissionManager.checkResourceDenied(resourcePath);
        return {
          success: false,
          error: `Permission denied: Resource path '${resourcePath}' is blocked by deny rule '${deniedPattern}'`
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

      const restrictions = this.permissionManager.getToolRestrictions(toolName);
      logger.debug({ toolName, hasRestrictions: Boolean(restrictions) }, "[TOOL-FLOW] Checked for tool restrictions");
      if (restrictions) {
        logger.debug({ toolName, restrictions }, "[TOOL-FLOW] Tool has restrictions");
        const command = typeof toolInput.command === "string" ? toolInput.command : "";
        if (command) {
          logger.debug({ toolName, command, allowedCommands: restrictions.allowedCommands }, "[TOOL-FLOW] Checking command against allowed patterns");
          // Deny-all-by-default for commands: only allow if explicitly listed
          if (restrictions.allowedCommands.length === 0) {
            logger.debug(
              { toolName, command },
              "Tool execution denied: no allowed commands configured"
            );
            return {
              success: false,
              error: `Permission denied: No commands allowed for this tool (allowed_commands is empty)`
            };
          }
          const isAllowed = commandMatchesPattern(command, restrictions.allowedCommands);
          logger.debug({ toolName, command, isAllowed, patterns: restrictions.allowedCommands }, "[TOOL-FLOW] Command pattern match result");
          if (!isAllowed) {
            const allowedList = restrictions.allowedCommands.join(", ");
            logger.debug(
              { toolName, command, allowed: restrictions.allowedCommands },
              "Tool execution denied: command not in allowed list"
            );
            return {
              success: false,
              error: `Permission denied: Command must start with one of: ${allowedList}`
            };
          }
        }
        if (restrictions.allowedPaths.length > 0 && resourcePath) {
          const allowedPathMatch = findMatchingPattern(resourcePath, restrictions.allowedPaths);
          if (!allowedPathMatch) {
            const allowedList = restrictions.allowedPaths.join(", ");
            logger.debug(
              { toolName, resourcePath, allowed: restrictions.allowedPaths },
              "Tool execution denied by allowed path rules"
            );
            return {
              success: false,
              error: `Permission denied: Resource path '${resourcePath}' is not in allowed_paths list (allowed: ${allowedList})`
            };
          }
        }
        if (typeof restrictions.timeoutMax === "number") {
          const requestedTimeout = typeof toolInput.timeout === "number" ? toolInput.timeout : restrictions.timeoutMax;
          effectiveInput = {
            ...effectiveInput,
            timeout: Math.min(requestedTimeout, restrictions.timeoutMax)
          };
        }
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

    switch (toolName) {
      case "run_powershell":
        return this.runPowerShell(effectiveInput);
      case "run_bash":
        return this.runBash(effectiveInput);
      case "read_file":
        return this.readFile(effectiveInput);
      case "write_file":
        return this.writeFile(effectiveInput);
      case "list_directory":
        return this.listDirectory(effectiveInput);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private async runPowerShell(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const command = String(toolInput.command ?? "");
    const workingDirectory =
      typeof toolInput.working_directory === "string" ? toolInput.working_directory : undefined;
    const timeout = typeof toolInput.timeout === "number" ? toolInput.timeout : 30;

    if (!command) return { success: false, error: "No command provided" };

    const permissionManager = getPermissionManager();
    logger.debug({ command, hasPermissionManager: Boolean(permissionManager) }, "[TOOL-FLOW] Checking global blocked commands for PowerShell");
    if (permissionManager?.isCommandBlocked(command)) {
      logger.warn({ command }, "[TOOL-FLOW] PowerShell command blocked by global policy");
      return { success: false, error: "Command blocked: This operation is not permitted by policy" };
    }

    logger.info({ command }, "Running PowerShell command");
    return runProcess("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], workingDirectory, timeout);
  }

  private async runBash(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const command = String(toolInput.command ?? "");
    const workingDirectory =
      typeof toolInput.working_directory === "string" ? toolInput.working_directory : undefined;
    const timeout = typeof toolInput.timeout === "number" ? toolInput.timeout : 30;

    if (!command) return { success: false, error: "No command provided" };

    const permissionManager = getPermissionManager();
    logger.debug({ command, hasPermissionManager: Boolean(permissionManager) }, "[TOOL-FLOW] Checking global blocked commands for Bash");
    if (permissionManager?.isCommandBlocked(command)) {
      logger.warn({ command }, "[TOOL-FLOW] Bash command blocked by global policy");
      return { success: false, error: "Command blocked: This operation is not permitted by policy" };
    }

    logger.info({ command }, "Running Bash command");
    const bashResult = await runProcess("bash", ["-c", command], workingDirectory, timeout);
    if (bashResult.success) return bashResult;
    if (bashResult.error?.includes("ENOENT")) {
      return runProcess("sh", ["-c", command], workingDirectory, timeout);
    }
    return bashResult;
  }

  private async readFile(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const filePath = typeof toolInput.path === "string" ? toolInput.path : "";
    const encoding = typeof toolInput.encoding === "string" ? toolInput.encoding : "utf-8";

    if (!filePath) return { success: false, error: "No path provided" };

    try {
      const content = await fs.readFile(filePath, { encoding: encoding as BufferEncoding });
      return { success: true, result: content, path: filePath, size: content.length } as ToolResult;
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async writeFile(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const filePath = typeof toolInput.path === "string" ? toolInput.path : "";
    const content = typeof toolInput.content === "string" ? toolInput.content : "";
    const encoding = typeof toolInput.encoding === "string" ? toolInput.encoding : "utf-8";

    if (!filePath) return { success: false, error: "No path provided" };

    try {
      await fs.writeFile(filePath, content, { encoding: encoding as BufferEncoding });
      return {
        success: true,
        result: `Successfully wrote ${content.length} bytes to ${filePath}`,
        path: filePath,
        size: content.length
      } as ToolResult;
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async listDirectory(toolInput: Record<string, unknown>): Promise<ToolResult> {
    const dirPath = typeof toolInput.path === "string" ? toolInput.path : ".";
    const includeHidden = Boolean(toolInput.include_hidden ?? false);

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items = entries
        .filter((entry) => includeHidden || !entry.name.startsWith("."))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file"
        }));
      return { success: true, result: items, path: dirPath, count: items.length } as ToolResult;
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}

export const getToolDefinitions = (): ToolDefinition[] => TOOLS;

export const getAllowedTools = (): ToolDefinition[] => {
  const permissionManager = getPermissionManager();
  if (!permissionManager) return [];
  return TOOLS.filter((tool) => permissionManager.isToolAllowed(tool.name));
};
