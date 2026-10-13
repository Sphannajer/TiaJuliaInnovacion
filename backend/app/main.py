"""Tía Julia API — FastAPI application entry point."""

from contextlib import asynccontextmanager
from dotenv import load_dotenv

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import check_database
from app.core.exceptions import DomainError
from app.core.logging import logger
from app.presentation.api.v1.routers import (
    catalog_router,
    dashboard_router,
    inventory_router,
    ml_router,
    orders_router,
    reports_router,
)

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s (env=%s)", settings.app_name, settings.app_env)
    if check_database():
        logger.info("Database connection OK")
    else:
        logger.warning("Database connection FAILED — run alembic upgrade head")
    yield
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="API REST para el sistema de ventas, órdenes, inventario y analítica de la juguería Tía Julia.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    """Consistent error format (sección 27):

    {"error": {"code": "...", "message": "...", "details": null}}
    """
    logger.warning("domain_error code=%s path=%s", exc.code, request.url.path)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """No stack traces in production responses (sección 40)."""
    logger.exception("unexpected_error path=%s", request.url.path)
    message = (
        "No pudimos procesar la solicitud. Intenta nuevamente."
        if settings.app_env == "production"
        else str(exc)
    )
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": message, "details": None}},
    )


api_prefix = settings.api_v1_prefix
app.include_router(catalog_router.router, prefix=api_prefix)
app.include_router(orders_router.router, prefix=api_prefix)
app.include_router(inventory_router.router, prefix=api_prefix)
app.include_router(dashboard_router.router, prefix=api_prefix)
app.include_router(ml_router.router, prefix=api_prefix)
app.include_router(reports_router.router, prefix=api_prefix)


@app.get("/health")
def health():
    """Health check with database status (sección 27.1)."""
    db_ok = check_database()
    return {"status": "ok", "database": "ok" if db_ok else "error"}
