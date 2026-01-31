from dataclasses import dataclass

@dataclass
class Skill:
    """Represents a Claude Skill."""

    name: str
    path: str
    description: str

    def execute(self, query: str) -> str:
        """Execute the skill with the given query."""
        # This would be implemented by the skill loader
        pass