import asyncio
import argparse
from .config import slack_app, setup_logging_from_args, perform_health_checks
from slack_bolt.adapter.socket_mode.aiohttp import AsyncSocketModeHandler
from .services.slack_handler import SlackMessageHandler
from .utils.logging import logger

async def main(args):
    """Main entry point for the Slack AI Agent."""
    logger.info("Starting Slack AI Agent")

    # Perform health checks
    health_ok = await perform_health_checks(skip_checks=args.skip_health_checks)
    if not health_ok:
        logger.warning("Continuing despite health check failures...")

    # Initialize handlers
    message_handler = SlackMessageHandler()
    message_handler.register_handlers()

    # Initialize Socket Mode handler (async context required)
    from .config import SLACK_APP_TOKEN
    socket_mode_handler = AsyncSocketModeHandler(slack_app, SLACK_APP_TOKEN)

    # Start the Slack app
    logger.info("Starting Slack Bolt app with Socket Mode")
    try:
        await socket_mode_handler.start_async()
        logger.info("Socket Mode handler started successfully")
    except Exception as e:
        logger.error(f"Failed to start Socket Mode handler: {e}")
        return

def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Slack AI Agent")
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging"
    )
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Override log level (default: INFO, or DEBUG if --debug is used)"
    )
    parser.add_argument(
        "--log-file",
        help="Optional file to write logs to"
    )
    parser.add_argument(
        "--skip-health-checks",
        action="store_true",
        help="Skip startup health checks"
    )
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()

    # Setup logging with CLI arguments
    setup_logging_from_args(args)

    asyncio.run(main(args))