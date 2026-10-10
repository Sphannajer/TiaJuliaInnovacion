from contextlib import contextmanager
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings

LIMA = ZoneInfo(settings.timezone)


def now_lima() -> datetime:
    """Current time in the business timezone (America/Lima)."""
    return datetime.now(LIMA)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def today_lima() -> str:
    """Business date today as ISO string."""
    return now_lima().date().isoformat()


@contextmanager
def lima_tz():
    yield LIMA
