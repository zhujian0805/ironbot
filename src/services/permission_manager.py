"""Permission Manager for controlling bot capabilities.

Loads and enforces tool, skill, and MCP permissions from a YAML configuration file.
Supports wildcard patterns, resource deny rules, and hot-reload.
"""

import fnmatch
import os
import threading
import time
from pathlib import Path
from typing import Dict, Any, Optional, List, Callable
import yaml

from ..models.permission import (
    PermissionConfig,
    GlobalSettings,
    ToolPermissions,
    ToolRestriction,
    SkillPermissions,
    MCPPermissions,
    MCPSettings,
    ResourceDenyRules,
)
from ..utils.logging import logger


class PermissionManager:
    """Manages bot capability permissions loaded from YAML configuration."""

    def __init__(self, config_path: str):
        """Initialize the permission manager.

        Args:
            config_path: Path to the permissions.yaml configuration file.
        """
        self.config_path = config_path
        self.config: PermissionConfig = PermissionConfig.default_deny_all()
        self._loaded = False

    def load_config(self) -> bool:
        """Load configuration from YAML file.

        Returns:
            True if config loaded successfully, False if using default-deny fallback.
        """
        if not os.path.exists(self.config_path):
            if logger:
                logger.warning(
                    f"Permission config not found at {self.config_path}, using default-deny"
                )
            self.config = PermissionConfig.default_deny_all()
            self._loaded = True
            return False

        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                raw_config = yaml.safe_load(f)

            if raw_config is None:
                if logger:
                    logger.warning(
                        f"Empty permission config at {self.config_path}, using default-deny"
                    )
                self.config = PermissionConfig.default_deny_all()
                self._loaded = True
                return False

            self.config = self._parse_config(raw_config)
            self._loaded = True

            if logger:
                logger.info(
                    f"Loaded permissions from {self.config_path}: "
                    f"{len(self.config.tools.allowed)} tools, "
                    f"{len(self.config.skills.allowed)} skills, "
                    f"{len(self.config.mcps.allowed)} MCPs"
                )

            return True

        except yaml.YAMLError as e:
            if logger:
                logger.error(f"Invalid YAML in permission config: {e}")
            self.config = PermissionConfig.default_deny_all()
            self._loaded = True
            return False
        except Exception as e:
            if logger:
                logger.error(f"Error loading permission config: {e}")
            self.config = PermissionConfig.default_deny_all()
            self._loaded = True
            return False

    def _parse_config(self, raw: Dict[str, Any]) -> PermissionConfig:
        """Parse raw YAML dict into PermissionConfig dataclass.

        Args:
            raw: Raw dictionary from YAML parsing.

        Returns:
            Parsed PermissionConfig object.
        """
        # Parse global settings
        raw_settings = raw.get("settings", {})
        settings = GlobalSettings(
            default_deny=raw_settings.get("default_deny", True),
            log_denials=raw_settings.get("log_denials", True),
        )

        # Parse tool permissions
        raw_tools = raw.get("tools", {})
        tool_restrictions = {}
        for tool_name, restriction_data in raw_tools.get("restrictions", {}).items():
            tool_restrictions[tool_name] = ToolRestriction(
                allowed_commands=restriction_data.get("allowed_commands", []),
                blocked_commands=restriction_data.get("blocked_commands", []),
                allowed_paths=restriction_data.get("allowed_paths", []),
                timeout_max=restriction_data.get("timeout_max"),
            )
        tools = ToolPermissions(
            allowed=raw_tools.get("allowed", []),
            restrictions=tool_restrictions,
        )

        # Parse skill permissions
        raw_skills = raw.get("skills", {})
        skills = SkillPermissions(allowed=raw_skills.get("allowed", []))

        # Parse MCP permissions
        raw_mcps = raw.get("mcps", {})
        mcp_settings = {}
        for mcp_name, settings_data in raw_mcps.get("settings", {}).items():
            mcp_settings[mcp_name] = MCPSettings(
                allowed_paths=settings_data.get("allowed_paths", []),
                allowed_repos=settings_data.get("allowed_repos", []),
            )
        mcps = MCPPermissions(
            allowed=raw_mcps.get("allowed", []),
            settings=mcp_settings,
        )

        # Parse resource deny rules
        raw_resources = raw.get("resources", {})
        resources = ResourceDenyRules(
            denied_paths=raw_resources.get("denied_paths", [])
        )

        return PermissionConfig(
            version=raw.get("version", "1.0"),
            settings=settings,
            tools=tools,
            skills=skills,
            mcps=mcps,
            resources=resources,
        )

    def _matches_pattern(self, name: str, patterns: List[str]) -> bool:
        """Check if a name matches any of the given patterns.

        Args:
            name: The name to check.
            patterns: List of patterns (supports fnmatch wildcards).

        Returns:
            True if name matches any pattern.
        """
        for pattern in patterns:
            if fnmatch.fnmatch(name, pattern):
                return True
        return False

    def is_tool_allowed(self, tool_name: str) -> bool:
        """Check if a tool is allowed.

        Args:
            tool_name: Name of the tool to check.

        Returns:
            True if tool is allowed, False otherwise.
        """
        if not tool_name:
            return False

        allowed = self._matches_pattern(tool_name, self.config.tools.allowed)

        if not allowed and self.config.settings.log_denials and logger:
            logger.warning(f"Permission denied: tool '{tool_name}' not in allowed list")

        return allowed

    def is_skill_allowed(self, skill_name: str) -> bool:
        """Check if a skill is allowed.

        Args:
            skill_name: Name of the skill to check.

        Returns:
            True if skill is allowed, False otherwise.
        """
        if not skill_name:
            return False

        allowed = self._matches_pattern(skill_name, self.config.skills.allowed)

        if not allowed and self.config.settings.log_denials and logger:
            logger.warning(f"Permission denied: skill '{skill_name}' not in allowed list")

        return allowed

    def is_mcp_allowed(self, mcp_name: str) -> bool:
        """Check if an MCP is allowed.

        Args:
            mcp_name: Name/identifier of the MCP to check.

        Returns:
            True if MCP is allowed, False otherwise.
        """
        if not mcp_name:
            return False

        allowed = self._matches_pattern(mcp_name, self.config.mcps.allowed)

        if not allowed and self.config.settings.log_denials and logger:
            logger.warning(f"Permission denied: MCP '{mcp_name}' not in allowed list")

        return allowed

    def check_resource_denied(self, path: str) -> bool:
        """Check if a resource path is denied.

        Deny rules take precedence over allow rules.

        Args:
            path: The resource path to check.

        Returns:
            True if path is DENIED, False if allowed.
        """
        if not path:
            return False

        # Normalize path separators for cross-platform matching
        normalized_path = path.replace("\\", "/")

        denied = self._matches_pattern(normalized_path, self.config.resources.denied_paths)

        # Also check with original path for Windows patterns
        if not denied:
            denied = self._matches_pattern(path, self.config.resources.denied_paths)

        if denied and self.config.settings.log_denials and logger:
            logger.warning(f"Permission denied: resource path '{path}' matches deny rule")

        return denied

    def get_tool_restrictions(self, tool_name: str) -> Optional[ToolRestriction]:
        """Get restrictions for a specific tool.

        Args:
            tool_name: Name of the tool.

        Returns:
            ToolRestriction if restrictions exist, None otherwise.
        """
        return self.config.tools.restrictions.get(tool_name)

    def check_permission(
        self, capability_type: str, name: str, path: Optional[str] = None
    ) -> Dict[str, Any]:
        """Check permission and return detailed result.

        Args:
            capability_type: Type of capability ('tool', 'skill', 'mcp').
            name: Name of the capability.
            path: Optional resource path to check.

        Returns:
            Dict with 'allowed' bool and 'reason' string.
        """
        result = {"allowed": False, "reason": ""}

        # Check capability permission
        if capability_type == "tool":
            result["allowed"] = self.is_tool_allowed(name)
            if not result["allowed"]:
                result["reason"] = f"Tool '{name}' is not in the allowed list"
        elif capability_type == "skill":
            result["allowed"] = self.is_skill_allowed(name)
            if not result["allowed"]:
                result["reason"] = f"Skill '{name}' is not in the allowed list"
        elif capability_type == "mcp":
            result["allowed"] = self.is_mcp_allowed(name)
            if not result["allowed"]:
                result["reason"] = f"MCP '{name}' is not in the allowed list"
        else:
            result["reason"] = f"Unknown capability type: {capability_type}"
            return result

        # If capability is allowed, also check resource path
        if result["allowed"] and path:
            if self.check_resource_denied(path):
                result["allowed"] = False
                result["reason"] = f"Resource path '{path}' is denied"

        return result

    def format_denial_message(
        self, capability_type: str, name: str, reason: Optional[str] = None
    ) -> str:
        """Format a user-friendly denial message.

        Args:
            capability_type: Type of capability ('tool', 'skill', 'mcp').
            name: Name of the denied capability.
            reason: Optional specific reason.

        Returns:
            Formatted denial message.
        """
        if reason:
            return f"Permission denied: {reason}"

        type_label = capability_type.capitalize()
        return f"Permission denied: {type_label} '{name}' is not enabled in the current configuration."

    def list_allowed_capabilities(self) -> Dict[str, List[str]]:
        """List all allowed capabilities.

        Returns:
            Dict with 'tools', 'skills', 'mcps' lists.
        """
        return {
            "tools": list(self.config.tools.allowed),
            "skills": list(self.config.skills.allowed),
            "mcps": list(self.config.mcps.allowed),
        }

    def reload_config(self) -> bool:
        """Reload configuration from file.

        Atomic swap - keeps old config if reload fails.

        Returns:
            True if reload successful, False otherwise.
        """
        old_config = self.config

        try:
            success = self.load_config()
            if logger:
                logger.info("Permission configuration reloaded successfully")
            return success
        except Exception as e:
            # Restore old config on failure
            self.config = old_config
            if logger:
                logger.error(f"Failed to reload permission config, keeping previous: {e}")
            return False

    def start_file_watcher(self, debounce_seconds: float = 1.0) -> bool:
        """Start watching the config file for changes.

        Args:
            debounce_seconds: Minimum time between reloads to prevent rapid reloads.

        Returns:
            True if watcher started, False if watchdog not available.
        """
        try:
            from watchdog.observers import Observer
            from watchdog.events import FileSystemEventHandler, FileModifiedEvent
        except ImportError:
            if logger:
                logger.warning("watchdog not installed, file watching disabled")
            return False

        class ConfigFileHandler(FileSystemEventHandler):
            def __init__(handler_self, manager: 'PermissionManager', debounce: float):
                handler_self.manager = manager
                handler_self.debounce = debounce
                handler_self.last_reload = 0.0

            def on_modified(handler_self, event):
                if event.is_directory:
                    return

                # Check if it's our config file
                event_path = Path(event.src_path).resolve()
                config_path = Path(handler_self.manager.config_path).resolve()

                if event_path != config_path:
                    return

                # Debounce - prevent multiple reloads
                now = time.time()
                if now - handler_self.last_reload < handler_self.debounce:
                    return

                handler_self.last_reload = now

                if logger:
                    logger.info(f"Config file change detected: {event.src_path}")

                # Reload in a separate thread to avoid blocking
                threading.Thread(
                    target=handler_self.manager.reload_config,
                    daemon=True
                ).start()

        # Get the directory containing the config file
        config_dir = str(Path(self.config_path).parent.resolve())

        handler = ConfigFileHandler(self, debounce_seconds)
        self._observer = Observer()
        self._observer.schedule(handler, config_dir, recursive=False)
        self._observer.start()

        if logger:
            logger.info(f"Started watching {self.config_path} for changes")

        return True

    def stop_file_watcher(self):
        """Stop the file watcher if running."""
        if hasattr(self, '_observer') and self._observer:
            self._observer.stop()
            self._observer.join(timeout=5.0)
            self._observer = None
            if logger:
                logger.info("Stopped config file watcher")


# Global permission manager instance (initialized in main.py)
_permission_manager: Optional[PermissionManager] = None


def get_permission_manager() -> Optional[PermissionManager]:
    """Get the global permission manager instance."""
    return _permission_manager


def init_permission_manager(config_path: str) -> PermissionManager:
    """Initialize the global permission manager.

    Args:
        config_path: Path to permissions.yaml.

    Returns:
        The initialized PermissionManager.
    """
    global _permission_manager
    _permission_manager = PermissionManager(config_path)
    _permission_manager.load_config()
    return _permission_manager
