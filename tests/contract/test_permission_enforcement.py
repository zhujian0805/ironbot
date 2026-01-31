"""Contract tests for permission enforcement.

These tests verify that the permission system correctly integrates with
the tool execution layer.
"""

import pytest
import tempfile
from pathlib import Path


class TestPermissionEnforcementContract:
    """T013: Contract tests for permission enforcement in tool execution."""

    @pytest.fixture
    def restrictive_config(self, tmp_path):
        """Create a restrictive permission config."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
settings:
  default_deny: true
  log_denials: true
tools:
  allowed:
    - "list_directory"
    - "read_file"
resources:
  denied_paths:
    - "/etc/*"
    - "*/secrets/*"
skills:
  allowed: []
mcps:
  allowed: []
""")
        return str(config_file)

    @pytest.fixture
    def permissive_config(self, tmp_path):
        """Create a permissive permission config."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
settings:
  default_deny: false
  log_denials: true
tools:
  allowed:
    - "*"
resources:
  denied_paths: []
skills:
  allowed:
    - "*"
mcps:
  allowed:
    - "*"
""")
        return str(config_file)

    def test_tool_executor_respects_permission_manager(self, restrictive_config):
        """ToolExecutor should check PermissionManager before execution."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(restrictive_config)
        manager.load_config()

        # Allowed tool
        assert manager.is_tool_allowed("list_directory") is True
        assert manager.is_tool_allowed("read_file") is True

        # Blocked tool
        assert manager.is_tool_allowed("write_file") is False
        assert manager.is_tool_allowed("run_powershell") is False
        assert manager.is_tool_allowed("run_bash") is False

    def test_resource_path_checked_before_tool_execution(self, restrictive_config):
        """Resource paths should be checked even when tool is allowed."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(restrictive_config)
        manager.load_config()

        # Tool is allowed
        assert manager.is_tool_allowed("read_file") is True

        # But sensitive paths are denied
        assert manager.check_resource_denied("/etc/passwd") is True
        assert manager.check_resource_denied("/app/secrets/key.pem") is True

        # Normal paths are allowed
        assert manager.check_resource_denied("/home/user/document.txt") is False

    def test_default_deny_blocks_unlisted_tools(self, restrictive_config):
        """Default-deny mode should block any unlisted tool."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(restrictive_config)
        manager.load_config()

        assert manager.config.settings.default_deny is True

        # Unlisted tools should be blocked
        assert manager.is_tool_allowed("unknown_tool") is False
        assert manager.is_tool_allowed("") is False

    def test_wildcard_allow_all(self, permissive_config):
        """Wildcard '*' should allow all tools."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(permissive_config)
        manager.load_config()

        assert manager.is_tool_allowed("any_tool") is True
        assert manager.is_tool_allowed("run_powershell") is True
        assert manager.is_tool_allowed("run_bash") is True

    def test_permission_result_includes_reason(self, restrictive_config):
        """Permission denials should include a reason."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(restrictive_config)
        manager.load_config()

        result = manager.check_permission("tool", "run_bash")

        assert result["allowed"] is False
        assert "reason" in result
        assert "run_bash" in result["reason"] or "not" in result["reason"].lower()

    def test_skills_enforcement(self, restrictive_config):
        """Skills should be blocked when not in allowed list."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(restrictive_config)
        manager.load_config()

        # Empty allowed list means all skills blocked
        assert manager.is_skill_allowed("any_skill") is False

    def test_mcps_enforcement(self, restrictive_config):
        """MCPs should be blocked when not in allowed list."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(restrictive_config)
        manager.load_config()

        # Empty allowed list means all MCPs blocked
        assert manager.is_mcp_allowed("filesystem") is False
        assert manager.is_mcp_allowed("github") is False
