import logging
import sys

import structlog


def configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        # stderr, so a command's own output stays clean for bin/hsp to read. Looked up per line,
        # so tests that capture it see the lines.
        logger_factory=lambda *_: structlog.PrintLogger(sys.stderr),
    )
