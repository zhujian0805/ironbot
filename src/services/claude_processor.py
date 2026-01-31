"""Claude AI processor with tool use support."""

import asyncio
import json
from typing import Dict, Any, List, Optional
from ..config import claude_client, ANTHROPIC_MODEL, DEV_MODE
from ..models.message import Message
from ..models.user import User
from .skill_loader import SkillLoader
from .tools import ToolExecutor, get_tool_definitions, TOOLS
from ..utils.logging import logger
import time
import random


# System prompt for the agent
SYSTEM_PROMPT = """You are a helpful AI assistant with access to system tools. You can execute PowerShell commands, Bash commands, read and write files, and list directory contents.

When asked to perform system tasks:
1. Use the appropriate tool to accomplish the task
2. Always explain what you're doing before executing commands
3. Report the results clearly to the user
4. If a command fails, explain what went wrong and suggest alternatives

Be helpful, concise, and safe. Never execute destructive commands without explicit user confirmation.

Available tools:
- run_powershell: Execute PowerShell commands (Windows)
- run_bash: Execute Bash/shell commands (Linux/macOS/Git Bash)
- read_file: Read file contents
- write_file: Write content to files
- list_directory: List directory contents"""


class ClaudeProcessor:
    """Processes messages using Claude AI with tool use support."""

    # Maximum number of tool use iterations to prevent infinite loops
    MAX_TOOL_ITERATIONS = 10

    def __init__(self, enable_tools: bool = True):
        """Initialize the processor.

        Args:
            enable_tools: Whether to enable tool use. Defaults to True.
        """
        self.skill_loader = SkillLoader("./skills")
        self.skills = self.skill_loader.load_skills()
        self.enable_tools = enable_tools
        self.tool_executor = ToolExecutor()

    async def process_message(self, user_message: str, conversation_history: Optional[List[Dict]] = None) -> str:
        """Process user message and return AI response.

        Args:
            user_message: The user's message
            conversation_history: Optional conversation history for context

        Returns:
            The AI's response text
        """
        try:
            logger.info(f"ClaudeProcessor.process_message called with: {user_message[:50]}{'...' if len(user_message) > 50 else ''}")
            start_time = time.time()

            logger.debug(f"Processing message: length={len(user_message)}")
            logger.debug(f"Message preview: {user_message[:100]}{'...' if len(user_message) > 100 else ''}")

            # Check if message contains skill call (legacy skill system)
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

            # Use Claude with tool support
            if self.enable_tools:
                return await self._process_with_tools(user_message, conversation_history)
            else:
                return await self._process_without_tools(user_message)

        except Exception as e:
            logger.error(f"Unexpected error in process_message: {e}", exc_info=True)
            return "Sorry, an unexpected error occurred."

    async def _process_with_tools(self, user_message: str, conversation_history: Optional[List[Dict]] = None) -> str:
        """Process message with tool use support (agentic loop).

        Args:
            user_message: The user's message
            conversation_history: Optional conversation history

        Returns:
            The final response text
        """
        logger.info("Processing message with tool support")

        # Initialize messages list
        messages = conversation_history.copy() if conversation_history else []
        messages.append({"role": "user", "content": user_message})

        # Track tool iterations
        iteration = 0
        final_response = ""

        while iteration < self.MAX_TOOL_ITERATIONS:
            iteration += 1
            logger.info(f"Tool loop iteration {iteration}/{self.MAX_TOOL_ITERATIONS}")

            try:
                # Make API call with tools
                api_start = time.time()

                if DEV_MODE:
                    # Mock response in dev mode
                    logger.debug("DEV_MODE: Using mock Claude response")
                    await asyncio.sleep(0.5)
                    final_response = f"[DEV MODE] I would process your message: '{user_message[:50]}...' with tools enabled."
                    break

                # Prepare the API request
                request_params = {
                    "model": ANTHROPIC_MODEL,
                    "max_tokens": 8192,
                    "system": SYSTEM_PROMPT,
                    "tools": TOOLS,
                    "messages": messages
                }

                logger.info(f"Calling Claude API with {len(TOOLS)} tools available")
                logger.debug(f"Messages count: {len(messages)}")

                response = await asyncio.wait_for(
                    claude_client.messages.create(**request_params),
                    timeout=120.0
                )

                api_time = time.time() - api_start
                logger.info(f"Claude API response received in {api_time:.3f}s, stop_reason: {response.stop_reason}")

                # Process the response
                if response.stop_reason == "end_turn":
                    # Claude finished with a text response
                    final_response = self._extract_text_response(response)
                    logger.info(f"Final response received: {len(final_response)} chars")
                    break

                elif response.stop_reason == "tool_use":
                    # Claude wants to use tools
                    logger.info("Claude requested tool use")

                    # Extract all content blocks (may include text + tool_use)
                    assistant_content = []
                    tool_uses = []

                    for block in response.content:
                        if block.type == "text":
                            assistant_content.append({
                                "type": "text",
                                "text": block.text
                            })
                        elif block.type == "tool_use":
                            assistant_content.append({
                                "type": "tool_use",
                                "id": block.id,
                                "name": block.name,
                                "input": block.input
                            })
                            tool_uses.append(block)

                    # Add assistant's response to messages
                    messages.append({"role": "assistant", "content": assistant_content})

                    # Execute all requested tools and collect results
                    tool_results = []
                    for tool_use in tool_uses:
                        logger.info(f"Executing tool: {tool_use.name}")
                        logger.debug(f"Tool input: {tool_use.input}")

                        result = await self.tool_executor.execute_tool(
                            tool_use.name,
                            tool_use.input
                        )

                        # Format the result for Claude
                        if result.get("success"):
                            result_content = json.dumps(result.get("result", result), indent=2)
                        else:
                            result_content = f"Error: {result.get('error', 'Unknown error')}"

                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_use.id,
                            "content": result_content
                        })

                        logger.info(f"Tool {tool_use.name} completed: success={result.get('success')}")

                    # Add tool results to messages
                    messages.append({"role": "user", "content": tool_results})

                else:
                    # Unexpected stop reason
                    logger.warning(f"Unexpected stop_reason: {response.stop_reason}")
                    final_response = self._extract_text_response(response)
                    break

            except asyncio.TimeoutError:
                logger.error(f"Claude API call timed out at iteration {iteration}")
                return "Sorry, the AI service took too long to respond. Please try again."
            except Exception as e:
                logger.error(f"Error in tool loop iteration {iteration}: {e}", exc_info=True)
                return f"Sorry, an error occurred: {str(e)[:200]}"

        if iteration >= self.MAX_TOOL_ITERATIONS:
            logger.warning(f"Reached maximum tool iterations ({self.MAX_TOOL_ITERATIONS})")
            final_response += "\n\n(Note: Maximum tool iterations reached)"

        return final_response

    async def _process_without_tools(self, user_message: str) -> str:
        """Process message without tool use (simple completion).

        Args:
            user_message: The user's message

        Returns:
            The response text
        """
        logger.debug("Processing message without tools")
        api_start = time.time()

        try:
            if DEV_MODE:
                logger.debug("DEV_MODE: Using mock Claude response")
                await asyncio.sleep(0.5)
                mock_responses = [
                    "That's an interesting question! Let me think about that.",
                    "I understand what you're asking. Here's my take on it:",
                    "Great question! Based on what I know, I'd say:",
                ]
                return random.choice(mock_responses) + f" (Mock response for: '{user_message[:50]}')"

            # Test connectivity
            import httpx
            test_url = str(claude_client.base_url).rstrip('/') + '/v1/messages'
            logger.debug(f"Testing connectivity to {test_url}...")

            try:
                async with httpx.AsyncClient(verify=False, timeout=5.0) as test_client:
                    test_response = await test_client.get(test_url)
                    logger.debug(f"Connectivity test: got HTTP {test_response.status_code}")
            except httpx.ConnectTimeout:
                logger.error("Connectivity test FAILED: Connection timed out")
                return "Sorry, cannot reach the AI service (connection timeout)."
            except httpx.ConnectError as e:
                logger.error(f"Connectivity test FAILED: {e}")
                return f"Sorry, cannot reach the AI service: {e}"
            except Exception as e:
                logger.warning(f"Connectivity test got error (may be OK): {type(e).__name__}: {e}")

            # Make the API call
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

            logger.info(f"Claude API call: model={ANTHROPIC_MODEL}")

            response = await asyncio.wait_for(
                claude_client.messages.create(**request_payload),
                timeout=120.0
            )

            api_time = time.time() - api_start
            logger.info(f"Claude API response received in {api_time:.3f} seconds")

            # Extract text from response
            response_text = self._extract_text_response(response)
            logger.debug(f"Response length: {len(response_text)}")

            return response_text

        except asyncio.TimeoutError:
            api_time = time.time() - api_start
            logger.error(f"Claude API call timed out after {api_time:.3f} seconds")
            return "Sorry, the AI service took too long to respond. Please try again."
        except Exception as e:
            api_time = time.time() - api_start
            logger.error(f"Error getting Claude response after {api_time:.3f} seconds: {e}", exc_info=True)
            return f"Sorry, I encountered an error: {type(e).__name__}: {str(e)[:200]}"

    def _extract_text_response(self, response) -> str:
        """Extract text content from a Claude API response.

        Args:
            response: The API response object

        Returns:
            The extracted text content
        """
        if not response.content:
            logger.warning("Claude API returned empty content")
            return "Sorry, I received an empty response."

        # Find the text block(s) in the response
        text_parts = []
        for block in response.content:
            if hasattr(block, 'text'):
                text_parts.append(block.text)
            elif hasattr(block, 'type') and block.type == 'text':
                text_parts.append(block.text)

        if not text_parts:
            logger.warning("No text blocks found in response")
            return "Sorry, I received an empty response."

        return "\n".join(text_parts)
