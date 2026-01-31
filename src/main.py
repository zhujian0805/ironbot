import asyncio
import argparse
from .config import slack_app, setup_logging_from_args, perform_health_checks, PERMISSIONS_FILE
from slack_bolt.adapter.socket_mode.aiohttp import AsyncSocketModeHandler
from .services.slack_handler import SlackMessageHandler
from .services.permission_manager import init_permission_manager
from .utils.logging import logger

async def main(args):
    """Main entry point for the Slack AI Agent."""
    logger.info("Starting Slack AI Agent")

    # Initialize permission manager
    permissions_file = args.permissions_file or PERMISSIONS_FILE
    logger.info(f"Loading permissions from: {permissions_file}")
    permission_manager = init_permission_manager(permissions_file)
    capabilities = permission_manager.list_allowed_capabilities()
    logger.info(f"Allowed tools: {len(capabilities['tools'])}, skills: {len(capabilities['skills'])}, MCPs: {len(capabilities['mcps'])}")

    # Start file watcher for hot-reload
    if permission_manager.start_file_watcher():
        logger.info("Permission config hot-reload enabled")
    else:
        logger.warning("Permission config hot-reload not available (install watchdog)")

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
    parser.add_argument(
        "--permissions-file",
        help="Path to permissions.yaml configuration file (default: ./permissions.yaml)"
    )
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()

    # Setup logging with CLI arguments
    setup_logging_from_args(args)

    asyncio.run(main(args))