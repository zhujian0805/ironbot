"""Integration tests for permission configuration hot-reload.

T033: Tests for file watcher integration.
"""

import pytest
import asyncio
import tempfile
import time
from pathlib import Path


class TestPermissionReloadIntegration:
    """Integration tests for hot-reload functionality."""

    @pytest.fixture
    def config_file(self, tmp_path):
        """Create a temporary config file."""
        config_file = tmp_path / "permissions.yaml"
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "list_directory"
    - "read_file"
skills:
  allowed: []
mcps:
  allowed: []
""")
        return config_file

    def test_manual_reload_detects_changes(self, config_file):
        """Manual reload should detect and apply changes."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()

        # Initial state
        assert manager.is_tool_allowed("list_directory") is True
        assert manager.is_tool_allowed("write_file") is False

        # Modify config
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "list_directory"
    - "read_file"
    - "write_file"
skills:
  allowed: []
mcps:
  allowed: []
""")

        # Manual reload
        success = manager.reload_config()
        assert success is True

        # Verify change applied
        assert manager.is_tool_allowed("write_file") is True

    def test_reload_removes_previously_allowed(self, config_file):
        """Reload should correctly remove previously allowed items."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()

        # Initial state - read_file is allowed
        assert manager.is_tool_allowed("read_file") is True

        # Update config to remove read_file
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "list_directory"
skills:
  allowed: []
mcps:
  allowed: []
""")

        # Reload
        manager.reload_config()

        # read_file should now be blocked
        assert manager.is_tool_allowed("read_file") is False

    def test_reload_adds_resource_deny_rules(self, config_file):
        """Reload should correctly add new resource deny rules."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()

        # Initially no deny rules
        assert manager.check_resource_denied("/etc/passwd") is False

        # Add deny rules
        config_file.write_text("""
version: "1.0"
tools:
  allowed:
    - "list_directory"
resources:
  denied_paths:
    - "/etc/*"
""")

        # Reload
        manager.reload_config()

        # Deny rule should now be active
        assert manager.check_resource_denied("/etc/passwd") is True

    def test_reload_preserves_version(self, config_file):
        """Reload should update version field."""
        from src.services.permission_manager import PermissionManager

        manager = PermissionManager(str(config_file))
        manager.load_config()

        assert manager.config.version == "1.0"

        # Update with new version
        config_file.write_text("""
version: "2.0"
tools:
  allowed:
    - "list_directory"
""")

        manager.reload_config()
        assert manager.config.version == "2.0"
