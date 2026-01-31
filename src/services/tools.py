"""Tool definitions and execution for Claude tool use."""

import asyncio
import subprocess
import json
from typing import Dict, Any, List, Optional
from ..utils.logging import logger
from .permission_manager import get_permission_manager


# Tool definitions following Claude's tool use schema
TOOLS = [
    {
        "name": "run_powershell",
        "description": "Execute a PowerShell command on the system. Use this for system administration tasks, file operations, getting system information, or running scripts. Returns the command output (stdout) and any errors (stderr).",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The PowerShell command to execute. Can be a single command or a script block."
                },
                "working_directory": {
                    "type": "string",
                    "description": "Optional working directory to run the command in. Defaults to the current directory."
                },
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in seconds for the command execution. Defaults to 30 seconds.",
                    "default": 30
                }
            },
            "required": ["command"]
        }
    },
    {
        "name": "run_bash",
        "description": "Execute a Bash command on the system. Use this for Unix-like operations when running on Linux/macOS or Git Bash on Windows. Returns the command output (stdout) and any errors (stderr).",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The Bash command to execute."
                },
                "working_directory": {
                    "type": "string",
                    "description": "Optional working directory to run the command in. Defaults to the current directory."
                },
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in seconds for the command execution. Defaults to 30 seconds.",
                    "default": 30
                }
            },
            "required": ["command"]
        }
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file from the filesystem.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the file to read."
                },
                "encoding": {
                    "type": "string",
                    "description": "The file encoding. Defaults to 'utf-8'.",
                    "default": "utf-8"
                }
            },
            "required": ["path"]
        }
    },
    {
        "name": "write_file",
        "description": "Write content to a file on the filesystem. Creates the file if it doesn't exist, or overwrites if it does.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the file to write."
                },
                "content": {
                    "type": "string",
                    "description": "The content to write to the file."
                },
                "encoding": {
                    "type": "string",
                    "description": "The file encoding. Defaults to 'utf-8'.",
                    "default": "utf-8"
                }
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "list_directory",
        "description": "List the contents of a directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the directory to list. Defaults to current directory.",
                    "default": "."
                },
                "include_hidden": {
                    "type": "boolean",
                    "description": "Whether to include hidden files (starting with '.'). Defaults to false.",
                    "default": False
                }
            },
            "required": []
        }
    }
]


