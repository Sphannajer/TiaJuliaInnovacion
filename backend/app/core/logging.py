import logging

from app.core.config import settings


def setup_logging() -> logging.Logger:
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    # Quiet noisy libraries unless debugging
    if settings.app_env != "development":
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    return logging.getLogger("tia_julia")


logger = setup_logging()
