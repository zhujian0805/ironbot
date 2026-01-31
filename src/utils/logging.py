import logging
import json
from datetime import datetime

def setup_logging(debug=False, log_level=None, log_file=None):
    """Setup structured JSON logging for the application.

    Args:
        debug: Enable debug logging level
        log_level: Override log level (DEBUG, INFO, WARNING, ERROR)
        log_file: Optional file to write logs to
    """

    class JSONFormatter(logging.Formatter):
        def format(self, record):
            log_entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "level": record.levelname,
                "message": record.getMessage(),
                "module": record.module,
                "function": record.funcName,
                "line": record.lineno
            }
            if record.exc_info:
                log_entry["exception"] = self.formatException(record.exc_info)
            return json.dumps(log_entry)

    # Setup logger
    logger = logging.getLogger("slack_ai_agent")

    # Determine log level
    if log_level:
        level = getattr(logging, log_level.upper(), logging.INFO)
    elif debug:
        level = logging.DEBUG
    else:
        level = logging.INFO

    logger.setLevel(level)

    # Remove existing handlers to avoid duplicates
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)

    # Console handler with JSON formatter
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(JSONFormatter())
    logger.addHandler(console_handler)

    # Optional file handler
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(JSONFormatter())
        logger.addHandler(file_handler)

    return logger

# Global logger instance (will be re-initialized with proper config)
logger = setup_logging()  # Initialize with default INFO level