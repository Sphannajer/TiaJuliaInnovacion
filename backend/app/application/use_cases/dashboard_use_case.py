"""Caso de uso del dashboard (sección 10 y 27.6)."""

from datetime import date, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.domain.enums import StockState
from app.domain.services.inventory import stock_state
from app.infrastructure.db.models import (
    DemandForecastModel,
    OrderModel,
    PaymentMethodModel,
    SalesAnomalyModel,
)
from app.infrastructure.db.repositories import inventory_repo

PERIODS = {
    "today": 1,
    "week": 7,
    "month": 30,
}

DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def _period_start(day: date, period: str) -> date:
    days = PERIODS.get(period, 1)
    return day - timedelta(days=days - 1)


def _bounds(start: date, end_exclusive: date) -> tuple:
    tz = ZoneInfo(settings.timezone)
    from datetime import datetime

    begin = datetime(start.year, start.month, start.day, tzinfo=tz)
    finish = datetime(end_exclusive.year, end_exclusive.month, end_exclusive.day, tzinfo=tz)
    return begin, finish


def dashboard_summary(db: Session, period: str) -> dict:
    today = _today()
    start = _period_start(today, period)
    begin, finish = _bounds(start, today + timedelta(days=1))
    paid = OrderModel.status == "pagado"
    stmt = (
        select(func.coalesce(func.sum(OrderModel.total_amount), 0), func.count(OrderModel.id))
        .where(paid)
        .where(OrderModel.created_at >= begin)
        .where(OrderModel.created_at < finish)
    )
    total, count = db.execute(stmt).one()
    payments = inventory_repo.payment_breakdown(db, begin, finish)
    sales_total = float(total or 0)
    orders = int(count or 0)
    return {
        "period": period,
        "sales_total": sales_total,
        "orders_paid": orders,
        "average_ticket": round(sales_total / orders, 2) if orders else 0.0,
        "payments": {
            "cash": payments["Efectivo"],
            "yape": payments["Yape"],
        },
    }


def sales_series(db: Session, period: str) -> list[dict]:
    """Daily series filling missing days, with per-day payment split and labels."""
    today = _today()
    days = 7 if period == "week" else PERIODS.get(period, 7)
    start = today - timedelta(days=days - 1)
    begin, finish = _bounds(start, today + timedelta(days=1))

    rows = db.execute(
        select(
            func.date(OrderModel.created_at).label("day"),
            PaymentMethodModel.name.label("method"),
            func.coalesce(func.sum(OrderModel.total_amount), 0).label("total"),
            func.count(func.distinct(OrderModel.id)).label("orders"),
        )
        .join(PaymentMethodModel, OrderModel.payment_method_id == PaymentMethodModel.id)
        .where(OrderModel.status == "pagado")
        .where(OrderModel.created_at >= begin)
        .where(OrderModel.created_at < finish)
        .group_by(func.date(OrderModel.created_at), PaymentMethodModel.name)
    ).all()

    by_day: dict[str, dict] = {}
    for day, method, total, orders in rows:
        entry = by_day.setdefault(str(day), {"total": 0.0, "orders": 0, "cash": 0.0, "yape": 0.0})
        amount = float(total or 0)
        entry["total"] += amount
        entry["orders"] = int(orders)
        if method == "Efectivo":
            entry["cash"] += amount
        elif method == "Yape":
            entry["yape"] += amount

    series = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        key = day.isoformat()
        data = by_day.get(key, {"total": 0.0, "orders": 0, "cash": 0.0, "yape": 0.0})
        label = DAY_NAMES[day.weekday()]
        if day == today:
            label = f"{label} (Hoy)"
        series.append(
            {
                "date": key,
                "label": label,
                "total": round(data["total"], 2),
                "orders": data["orders"],
                "cash": round(data["cash"], 2),
                "yape": round(data["yape"], 2),
            }
        )
    return series


def top_products(db: Session, period: str, limit: int = 5) -> list[dict]:
    today = _today()
    start = _period_start(today, period if period in PERIODS else "month")
    begin, finish = _bounds(start, today + timedelta(days=1))
    return inventory_repo.top_products(db, begin, finish, limit=limit)


def stock_attention(db: Session, limit: int = 3) -> list[dict]:
    items = []
    for ingredient in inventory_repo.list_ingredients(db):
        state = stock_state(ingredient.current_stock, ingredient.min_stock_alert)
        if state == "BIEN":
            continue
        items.append(
            {
                "ingredient_id": ingredient.id,
                "name": ingredient.name,
                "base_unit": ingredient.base_unit,
                "current_stock": float(ingredient.current_stock),
                "min_stock_alert": float(ingredient.min_stock_alert),
                "state": state,
            }
        )
    items.sort(key=lambda i: (i["state"] != "CRITICO", i["current_stock"] / max(i["min_stock_alert"], 0.001)))
    return items[:limit]


def alerts(db: Session) -> list[dict]:
    """Recent alerts: anomalies + low stock + forecast status. Max 4."""
    result: list[dict] = []
    anomalies = list(
        db.scalars(
            select(SalesAnomalyModel)
            .where(SalesAnomalyModel.is_reviewed.is_(False))
            .order_by(SalesAnomalyModel.detected_date.desc())
            .limit(2)
        )
    )
    for anomaly in anomalies:
        result.append(
            {
                "id": f"anomaly-{anomaly.id}",
                "type": "anomaly",
                "icon": "!",
                "message": anomaly.description or "Venta inusual detectada.",
                "action": "Revisar",
                "link": "/reports?tab=predicciones",
            }
        )
    for item in stock_attention(db, limit=2):
        from decimal import Decimal

        stock = Decimal(str(item["current_stock"]))
        unit = item["base_unit"]
        result.append(
            {
                "id": f"stock-{item['ingredient_id']}",
                "type": "stock",
                "icon": "!",
                "message": f"{item['name']} llegó al stock mínimo: quedan {stock.normalize()} {unit}.",
                "action": "Ver stock",
                "link": "/products?tab=insumos",
            }
        )
    forecast_count = db.scalar(select(func.count(DemandForecastModel.id)))
    if forecast_count:
        result.append(
            {
                "id": "forecast-update",
                "type": "forecast",
                "icon": "i",
                "message": "Predicción del fin de semana actualizada.",
                "action": "Ver",
                "link": "/reports?tab=predicciones",
            }
        )
    return result[:4]


def _today() -> date:
    return _now_lima().date()


def _now_lima():
    from datetime import datetime

    return datetime.now(ZoneInfo(settings.timezone))
