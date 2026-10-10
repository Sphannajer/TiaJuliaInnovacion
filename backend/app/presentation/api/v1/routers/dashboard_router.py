"""Endpoints del dashboard (sección 27.6)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.application.use_cases import dashboard_use_case
from app.core.database import get_db

router = APIRouter()


@router.get("/dashboard/summary")
def dashboard_summary(period: str = Query(default="today"), db: Session = Depends(get_db)):
    return dashboard_use_case.dashboard_summary(db, period)


@router.get("/dashboard/sales-series")
def sales_series(period: str = Query(default="week"), db: Session = Depends(get_db)):
    return dashboard_use_case.sales_series(db, period)


@router.get("/dashboard/top-products")
def top_products(
    period: str = Query(default="month"),
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    return dashboard_use_case.top_products(db, period, limit)


@router.get("/dashboard/payment-breakdown")
def payment_breakdown(period: str = Query(default="today"), db: Session = Depends(get_db)):
    summary = dashboard_use_case.dashboard_summary(db, period)
    return summary["payments"]


@router.get("/dashboard/alerts")
def alerts(db: Session = Depends(get_db)):
    return dashboard_use_case.alerts(db)


@router.get("/dashboard/overview")
def overview(period: str = Query(default="today"), db: Session = Depends(get_db)):
    """Single payload for the dashboard home screen."""
    from app.infrastructure.ml.recommendations_engine import generate_recommendations

    summary = dashboard_use_case.dashboard_summary(db, period)
    stock = dashboard_use_case.stock_attention(db, limit=3)
    alerts = dashboard_use_case.alerts(db)

    recommendations, recommendation_status = [], "ok"
    try:
        recommendations = generate_recommendations(db, days=7)[:3]
    except Exception:
        recommendation_status = "unavailable"

    return {
        "summary": summary,
        "stock_attention": stock,
        "recommendation_preview": recommendations,
        "recommendation_status": recommendation_status,
        "alerts": alerts,
    }
