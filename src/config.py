import os
import warnings
from dotenv import load_dotenv
from slack_bolt.async_app import AsyncApp
from slack_bolt.adapter.socket_mode.aiohttp import AsyncSocketModeHandler
from anthropic import AsyncAnthropic
import httpx
from .utils.logging import setup_logging
import asyncio

# Suppress SSL warnings for internal server with self-signed cert
warnings.filterwarnings("ignore", message="Unverified HTTPS request")

# Load environment variables from .env file
load_dotenv()

# Load environment variables
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN")
SLACK_APP_TOKEN = os.getenv("SLACK_APP_TOKEN")
SLACK_SIGNING_SECRET = os.getenv("SLACK_SIGNING_SECRET")
ANTHROPIC_BASE_URL = os.getenv("ANTHROPIC_BASE_URL")
ANTHROPIC_AUTH_TOKEN = os.getenv("ANTHROPIC_AUTH_TOKEN")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "gpt-5-mini")
SKILLS_DIR = os.getenv("SKILLS_DIR", "./skills")

# Permission configuration from environment
PERMISSIONS_FILE = os.getenv("PERMISSIONS_FILE", "./permissions.yaml")

# Logging configuration from environment
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FILE = os.getenv("LOG_FILE")

# Development mode
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"

def setup_logging_from_args(args):
    """Setup logging based on CLI arguments and environment variables.

    Args:
        args: Parsed command line arguments
    """
    global logger

    # CLI arguments take precedence over environment variables
    debug = args.debug if hasattr(args, 'debug') else DEBUG
    log_level = args.log_level if hasattr(args, 'log_level') and args.log_level else LOG_LEVEL
    log_file = args.log_file if hasattr(args, 'log_file') and args.log_file else LOG_FILE

    logger = setup_logging(debug=debug, log_level=log_level, log_file=log_file)

async def check_slack_connection():
    """Check Slack connection health."""
    try:
        # Test basic auth token validation
        if not SLACK_BOT_TOKEN:
            logger.error("Slack bot token not configured")
            return False

        if not SLACK_APP_TOKEN:
            logger.error("Slack app token not configured")
            return False

        logger.debug("Testing Slack bot token connection...")

        # Try to get auth test - this validates the bot token
        auth_response = slack_app.client.auth_test()
        logger.debug(f"Slack auth test successful: team={auth_response.get('team')}, user={auth_response.get('user')}")

        # Check if we can list channels (basic connectivity test)
        channels_response = slack_app.client.conversations_list(limit=1)
        logger.debug(f"Slack channels list successful: found {len(channels_response.get('channels', []))} channels")

        logger.info("Slack connection healthy")
        return True

    except Exception as e:
        logger.error(f"Slack connection check failed: {e}")
        logger.debug("Slack connection error details", exc_info=True)
        return False

async def check_llm_connection():
    """Check LLM (Claude/Anthropic) connection health."""
    try:
        if not ANTHROPIC_AUTH_TOKEN:
            logger.error("Anthropic API token not configured")
            return False

        logger.debug("Testing LLM connection...")

        # Test with a minimal message to verify API connectivity
        test_message = "Hello"

        logger.debug(f"Sending test message to {ANTHROPIC_MODEL}")
        response = await claude_client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=65536,
            thinking={
                "type": "enabled",
                "budget_tokens": 1024000
            },
            messages=[
                {"role": "user", "content": test_message}
            ]
        )

        response_text = response.content[0].text if response.content else ""
        logger.debug(f"LLM test response received: {len(response_text)} characters")
        logger.debug(f"LLM response preview: {response_text[:50]}{'...' if len(response_text) > 50 else ''}")

        logger.info("LLM connection healthy")
        return True

    except Exception as e:
        logger.error(f"LLM connection check failed: {e}")
        logger.debug("LLM connection error details", exc_info=True)
        return False

async def perform_health_checks(skip_checks=False):
    """Perform all startup health checks."""
    if skip_checks:
        logger.info("Skipping health checks as requested")
        return True

    logger.info("Performing startup health checks...")

    slack_ok = await check_slack_connection()
    llm_ok = await check_llm_connection()

    if not slack_ok or not llm_ok:
        logger.error("Health checks failed - application may not function correctly")
        return False

    logger.info("All health checks passed")
    return True

# Initialize Slack app
slack_app = AsyncApp(token=SLACK_BOT_TOKEN)

# Initialize Socket Mode handler for app-level token (created lazily in main.py)
socket_mode_handler = None

# Initialize Claude client with custom configuration (async client for use with asyncio)
# Use custom httpx client to disable SSL verification for internal servers

# HTTP event hooks for connection debugging
async def log_request(request):
    """Log outgoing HTTP requests for debugging."""
    from .utils.logging import logger as app_logger
    if app_logger:
        app_logger.info(f"HTTP Request: {request.method} {request.url}")
    else:
        print(f"[HTTP] Request: {request.method} {request.url}")

async def log_response(response):
    """Log incoming HTTP responses for debugging."""
    from .utils.logging import logger as app_logger
    if app_logger:
        app_logger.info(f"HTTP Response: {response.status_code} from {response.url}")
    else:
        print(f"[HTTP] Response: {response.status_code} from {response.url}")

# Configure httpx timeout with connect timeout explicitly set
_http_timeout = httpx.Timeout(
    connect=10.0,    # 10 seconds to establish connection
    read=120.0,      # 120 seconds to read response (for thinking models)
    write=30.0,      # 30 seconds to send request
    pool=10.0        # 10 seconds to acquire connection from pool
)

_http_client = httpx.AsyncClient(
    verify=False,
    timeout=_http_timeout,
    event_hooks={"request": [log_request], "response": [log_response]}
)
claude_client = AsyncAnthropic(
    api_key=ANTHROPIC_AUTH_TOKEN,
    base_url=ANTHROPIC_BASE_URL,
    http_client=_http_client
)

# Global logger instance (initialized by setup_logging_from_args)
logger = None