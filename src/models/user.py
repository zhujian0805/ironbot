from dataclasses import dataclass

@dataclass
class User:
    """Represents a Slack user."""

    id: str
    name: str

    @classmethod
    def from_slack_user_id(cls, user_id: str, slack_client) -> "User":
        """Create User instance from Slack user ID."""
        # TODO: Fetch user info from Slack API
        return cls(id=user_id, name=f"User {user_id}")