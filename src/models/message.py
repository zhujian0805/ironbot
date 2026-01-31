from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class Message:
    """Represents a user message from Slack."""

    id: str
    content: str
    timestamp: datetime
    user_id: str
    channel_id: str

    @classmethod
    def from_slack_event(cls, event: dict) -> "Message":
        """Create Message instance from Slack event."""
        return cls(
            id=event.get("ts", ""),
            content=event.get("text", ""),
            timestamp=datetime.fromtimestamp(float(event.get("ts", 0))),
            user_id=event.get("user", ""),
            channel_id=event.get("channel", "")
        )