class ToolExecutor:
    """Executes tools requested by Claude."""

    # Commands that are considered dangerous and should be blocked
    BLOCKED_COMMANDS = [
        "rm -rf /",
        "del /f /s /q c:\\",
        "format",
        ":(){:|:&};:",  # Fork bomb
        "mkfs",
        "dd if=/dev/zero",
        "shutdown",
        "reboot",
        "halt",
        "init 0",
        "init 6",
    ]

    def __init__(self, allowed_tools: Optional[List[str]] = None, permission_manager=None):
        """Initialize the tool executor.

        Args:
            allowed_tools: List of tool names that are allowed. If None, uses permission manager.
            permission_manager: Optional PermissionManager instance. If None, uses global instance.
        """
        self.allowed_tools = allowed_tools
        self.permission_manager = permission_manager or get_permission_manager()

    def is_command_safe(self, command: str) -> bool:
        """Check if a command is safe to execute."""
        command_lower = command.lower().strip()
        for blocked in self.BLOCKED_COMMANDS:
            if blocked.lower() in command_lower:
                logger.warning(f"Blocked dangerous command: {command}")
                return False
        return True

    async def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool and return the result.

        Args:
            tool_name: Name of the tool to execute
            tool_input: Input parameters for the tool

        Returns:
            Dict with 'success' boolean and 'result' or 'error' string
        """
        logger.info(f"Executing tool: {tool_name} with input: {tool_input}")

        # Check if tool is allowed via permission manager
        if self.permission_manager:
            if not self.permission_manager.is_tool_allowed(tool_name):
                denial_msg = self.permission_manager.format_denial_message("tool", tool_name)
                return {
                    "success": False,
                    "error": denial_msg
                }

            # Check resource paths for file operations
            path = tool_input.get("path") or tool_input.get("working_directory")
            if path and self.permission_manager.check_resource_denied(path):
                return {
                    "success": False,
                    "error": f"Permission denied: Resource path '{path}' is blocked by deny rules"
                }

        # Legacy allowed_tools check (for backward compatibility)
        elif self.allowed_tools is not None and tool_name not in self.allowed_tools:
            return {
                "success": False,
                "error": f"Tool '{tool_name}' is not allowed in current configuration"
            }

        try:
            if tool_name == "run_powershell":
                return await self._run_powershell(tool_input)
            elif tool_name == "run_bash":
                return await self._run_bash(tool_input)
            elif tool_name == "read_file":
                return await self._read_file(tool_input)
            elif tool_name == "write_file":
                return await self._write_file(tool_input)
            elif tool_name == "list_directory":
                return await self._list_directory(tool_input)
            else:
                return {
                    "success": False,
                    "error": f"Unknown tool: {tool_name}"
                }
        except Exception as e:
            logger.error(f"Tool execution error: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    async def _run_powershell(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a PowerShell command."""
        command = tool_input.get("command", "")
        working_dir = tool_input.get("working_directory")
        timeout = tool_input.get("timeout", 30)

        if not command:
            return {"success": False, "error": "No command provided"}

        if not self.is_command_safe(command):
            return {"success": False, "error": "Command blocked for safety reasons"}

        logger.info(f"Running PowerShell command: {command[:100]}...")

        try:
            # Run PowerShell with the command
            process = await asyncio.create_subprocess_exec(
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=working_dir
            )

            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )

            stdout_str = stdout.decode("utf-8", errors="replace") if stdout else ""
            stderr_str = stderr.decode("utf-8", errors="replace") if stderr else ""

            result = {
                "success": process.returncode == 0,
                "exit_code": process.returncode,
                "stdout": stdout_str,
                "stderr": stderr_str
            }

            if process.returncode == 0:
                result["result"] = stdout_str
            else:
                result["error"] = stderr_str or f"Command failed with exit code {process.returncode}"

            logger.info(f"PowerShell command completed with exit code: {process.returncode}")
            return result

        except asyncio.TimeoutError:
            return {"success": False, "error": f"Command timed out after {timeout} seconds"}
        except FileNotFoundError:
            return {"success": False, "error": "PowerShell not found on this system"}

    async def _run_bash(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a Bash command."""
        command = tool_input.get("command", "")
        working_dir = tool_input.get("working_directory")
        timeout = tool_input.get("timeout", 30)

        if not command:
            return {"success": False, "error": "No command provided"}

        if not self.is_command_safe(command):
            return {"success": False, "error": "Command blocked for safety reasons"}

        logger.info(f"Running Bash command: {command[:100]}...")

        try:
            # Try bash first, fall back to sh
            shell = "bash"
            try:
                process = await asyncio.create_subprocess_exec(
                    shell,
                    "-c",
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=working_dir
                )
            except FileNotFoundError:
                shell = "sh"
                process = await asyncio.create_subprocess_exec(
                    shell,
                    "-c",
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=working_dir
                )

            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )

            stdout_str = stdout.decode("utf-8", errors="replace") if stdout else ""
            stderr_str = stderr.decode("utf-8", errors="replace") if stderr else ""

            result = {
                "success": process.returncode == 0,
                "exit_code": process.returncode,
                "stdout": stdout_str,
                "stderr": stderr_str
            }

            if process.returncode == 0:
                result["result"] = stdout_str
            else:
                result["error"] = stderr_str or f"Command failed with exit code {process.returncode}"

            logger.info(f"Bash command completed with exit code: {process.returncode}")
            return result

        except asyncio.TimeoutError:
            return {"success": False, "error": f"Command timed out after {timeout} seconds"}
        except FileNotFoundError:
            return {"success": False, "error": "Bash/sh not found on this system"}

    async def _read_file(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Read a file from the filesystem."""
        path = tool_input.get("path", "")
        encoding = tool_input.get("encoding", "utf-8")

        if not path:
            return {"success": False, "error": "No path provided"}

        logger.info(f"Reading file: {path}")

        try:
            with open(path, "r", encoding=encoding) as f:
                content = f.read()

            return {
                "success": True,
                "result": content,
                "path": path,
                "size": len(content)
            }
        except FileNotFoundError:
            return {"success": False, "error": f"File not found: {path}"}
        except PermissionError:
            return {"success": False, "error": f"Permission denied: {path}"}
        except UnicodeDecodeError as e:
            return {"success": False, "error": f"Encoding error: {e}"}

    async def _write_file(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Write content to a file."""
        path = tool_input.get("path", "")
        content = tool_input.get("content", "")
        encoding = tool_input.get("encoding", "utf-8")

        if not path:
            return {"success": False, "error": "No path provided"}

        logger.info(f"Writing file: {path} ({len(content)} bytes)")

        try:
            with open(path, "w", encoding=encoding) as f:
                f.write(content)

            return {
                "success": True,
                "result": f"Successfully wrote {len(content)} bytes to {path}",
                "path": path,
                "size": len(content)
            }
        except PermissionError:
            return {"success": False, "error": f"Permission denied: {path}"}
        except OSError as e:
            return {"success": False, "error": f"OS error: {e}"}

    async def _list_directory(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """List directory contents."""
        import os

        path = tool_input.get("path", ".")
        include_hidden = tool_input.get("include_hidden", False)

        logger.info(f"Listing directory: {path}")

        try:
            entries = os.listdir(path)

            if not include_hidden:
                entries = [e for e in entries if not e.startswith(".")]

            # Get details for each entry
            detailed_entries = []
            for entry in sorted(entries):
                full_path = os.path.join(path, entry)
                try:
                    stat = os.stat(full_path)
                    is_dir = os.path.isdir(full_path)
                    detailed_entries.append({
                        "name": entry,
                        "type": "directory" if is_dir else "file",
                        "size": stat.st_size if not is_dir else None
                    })
                except OSError:
                    detailed_entries.append({
                        "name": entry,
                        "type": "unknown",
                        "size": None
                    })

            return {
                "success": True,
                "result": detailed_entries,
                "path": path,
                "count": len(detailed_entries)
            }
        except FileNotFoundError:
            return {"success": False, "error": f"Directory not found: {path}"}
        except PermissionError:
            return {"success": False, "error": f"Permission denied: {path}"}


def get_tool_definitions() -> List[Dict[str, Any]]:
    """Get the list of tool definitions for Claude API."""
    return TOOLS


def get_allowed_tools() -> List[Dict[str, Any]]:
    """Get tool definitions filtered by permission manager.

    Returns:
        List of tool definitions that are allowed by the permission config.
    """
    permission_manager = get_permission_manager()
    if permission_manager is None:
        # No permission manager, return all tools
        return TOOLS

    return [
        tool for tool in TOOLS
        if permission_manager.is_tool_allowed(tool["name"])
    ]

