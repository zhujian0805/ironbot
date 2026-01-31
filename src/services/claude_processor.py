import asyncio
from typing import Dict, Any
from ..config import claude_client, ANTHROPIC_MODEL, DEV_MODE
from ..models.message import Message
from ..models.user import User
from .skill_loader import SkillLoader
from ..utils.logging import logger
import time
import random

class ClaudeProcessor:
    """Processes messages using Claude AI and skills."""

    def __init__(self):
        self.skill_loader = SkillLoader("./skills")
        self.skills = self.skill_loader.load_skills()

    async def process_message(self, user_message: str) -> str:
        """Process user message and return AI response."""
        try:
            logger.info(f"ClaudeProcessor.process_message called with: {user_message[:50]}{'...' if len(user_message) > 50 else ''}")
            start_time = time.time()

            logger.debug(f"Processing message: length={len(user_message)}")
            logger.debug(f"Message preview: {user_message[:100]}{'...' if len(user_message) > 100 else ''}")

            # Check if message contains skill call
            logger.debug(f"Checking {len(self.skills)} loaded skills for matches")
            for skill_name, skill_func in self.skills.items():
                if f"@{skill_name}" in user_message:
                    logger.debug(f"Matched skill: {skill_name}")
                    try:
                        skill_start = time.time()
                        result = skill_func(user_message)
                        skill_time = time.time() - skill_start
                        logger.debug(f"Skill {skill_name} executed successfully in {skill_time:.3f} seconds")
                        logger.debug(f"Skill response length: {len(result)}")

                        total_time = time.time() - start_time
                        logger.debug(f"Total message processing time: {total_time:.3f} seconds")
                        return result
                    except Exception as e:
                        skill_time = time.time() - skill_start
                        logger.error(f"Error executing skill {skill_name} after {skill_time:.3f} seconds: {e}")
                        logger.debug(f"Skill execution failed for message: {user_message}", exc_info=True)

                        total_time = time.time() - start_time
                        logger.debug(f"Total message processing time (with error): {total_time:.3f} seconds")
                        return f"Sorry, error executing skill {skill_name}."

            # Default to Claude response
            logger.debug("No skill match found, calling Claude API")
            logger.info("Starting Claude API call...")
            try:
                api_start = time.time()

                if DEV_MODE:
                    logger.debug("DEV_MODE: Using mock Claude response")
                    # Simulate API delay
                    await asyncio.sleep(0.5)
                    mock_responses = [
                        "That's an interesting question! Let me think about that.",
                        "I understand what you're asking. Here's my take on it:",
                        "Great question! Based on what I know, I'd say:",
                        "Thanks for asking! Here's what I think:",
                        "I see what you mean. Let me respond to that."
                    ]
                    response_text = random.choice(mock_responses) + f" (This is a mock response in dev mode. Your message was: '{user_message[:50]}{'...' if len(user_message) > 50 else ''}')"
                    api_time = time.time() - api_start
                else:
                    logger.info(f"Claude API call: model={ANTHROPIC_MODEL}, max_tokens=65536")
                    logger.info(f"API base URL: {claude_client.base_url}")
                    logger.info("Preparing API request payload...")

                    # Test basic connectivity first
                    import httpx
                    test_url = str(claude_client.base_url).rstrip('/') + '/v1/messages'
                    logger.info(f"Testing connectivity to {test_url}...")
                    try:
                        async with httpx.AsyncClient(verify=False, timeout=5.0) as test_client:
                            # Just try to connect - we expect a 401 or 405, but that's fine
                            test_response = await test_client.get(test_url)
                            logger.info(f"Connectivity test: got HTTP {test_response.status_code}")
                    except httpx.ConnectTimeout:
                        logger.error("Connectivity test FAILED: Connection timed out after 5s")
                        return "Sorry, cannot reach the AI service (connection timeout)."
                    except httpx.ConnectError as e:
                        logger.error(f"Connectivity test FAILED: {e}")
                        return f"Sorry, cannot reach the AI service: {e}"
                    except Exception as e:
                        logger.warning(f"Connectivity test got error (may be OK): {type(e).__name__}: {e}")

                    # Add timeout to the API call
                    try:
                        request_payload = {
                            "model": ANTHROPIC_MODEL,
                            "max_tokens": 65536,
                            "thinking": {
                                "type": "enabled",
                                "budget_tokens": 1024000
                            },
                            "messages": [
                                {"role": "user", "content": user_message}
                            ]
                        }
                        logger.info(f"Request payload prepared, message length: {len(user_message)}")
                        logger.info("Initiating HTTP connection to API endpoint...")

                        connection_start = time.time()
                        response = await asyncio.wait_for(
                            claude_client.messages.create(**request_payload),
                            timeout=120.0  # 120 second timeout for thinking models
                        )
                        connection_time = time.time() - connection_start
                        logger.info(f"API request completed in {connection_time:.3f}s")
                    except asyncio.TimeoutError:
                        api_time = time.time() - api_start
                        logger.error(f"Claude API call timed out after {api_time:.3f} seconds")
                        logger.error(f"API endpoint: {claude_client.base_url}, model: {ANTHROPIC_MODEL}")
                        return "Sorry, the AI service took too long to respond. Please try again."

                    api_time = time.time() - api_start
                    logger.info(f"Claude API response received in {api_time:.3f} seconds")

                    # Handle response - may contain thinking blocks and text blocks
                    response_text = ""
                    if response.content:
                        for block in response.content:
                            if hasattr(block, 'text'):
                                response_text = block.text
                                break
                        logger.debug(f"Response has {len(response.content)} content blocks")
                    else:
                        logger.warning("Claude API returned empty content")
                        response_text = "Sorry, I received an empty response from the AI service."

                logger.debug(f"Response length: {len(response_text)}")
                logger.debug(f"Response preview: {response_text[:100]}{'...' if len(response_text) > 100 else ''}")

                total_time = time.time() - start_time
                logger.info(f"Total message processing time: {total_time:.3f} seconds")

                return response_text

            except Exception as e:
                api_time = time.time() - api_start if 'api_start' in locals() else time.time() - start_time
                logger.error(f"Error getting Claude response after {api_time:.3f} seconds: {type(e).__name__}: {e}")
                logger.debug(f"Claude API call failed for message: {user_message}", exc_info=True)
                logger.debug(f"Exception type: {type(e).__name__}, args: {e.args}")

                total_time = time.time() - start_time
                logger.info(f"Total message processing time (with error): {total_time:.3f} seconds")

                # Return a more helpful error message for debugging
                return f"Sorry, I encountered an error connecting to the AI service. Error: {type(e).__name__}: {str(e)[:200]}"

        except Exception as e:
            logger.error(f"Unexpected error in process_message: {e}", exc_info=True)
            return "Sorry, an unexpected error occurred."