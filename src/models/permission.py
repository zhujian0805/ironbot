"""Permission data models for the bot capability configuration."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class GlobalSettings:
    """Global permission settings."""
    default_deny: bool = True
    log_denials: bool = True


@dataclass
class ToolRestriction:
    """Restrictions for a specific tool."""
    allowed_commands: list[str] = field(default_factory=list)
    blocked_commands: list[str] = field(default_factory=list)
    allowed_paths: list[str] = field(default_factory=list)
    timeout_max: Optional[int] = None


@dataclass
class ToolPermissions:
    """Tool permission configuration."""
    allowed: list[str] = field(default_factory=list)
    restrictions: dict[str, ToolRestriction] = field(default_factory=dict)


@dataclass
class SkillPermissions:
    """Skill permission configuration."""
    allowed: list[str] = field(default_factory=list)


@dataclass
class MCPSettings:
    """Settings for a specific MCP."""
    allowed_paths: list[str] = field(default_factory=list)
    allowed_repos: list[str] = field(default_factory=list)


@dataclass
class MCPPermissions:
    """MCP permission configuration."""
    allowed: list[str] = field(default_factory=list)
    settings: dict[str, MCPSettings] = field(default_factory=dict)


@dataclass
class ResourceDenyRules:
    """Resource-level deny rules that block operations regardless of tool permissions."""
    denied_paths: list[str] = field(default_factory=list)


@dataclass
class PermissionConfig:
    """The complete permission configuration loaded from YAML."""
    version: str = "1.0"
    settings: GlobalSettings = field(default_factory=GlobalSettings)
    tools: ToolPermissions = field(default_factory=ToolPermissions)
    skills: SkillPermissions = field(default_factory=SkillPermissions)
    mcps: MCPPermissions = field(default_factory=MCPPermissions)
    resources: ResourceDenyRules = field(default_factory=ResourceDenyRules)

    @classmethod
    def default_deny_all(cls) -> "PermissionConfig":
        """Create a default configuration that denies all capabilities."""
        return cls(
            version="1.0",
            settings=GlobalSettings(default_deny=True, log_denials=True),
            tools=ToolPermissions(allowed=[]),
            skills=SkillPermissions(allowed=[]),
            mcps=MCPPermissions(allowed=[]),
            resources=ResourceDenyRules(denied_paths=[])
        )
