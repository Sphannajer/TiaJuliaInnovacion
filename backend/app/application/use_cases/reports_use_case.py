"""Casos de uso de reportes (secciones 19 y 27.8)."""

from datetime import date, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.infrastructure.db.models import (
    IngredientModel,
    InventoryMovementModel,
    OrderModel,
    PurchaseRecommendationModel,
)
from app.infrastructure.db.repositories import inventory_repo

DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def _bounds(from_day: date, to_day: date) -> tuple:
    tz = ZoneInfo(settings.timezone)
    from datetime import datetime

    begin = datetime(from_day.year, from_day.month, from_day.day, tzinfo=tz)
    end_exclusive = to_day + timedelta(days=1)
    finish = datetime(end_exclusive.year, end_exclusive.month, end_exclusive.day, tzinfo=tz)
    return begin, finish


def report_summary(db: Session, from_day: date, to_day: date) -> dict:
    begin, finish = _bounds(from_day, to_day)
    series = inventory_repo.daily_sales_series(db, begin, finish)
    payments = inventory_repo.payment_breakdown(db, begin, finish)
    total_sales = sum(s["total"] for s in series)
    orders = sum(s["orders"] for s in series)
    best = max(series, key=lambda s: s["total"])["date"] if series else None
    return {
        "from_date": from_day.isoformat(),
        "to_date": to_day.isoformat(),
        "sales_total": round(total_sales, 2),
        "orders_paid": orders,
        "average_ticket": round(total_sales / orders, 2) if orders else 0.0,
        "best_day": DAY_NAMES[date.fromisoformat(best).weekday()] if best else None,
        "payments": {"cash": payments["Efectivo"], "yape": payments["Yape"]},
        "series": series,
    }


def report_sales(db: Session, from_day: date, to_day: date, order_type: str | None = None) -> dict:
    begin, finish = _bounds(from_day, to_day)
    series = inventory_repo.daily_sales_series(db, begin, finish)

    type_stmt = (
        select(OrderModel.order_type, func.count(OrderModel.id), func.coalesce(func.sum(OrderModel.total_amount), 0))
        .where(OrderModel.status == "pagado")
        .where(OrderModel.created_at >= begin)
        .where(OrderModel.created_at < finish)
        .group_by(OrderModel.order_type)
    )
    by_type = [
        {"order_type": t, "orders": int(c), "total": float(v or 0)}
        for t, c, v in db.execute(type_stmt).all()
    ]
    if order_type:
        series = series  # type filter applies via repo when extended; kept simple for MVP
    return {"series": series, "by_order_type": by_type, "rows": series}


def report_payments(db: Session, from_day: date, to_day: date) -> dict:
    begin, finish = _bounds(from_day, to_day)
    payments = inventory_repo.payment_breakdown(db, begin, finish)
    total = payments["Efectivo"] + payments["Yape"]
    return {
        "cash": payments["Efectivo"],
        "yape": payments["Yape"],
        "cash_pct": round(payments["Efectivo"] / total * 100, 1) if total else 0.0,
        "yape_pct": round(payments["Yape"] / total * 100, 1) if total else 0.0,
    }


def report_products(db: Session, from_day: date, to_day: date) -> dict:
    begin, finish = _bounds(from_day, to_day)
    top = inventory_repo.top_products(db, begin, finish, limit=10)
    slow = inventory_repo.top_products(db, begin, finish, limit=10, ascending=True)
    return {"top": top, "slow": slow}


def report_inventory(db: Session, from_day: date, to_day: date) -> dict:
    begin, finish = _bounds(from_day, to_day)
    low_stock = []
    for ingredient in inventory_repo.list_ingredients(db):
        current = Decimal(ingredient.current_stock)
        if current > Decimal(ingredient.min_stock_alert):
            continue
        low_stock.append(
            {
                "ingredient_id": ingredient.id,
                "name": ingredient.name,
                "base_unit": ingredient.base_unit,
                "current_stock": float(current),
                "min_stock_alert": float(ingredient.min_stock_alert),
            }
        )
    purchases = inventory_repo.purchases_in_period(db, begin, finish)
    purchase_rows = [
        {
            "id": m.id,
            "ingredient_id": m.ingredient_id,
            "ingredient_name": m.ingredient.name if m.ingredient else None,
            "quantity": float(m.quantity),
            "unit": m.ingredient.base_unit if m.ingredient else "",
            "total_cost": float(m.total_cost) if m.total_cost is not None else None,
            "unit_cost": float(m.unit_cost) if m.unit_cost is not None else None,
            "created_at": m.created_at.isoformat(),
        }
        for m in purchases
    ]
    pending = inventory_repo.pending_recommendations(db, "pendiente")
    done = inventory_repo.pending_recommendations(db, "realizada")
    return {
        "low_stock": low_stock,
        "purchases": purchase_rows,
        "recommendations": {"pendiente": len(pending), "realizada": len(done)},
    }
