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
          const isAllowed = findMatchingPattern(command, restrictions.allowedCommands) !== undefined;
          logger.debug({ toolName, command, isAllowed, patterns: restrictions.allowedCommands }, "[TOOL-FLOW] Command pattern match result");
          if (!isAllowed) {
            const allowedList = restrictions.allowedCommands.join(", ");
            logger.debug(
              { toolName, command, allowed: restrictions.allowedCommands },
              "Tool execution denied: command not in allowed list"
            );
            return {
              success: false,
              error: `Permission denied: Command '${command}' is not in allowed_commands list`
            };
          }
        }
        if (restrictions.blockedCommands.length > 0) {
          const blockedPattern = findMatchingPattern(command, restrictions.blockedCommands);
          if (blockedPattern) {
            logger.debug(
              { toolName, command, blockedBy: blockedPattern, blockedCommands: restrictions.blockedCommands },
              "Tool execution denied: command in blocked list"
            );
            return {
              success: false,
              error: `Permission denied: Command '${command}' is blocked by rule '${blockedPattern}'`
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

    logger.debug({ toolName, effectiveInput: JSON.stringify(effectiveInput, null, 2) }, "[TOOL-FLOW] Dispatching to tool implementation");
    
    const toolStart = Date.now();
    let result: ToolResult;
    switch (toolName) {
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
    logger.debug({ command, hasPermissionManager: Boolean(permissionManager) }, "[TOOL-FLOW] Checking global blocked commands for PowerShell");
    if (permissionManager?.isCommandBlocked(command)) {
      logger.warn({ command }, "[TOOL-FLOW] PowerShell command blocked by global policy");
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
    logger.debug({ command, hasPermissionManager: Boolean(permissionManager) }, "[TOOL-FLOW] Checking global blocked commands for Bash");
    if (permissionManager?.isCommandBlocked(command)) {
      logger.warn({ command }, "[TOOL-FLOW] Bash command blocked by global policy");
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
}

export const getToolDefinitions = (): ToolDefinition[] => TOOLS;

export const getAllowedTools = (): ToolDefinition[] => {
  const permissionManager = getPermissionManager();
  if (!permissionManager) return [];
  return TOOLS.filter((tool) => permissionManager.isToolAllowed(tool.name));
};
