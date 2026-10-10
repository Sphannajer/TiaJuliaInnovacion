"""Feature engineering for ML models (secciones 30.1 y 31).

Datasets are built from paid orders only; cancelled orders never count.
All features are deterministic given the data.
"""

from datetime import date, timedelta
from decimal import Decimal

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.infrastructure.db.models import OrderDetailModel, OrderModel


def product_daily_sales(db: Session, product_id: int | None = None) -> pd.DataFrame:
    """Aggregation by product_id + business date (Lima tz handled by SQL date())."""
    stmt = (
        select(
            OrderDetailModel.product_id.label("product_id"),
            func.date(OrderModel.created_at).label("day"),
            func.sum(OrderDetailModel.quantity).label("quantity_sold"),
        )
        .join(OrderModel, OrderDetailModel.order_id == OrderModel.id)
        .where(OrderModel.status == "pagado")
        .group_by(OrderDetailModel.product_id, func.date(OrderModel.created_at))
    )
    if product_id is not None:
        stmt = stmt.where(OrderDetailModel.product_id == product_id)
    rows = db.execute(stmt).all()
    frame = pd.DataFrame(rows, columns=["product_id", "day", "quantity_sold"])
    if frame.empty:
        return frame
    frame["day"] = pd.to_datetime(frame["day"])
    frame["quantity_sold"] = frame["quantity_sold"].astype(float)
    return frame


def daily_sales_totals(db: Session) -> pd.DataFrame:
    """Total sales per day: total amount, paid orders count, average ticket."""
    stmt = (
        select(
            func.date(OrderModel.created_at).label("day"),
            func.sum(OrderModel.total_amount).label("sales_total"),
            func.count(OrderModel.id).label("orders_count"),
        )
        .where(OrderModel.status == "pagado")
        .group_by(func.date(OrderModel.created_at))
        .order_by(func.date(OrderModel.created_at))
    )
    rows = db.execute(stmt).all()
    frame = pd.DataFrame(rows, columns=["day", "sales_total", "orders_count"])
    if frame.empty:
        return frame
    frame["day"] = pd.to_datetime(frame["day"])
    frame["sales_total"] = frame["sales_total"].astype(float)
    frame["orders_count"] = frame["orders_count"].astype(int)
    frame["average_ticket"] = frame["sales_total"] / frame["orders_count"].replace(0, pd.NA)
    frame["average_ticket"] = frame["average_ticket"].fillna(0.0).astype(float)
    return frame


def add_calendar_features(frame: pd.DataFrame) -> pd.DataFrame:
    """day_of_week, is_friday, is_weekend, week_of_year plus lag/rolling features."""
    frame = frame.sort_values("day").copy()
    day_index = frame["day"].dt.dayofweek
    frame["day_of_week"] = day_index
    frame["is_friday"] = (day_index == 4).astype(int)
    frame["is_weekend"] = (day_index >= 5).astype(int)
    frame["week_of_year"] = frame["day"].dt.isocalendar().week.astype(int)
    frame["lag_7"] = frame["quantity_sold"].shift(7)
    frame["rolling_mean_7"] = frame["quantity_sold"].shift(1).rolling(7, min_periods=1).mean()
    frame["rolling_mean_28"] = frame["quantity_sold"].shift(1).rolling(28, min_periods=1).mean()
    return frame


def add_sales_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Features for anomaly detection on daily totals."""
    frame = frame.sort_values("day").copy()
    day_index = frame["day"].dt.dayofweek
    frame["day_of_week"] = day_index
    frame["rolling_mean_7"] = frame["sales_total"].shift(1).rolling(7, min_periods=1).mean()
    frame["relative_deviation"] = 0.0
    mask = frame["rolling_mean_7"].notna() & (frame["rolling_mean_7"] > 0)
    frame.loc[mask, "relative_deviation"] = (
        (frame.loc[mask, "sales_total"] - frame.loc[mask, "rolling_mean_7"])
        / frame.loc[mask, "rolling_mean_7"]
    )
    return frame


def daily_by_dow_baseline(sales_frame: pd.DataFrame) -> pd.DataFrame:
    """Mean sales per day-of-week over history, used to describe anomalies."""
    if sales_frame.empty:
        return pd.DataFrame(columns=["day_of_week", "mean_total"])
    frame = sales_frame.copy()
    frame["day_of_week"] = frame["day"].dt.dayofweek
    return frame.groupby("day_of_week")["sales_total"].mean().reset_index()


def next_week_days(from_day: date | None = None) -> list[date]:
    """The 7 days after today (business forecast horizon)."""
    reference = from_day or date.today()
    return [reference + timedelta(days=offset) for offset in range(1, 8)]
