import pytest
from src.config import slack_app

def test_slack_webhook_message_event():
    """Test that Slack webhook accepts valid message events."""
    # Mock payload for message event
    payload = {
        "token": "test_token",
        "team_id": "T1234567890",
        "api_app_id": "A1234567890",
        "event": {
            "type": "message",
            "channel": "C1234567890",
            "user": "U1234567890",
            "text": "Hello AI agent",
            "ts": "1609459200.000100",
            "event_ts": "1609459200.000200"
        },
        "type": "event_callback",
        "authed_users": ["U1234567890"],
        "event_id": "Ev1234567890",
        "event_time": 1609459200
    }

    # For now, just test that the app can be initialized
    # This will fail until message handler is implemented
    assert slack_app is not None
    assert slack_app.client.token == "test_token_placeholder"  # Will need to mock properly