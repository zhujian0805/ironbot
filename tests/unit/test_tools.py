"""Tests for tool execution functionality."""

import pytest
import asyncio
from src.services.tools import ToolExecutor, get_tool_definitions, TOOLS


class TestToolDefinitions:
    """Test tool definitions structure."""

    def test_tools_list_not_empty(self):
        """Tools list should not be empty."""
        assert len(TOOLS) > 0

    def test_each_tool_has_required_fields(self):
        """Each tool should have name, description, and input_schema."""
        for tool in TOOLS:
            assert "name" in tool, f"Tool missing 'name': {tool}"
            assert "description" in tool, f"Tool missing 'description': {tool}"
            assert "input_schema" in tool, f"Tool missing 'input_schema': {tool}"

    def test_input_schema_has_type(self):
        """Each input_schema should have a type field."""
        for tool in TOOLS:
            schema = tool["input_schema"]
            assert "type" in schema, f"Tool {tool['name']} schema missing 'type'"
            assert schema["type"] == "object", f"Tool {tool['name']} schema type should be 'object'"

    def test_get_tool_definitions_returns_tools(self):
        """get_tool_definitions should return the tools list."""
        definitions = get_tool_definitions()
        assert definitions == TOOLS


class TestToolExecutor:
    """Test ToolExecutor class."""

    @pytest.fixture
    def executor(self):
        """Create a ToolExecutor instance."""
        return ToolExecutor()

    @pytest.fixture
    def restricted_executor(self):
        """Create a ToolExecutor with restricted tools."""
        return ToolExecutor(allowed_tools=["list_directory", "read_file"])

    def test_is_command_safe_blocks_dangerous(self, executor):
        """Should block dangerous commands."""
        dangerous_commands = [
            "rm -rf /",
            "format c:",
            "shutdown /s",
        ]
        for cmd in dangerous_commands:
            assert not executor.is_command_safe(cmd), f"Should block: {cmd}"

    def test_is_command_safe_allows_normal(self, executor):
        """Should allow normal commands."""
        safe_commands = [
            "Get-Process",
            "ls -la",
            "echo hello",
            "dir",
        ]
        for cmd in safe_commands:
            assert executor.is_command_safe(cmd), f"Should allow: {cmd}"

    @pytest.mark.asyncio
    async def test_unknown_tool_returns_error(self, executor):
        """Unknown tool should return error."""
        result = await executor.execute_tool("unknown_tool", {})
        assert not result["success"]
        assert "Unknown tool" in result["error"]

    @pytest.mark.asyncio
    async def test_restricted_executor_blocks_disallowed_tools(self, restricted_executor):
        """Restricted executor should block disallowed tools."""
        result = await restricted_executor.execute_tool("run_powershell", {"command": "Get-Date"})
        assert not result["success"]
        assert "not allowed" in result["error"]

    @pytest.mark.asyncio
    async def test_restricted_executor_allows_allowed_tools(self, restricted_executor):
        """Restricted executor should allow configured tools."""
        result = await restricted_executor.execute_tool("list_directory", {"path": "."})
        assert result["success"]


class TestPowerShellTool:
    """Test PowerShell tool execution."""

    @pytest.fixture
    def executor(self):
        return ToolExecutor()

    @pytest.mark.asyncio
    async def test_simple_powershell_command(self, executor):
        """Should execute simple PowerShell command."""
        result = await executor.execute_tool(
            "run_powershell",
            {"command": "Write-Output 'Hello World'"}
        )
        # May fail if not on Windows
        if result["success"]:
            assert "Hello World" in result["stdout"]

    @pytest.mark.asyncio
    async def test_powershell_empty_command(self, executor):
        """Should handle empty command."""
        result = await executor.execute_tool("run_powershell", {"command": ""})
        assert not result["success"]
        assert "No command" in result["error"]

    @pytest.mark.asyncio
    async def test_powershell_blocked_command(self, executor):
        """Should block dangerous commands."""
        result = await executor.execute_tool(
            "run_powershell",
            {"command": "rm -rf /"}
        )
        assert not result["success"]
        assert "blocked" in result["error"].lower()


class TestFileTools:
    """Test file operation tools."""

    @pytest.fixture
    def executor(self):
        return ToolExecutor()

    @pytest.mark.asyncio
    async def test_list_directory_current(self, executor):
        """Should list current directory."""
        result = await executor.execute_tool("list_directory", {"path": "."})
        assert result["success"]
        assert isinstance(result["result"], list)
        assert result["count"] >= 0

    @pytest.mark.asyncio
    async def test_list_directory_nonexistent(self, executor):
        """Should handle nonexistent directory."""
        result = await executor.execute_tool(
            "list_directory",
            {"path": "/nonexistent/path/12345"}
        )
        assert not result["success"]
        assert "not found" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_read_file_nonexistent(self, executor):
        """Should handle nonexistent file."""
        result = await executor.execute_tool(
            "read_file",
            {"path": "/nonexistent/file/12345.txt"}
        )
        assert not result["success"]
        assert "not found" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_read_file_empty_path(self, executor):
        """Should handle empty path."""
        result = await executor.execute_tool("read_file", {"path": ""})
        assert not result["success"]

    @pytest.mark.asyncio
    async def test_write_file_empty_path(self, executor):
        """Should handle empty path for write."""
        result = await executor.execute_tool(
            "write_file",
            {"path": "", "content": "test"}
        )
        assert not result["success"]


class TestToolIntegration:
    """Integration tests for tool execution flow."""

    @pytest.fixture
    def executor(self):
        return ToolExecutor()

    @pytest.mark.asyncio
    async def test_read_write_roundtrip(self, executor, tmp_path):
        """Should write and read back content."""
        test_file = tmp_path / "test.txt"
        test_content = "Hello, this is a test!"

        # Write
        write_result = await executor.execute_tool(
            "write_file",
            {"path": str(test_file), "content": test_content}
        )
        assert write_result["success"]

        # Read back
        read_result = await executor.execute_tool(
            "read_file",
            {"path": str(test_file)}
        )
        assert read_result["success"]
        assert read_result["result"] == test_content

    @pytest.mark.asyncio
    async def test_list_after_write(self, executor, tmp_path):
        """Should see file after writing it."""
        test_file = tmp_path / "newfile.txt"

        # Write file
        await executor.execute_tool(
            "write_file",
            {"path": str(test_file), "content": "content"}
        )

        # List directory
        list_result = await executor.execute_tool(
            "list_directory",
            {"path": str(tmp_path)}
        )
        assert list_result["success"]
        names = [e["name"] for e in list_result["result"]]
        assert "newfile.txt" in names
