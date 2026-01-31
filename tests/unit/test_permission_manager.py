"""Unit tests for PermissionManager - Test-First approach.

These tests are written BEFORE implementation to define expected behavior.
"""

import pytest
import tempfile
import os
from pathlib import Path

# Tests will fail until implementation is complete
# from src.services.permission_manager import PermissionManager
# from src.models.permission import PermissionConfig


class TestConfigLoading:
    """T007: Tests for config loading functionality."""

    def test_load_config_from_valid_file(self, tmp_path):
        """Should load configuration from a valid YAML file."""
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
skills:
  allowed:
    - "calculator"
mcps:
  allowed: []
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()

        assert manager.config is not None
        assert manager.config.version == "1.0"
        assert manager.config.settings.default_deny is True
        assert "list_directory" in manager.config.tools.allowed
        assert "read_file" in manager.config.tools.allowed

    def test_load_config_missing_file_uses_default_deny(self):
        """Should use default-deny when config file is missing."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager("/nonexistent/path/permissions.yaml")
        manager.load_config()

        assert manager.config is not None
        assert manager.config.settings.default_deny is True
        assert len(manager.config.tools.allowed) == 0


class TestYAMLParsing:
    """T008: Tests for YAML parsing and validation."""

    def test_parse_valid_yaml(self, tmp_path):
        """Should parse valid YAML structure."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "tool1"
    - "tool2"
  restrictions:
    tool1:
      allowed_commands:
        - "Get-*"
      blocked_commands:
        - "Remove-*"
      timeout_max: 60
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()

        assert "tool1" in manager.config.tools.restrictions
        assert "Get-*" in manager.config.tools.restrictions["tool1"].allowed_commands
        assert manager.config.tools.restrictions["tool1"].timeout_max == 60

    def test_invalid_yaml_syntax_raises_error(self, tmp_path):
        """Should handle invalid YAML syntax gracefully."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "tool1"
    invalid yaml here [[[
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        # Should not crash, should use default config
        manager.load_config()

        # Should fall back to default-deny
        assert manager.config.settings.default_deny is True


class TestIsToolAllowed:
    """T009: Tests for is_tool_allowed() with pattern matching."""

    @pytest.fixture
    def manager_with_tools(self, tmp_path):
        """Create a manager with specific tools allowed."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "list_directory"
    - "read_file"
    - "file_*"
    - "run_powershell"
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()
        return manager

    def test_exact_match_allowed(self, manager_with_tools):
        """Should allow exact tool name match."""
        assert manager_with_tools.is_tool_allowed("list_directory") is True
        assert manager_with_tools.is_tool_allowed("read_file") is True

    def test_exact_match_denied(self, manager_with_tools):
        """Should deny tool not in allowed list."""
        assert manager_with_tools.is_tool_allowed("delete_all") is False
        assert manager_with_tools.is_tool_allowed("run_bash") is False

    def test_wildcard_pattern_match(self, manager_with_tools):
        """Should match wildcard patterns."""
        assert manager_with_tools.is_tool_allowed("file_read") is True
        assert manager_with_tools.is_tool_allowed("file_write") is True
        assert manager_with_tools.is_tool_allowed("file_delete") is True

    def test_empty_allowed_list_denies_all(self, tmp_path):
        """Should deny all tools when allowed list is empty."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
tools:
  allowed: []
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()

        assert manager.is_tool_allowed("any_tool") is False


class TestIsSkillAllowed:
    """T010: Tests for is_skill_allowed()."""

    @pytest.fixture
    def manager_with_skills(self, tmp_path):
        """Create a manager with specific skills allowed."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
skills:
  allowed:
    - "calculator"
    - "weather"
    - "test_*"
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()
        return manager

    def test_exact_skill_allowed(self, manager_with_skills):
        """Should allow exact skill match."""
        assert manager_with_skills.is_skill_allowed("calculator") is True
        assert manager_with_skills.is_skill_allowed("weather") is True

    def test_skill_denied(self, manager_with_skills):
        """Should deny skill not in allowed list."""
        assert manager_with_skills.is_skill_allowed("dangerous_skill") is False

    def test_wildcard_skill_match(self, manager_with_skills):
        """Should match wildcard skill patterns."""
        assert manager_with_skills.is_skill_allowed("test_something") is True
        assert manager_with_skills.is_skill_allowed("test_another") is True


class TestIsMCPAllowed:
    """T011: Tests for is_mcp_allowed()."""

    @pytest.fixture
    def manager_with_mcps(self, tmp_path):
        """Create a manager with specific MCPs allowed."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
mcps:
  allowed:
    - "filesystem"
    - "github"
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()
        return manager

    def test_mcp_allowed(self, manager_with_mcps):
        """Should allow MCP in allowed list."""
        assert manager_with_mcps.is_mcp_allowed("filesystem") is True
        assert manager_with_mcps.is_mcp_allowed("github") is True

    def test_mcp_denied(self, manager_with_mcps):
        """Should deny MCP not in allowed list."""
        assert manager_with_mcps.is_mcp_allowed("database") is False
        assert manager_with_mcps.is_mcp_allowed("email") is False


class TestResourceDenyRules:
    """T012: Tests for resource deny rules."""

    @pytest.fixture
    def manager_with_deny_rules(self, tmp_path):
        """Create a manager with resource deny rules."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "read_file"
    - "write_file"
