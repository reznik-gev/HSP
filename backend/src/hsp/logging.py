"""Structured JSON logging to stdout (docs/0057)."""

import logging
import sys

import structlog


def level_number(level: str) -> int:
    """The `logging` constant for a level name such as "DEBUG", the form the settings use."""
    return logging.getLevelNamesMapping()[level]


def is_debug(level: str) -> bool:
    """Whether logging at `level` writes debug lines."""
    return level_number(level) <= logging.DEBUG


def configure_logging(level: str = "INFO", json: bool = True) -> None:
    renderer: structlog.typing.Processor = (
        structlog.processors.JSONRenderer() if json else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level_number(level)),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
