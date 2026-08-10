"""Compatibility shim for the relocated task parsing application service."""

try:
    from .app.application.parse_task import parse_structured_tasks
except ImportError:
    from app.application.parse_task import parse_structured_tasks

parse_tasks_with_agent = parse_structured_tasks

__all__ = ["parse_tasks_with_agent", "parse_structured_tasks"]