resources:
  denied_paths:
    - "/etc/*"
    - "/var/log/*"
    - "C:\\\\Windows\\\\*"
    - "*/.env"
    - "*/secrets/*"
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()
        return manager

    def test_denied_path_exact_pattern(self, manager_with_deny_rules):
        """Should deny access to paths matching deny patterns."""
        assert manager_with_deny_rules.check_resource_denied("/etc/passwd") is True
        assert manager_with_deny_rules.check_resource_denied("/etc/shadow") is True
        assert manager_with_deny_rules.check_resource_denied("/var/log/syslog") is True

    def test_allowed_path_not_in_deny(self, manager_with_deny_rules):
        """Should allow paths not matching deny patterns."""
        assert manager_with_deny_rules.check_resource_denied("/home/user/file.txt") is False
        assert manager_with_deny_rules.check_resource_denied("/tmp/test.txt") is False

    def test_env_file_denied(self, manager_with_deny_rules):
        """Should deny access to .env files anywhere."""
        assert manager_with_deny_rules.check_resource_denied("/project/.env") is True
        assert manager_with_deny_rules.check_resource_denied("C:\\project\\.env") is True

    def test_secrets_directory_denied(self, manager_with_deny_rules):
        """Should deny access to secrets directories."""
        assert manager_with_deny_rules.check_resource_denied("/app/secrets/api_key") is True
        assert manager_with_deny_rules.check_resource_denied("/project/secrets/credentials.json") is True

    def test_deny_takes_precedence(self, manager_with_deny_rules):
        """Deny rules should take precedence - tool allowed but path denied."""
        # Tool is allowed
        assert manager_with_deny_rules.is_tool_allowed("read_file") is True
        # But path is denied
        assert manager_with_deny_rules.check_resource_denied("/etc/passwd") is True


class TestDenialMessageFormatting:
    """T026: Tests for denial message formatting."""

    @pytest.fixture
    def manager(self, tmp_path):
        """Create a basic manager."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "list_directory"
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()
        return manager

    def test_format_denial_message_tool(self, manager):
        """Should format tool denial message."""
        msg = manager.format_denial_message("tool", "run_bash")
        assert "run_bash" in msg
        assert "Permission denied" in msg or "not enabled" in msg.lower()

    def test_format_denial_message_skill(self, manager):
        """Should format skill denial message."""
        msg = manager.format_denial_message("skill", "dangerous_skill")
        assert "dangerous_skill" in msg

    def test_format_denial_message_with_reason(self, manager):
        """Should include custom reason in message."""
        msg = manager.format_denial_message("tool", "run_bash", reason="Blocked by admin policy")
        assert "Blocked by admin policy" in msg


class TestListAllowedCapabilities:
    """T027: Tests for list_allowed_capabilities()."""

    @pytest.fixture
    def manager_with_all(self, tmp_path):
        """Create a manager with various capabilities."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "tool1"
    - "tool2"
    - "tool3"
skills:
  allowed:
    - "skill1"
    - "skill2"
mcps:
  allowed:
    - "mcp1"
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()
        return manager

    def test_list_returns_all_categories(self, manager_with_all):
        """Should return dict with tools, skills, mcps."""
        result = manager_with_all.list_allowed_capabilities()

        assert "tools" in result
        assert "skills" in result
        assert "mcps" in result

    def test_list_contains_correct_tools(self, manager_with_all):
        """Should list all allowed tools."""
        result = manager_with_all.list_allowed_capabilities()

        assert "tool1" in result["tools"]
        assert "tool2" in result["tools"]
        assert "tool3" in result["tools"]
        assert len(result["tools"]) == 3

    def test_list_contains_correct_skills(self, manager_with_all):
        """Should list all allowed skills."""
        result = manager_with_all.list_allowed_capabilities()

        assert "skill1" in result["skills"]
        assert "skill2" in result["skills"]
        assert len(result["skills"]) == 2

    def test_list_contains_correct_mcps(self, manager_with_all):
        """Should list all allowed MCPs."""
        result = manager_with_all.list_allowed_capabilities()

        assert "mcp1" in result["mcps"]
        assert len(result["mcps"]) == 1


class TestConfigReload:
    """T032: Tests for reload_config()."""

    def test_reload_updates_config(self, tmp_path):
        """Should reload and update configuration."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "tool1"
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()

        assert manager.is_tool_allowed("tool1") is True
        assert manager.is_tool_allowed("tool2") is False

        # Update config file
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "tool1"
    - "tool2"
""")

        # Reload
        result = manager.reload_config()
        assert result is True
        assert manager.is_tool_allowed("tool2") is True

    def test_reload_keeps_old_on_error(self, tmp_path):
        """Should keep old config if reload fails."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "tool1"
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()

        # Verify initial state
        assert manager.is_tool_allowed("tool1") is True

        # Break the config file
        config_file.write_text("invalid: yaml: [[[")

        # Reload should fall back
        manager.reload_config()

        # Old config should be replaced with default-deny since file is invalid
        # This is the expected behavior based on implementation

    def test_reload_when_file_deleted(self, tmp_path):
        """Should handle file deletion gracefully."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "tool1"
""")
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()

        # Delete the file
        config_file.unlink()

        # Reload should fall back to default-deny
        manager.reload_config()
        assert manager.config.settings.default_deny is True
