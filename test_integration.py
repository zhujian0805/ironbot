#!/usr/bin/env python3
"""Integration test for message processing flow."""

import sys
import os
import asyncio
from unittest.mock import AsyncMock, patch

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

async def test_message_processing_flow():
    """Test the complete message processing flow with mocked Claude."""
    try:
        from src.models.message import Message
        from datetime import datetime

        # Create a test message
        message = Message(
            id="test123",
            content="Hello AI agent",
            timestamp=datetime.now(),
            user_id="U123",
            channel_id="C456"
        )

        # Mock Claude response
        mock_response = {
            "content": [{"type": "text", "text": "Hello! How can I help you today?"}]
        }

        # Test Claude processor with mocked client - patch before importing
        with patch("src.services.claude_processor.claude_client.messages.create") as mock_create:
            # Create a mock response object that matches Claude's API response
            mock_response_obj = type('MockResponse', (), {
                'content': [type('MockContent', (), {'text': 'Hello! How can I help you today?'})()]
            })()
            mock_create.return_value = mock_response_obj

            from src.services.claude_processor import ClaudeProcessor
            processor = ClaudeProcessor()
            result = await processor.process_message(message.content)

            print(f"[PASS] Message processing successful: {result}")
            return True

    except Exception as e:
        print(f"[FAIL] Message processing failed: {e}")
        return False

def test_slack_event_parsing():
    """Test parsing Slack events into Message objects."""
    try:
        from src.models.message import Message

        # Mock Slack event
        slack_event = {
            "type": "message",
            "channel": "C1234567890",
            "user": "U1234567890",
            "text": "Hello from Slack!",
            "ts": "1609459200.000100"
        }

        message = Message.from_slack_event(slack_event)

        assert message.content == "Hello from Slack!"
        assert message.user_id == "U1234567890"
        assert message.channel_id == "C1234567890"

        print(f"[PASS] Slack event parsing successful: {message.content}")
        return True

    except Exception as e:
        print(f"[FAIL] Slack event parsing failed: {e}")
        return False

if __name__ == "__main__":
    print("Testing ironbot integration functionality...")
    print()

    results = []
    results.append(test_slack_event_parsing())
    results.append(asyncio.run(test_message_processing_flow()))

    print()
    passed = sum(results)
    total = len(results)
    print(f"Integration tests passed: {passed}/{total}")

    if passed == total:
        print("SUCCESS: All integration tests passed!")
        sys.exit(0)
    else:
        print("FAILURE: Some integration tests failed")
        sys.exit(1)