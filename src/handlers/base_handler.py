from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseMessageHandler(ABC):
    """Base class for message handlers in the Slack AI agent."""

    def __init__(self, slack_app):
        self.slack_app = slack_app

    @abstractmethod
    async def handle_message(self, message: Dict[str, Any], say, logger) -> None:
        """Handle incoming message from Slack.

        Args:
            message: Slack message payload
            say: Slack say function to respond
            logger: Logger instance
        """
        pass

    def register_handlers(self):
        """Register event handlers with the Slack app."""
        pass