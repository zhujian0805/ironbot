import asyncio
from typing import Dict, Any
from ..config import slack_app, claude_client
from ..models.message import Message
from ..models.user import User
from .claude_processor import ClaudeProcessor
from ..utils.logging import logger
import time

class SlackMessageHandler:
    """Handles Slack message events and coordinates with Claude."""

    def __init__(self):
        self.slack_app = slack_app
        self.claude_processor = ClaudeProcessor()

    def register_handlers(self):
        """Register event handlers."""
        logger.info("Registering Slack event handlers")

        @self.slack_app.event("message")
        async def handle_message(event, say):
            logger.info(f"Received message event: {event.get('type')} from user {event.get('user')}")
            await self._handle_message(event, say)

        @self.slack_app.event("app_mention")
        async def handle_app_mention(event, say):
            logger.info(f"Received app mention event: {event.get('type')} from user {event.get('user')}")
            await self._handle_message(event, say)

        logger.info("Event handlers registered successfully")

    async def _handle_message(self, event: Dict[str, Any], say):
        """Handle incoming message event."""
        start_time = time.time()
        channel = event.get("channel")
        thinking_ts = None

        try:
            logger.info(f"Processing message event: {event}")
            logger.debug(f"Received Slack event: {event}")

            # Create message object
            message = Message.from_slack_event(event)
            logger.info(f"Parsed message: user_id={message.user_id}, content='{message.content}', channel={channel}")
            logger.debug(f"Parsed message: user_id={message.user_id}, content_length={len(message.content)}")

            # Skip bot messages - but be more careful about this
            if event.get("bot_id"):
                logger.info(f"Skipping bot message from bot_id: {event.get('bot_id')}, subtype: {event.get('subtype')}")
                return

            logger.info(f"Processing message from user {message.user_id}")
            logger.debug(f"Message content: {message.content[:100]}{'...' if len(message.content) > 100 else ''}")

            # Post "thinking" indicator message
            try:
                thinking_response = await self.slack_app.client.chat_postMessage(
                    channel=channel,
                    text=":thinking_face: Thinking..."
                )
                thinking_ts = thinking_response.get("ts")
                logger.info(f"Posted thinking indicator: ts={thinking_ts}")
            except Exception as thinking_error:
                logger.warning(f"Failed to post thinking indicator: {thinking_error}")

            # Get Claude response
            logger.info("Calling Claude processor...")
            claude_start = time.time()
            response = await self.claude_processor.process_message(message.content)
            claude_time = time.time() - claude_start
            logger.info(f"Claude processor returned after {claude_time:.2f} seconds")

            logger.info(f"Received Claude response: {len(response) if response else 0} characters")
            logger.debug(f"Response content: {response[:100] if response else 'None'}{'...' if response and len(response) > 100 else ''}")

            # Update the thinking message with the actual response, or send new if no thinking message
            logger.info("Sending response to Slack")
            try:
                if thinking_ts:
                    await self.slack_app.client.chat_update(
                        channel=channel,
                        ts=thinking_ts,
                        text=response
                    )
                    logger.info("Updated thinking message with response")
                else:
                    await say(response)
                    logger.info("Response sent successfully to Slack")
            except Exception as say_error:
                logger.error(f"Failed to send response to Slack: {say_error}")
                logger.debug(f"Failed response content: {response[:100] if response else 'None'}{'...' if response and len(response) > 100 else ''}")
                # Try sending as a new message if update failed
                try:
                    await say(response)
                    logger.info("Fallback: sent response as new message")
                except Exception as fallback_error:
                    logger.error(f"Fallback send also failed: {fallback_error}")

            processing_time = time.time() - start_time
            logger.info(f"Message processing completed in {processing_time:.2f} seconds")

        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"Error handling message after {processing_time:.2f} seconds: {e}")
            logger.debug(f"Event that caused error: {event}", exc_info=True)
            try:
                # Update thinking message with error, or send new error message
                error_msg = "Sorry, I encountered an error processing your message."
                if thinking_ts:
                    await self.slack_app.client.chat_update(
                        channel=channel,
                        ts=thinking_ts,
                        text=f":x: {error_msg}"
                    )
                else:
                    await say(error_msg)
                logger.info("Error message sent successfully to Slack")
            except Exception as say_error:
                logger.error(f"Failed to send error message to Slack: {say_error}")