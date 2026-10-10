"""Inventory repositories: ingredients, movements, low stock and aggregation queries."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.infrastructure.db.models import (
    DemandForecastModel,
    IngredientModel,
    InventoryMovementModel,
    OrderDetailModel,
    OrderModel,
    PaymentMethodModel,
    ProductModel,
    PurchaseRecommendationModel,
    SalesAnomalyModel,
)


def list_ingredients(db: Session) -> list[IngredientModel]:
    return list(db.scalars(select(IngredientModel).order_by(IngredientModel.name)))


def get_ingredient(db: Session, ingredient_id: int) -> IngredientModel:
    ingredient = db.get(IngredientModel, ingredient_id)
    if ingredient is None:
        from app.core.exceptions import IngredientNotFoundError

        raise IngredientNotFoundError()
    return ingredient


def last_entry_costs(db: Session) -> dict[int, Decimal]:
    """Último costo unitario de compra registrado por insumo.

    Se deriva de la entrada más reciente que guardó `unit_cost` (precio pagado
    dividido entre la cantidad). Permite sugerir el precio de un producto a
    partir de su receta sin pedirle a la dueña que recuerde costos de memoria.
    """
    ranked = (
        select(
            InventoryMovementModel.ingredient_id,
            InventoryMovementModel.unit_cost,
            func.row_number()
            .over(
                partition_by=InventoryMovementModel.ingredient_id,
                order_by=[
                    InventoryMovementModel.created_at.desc(),
                    InventoryMovementModel.id.desc(),
                ],
            )
            .label("rank"),
        )
        .where(InventoryMovementModel.movement_type == "entrada")
        .where(InventoryMovementModel.unit_cost.isnot(None))
        .subquery()
    )
    rows = db.execute(
        select(ranked.c.ingredient_id, ranked.c.unit_cost).where(ranked.c.rank == 1)
    ).all()
    return {
        int(row.ingredient_id): row.unit_cost
        for row in rows
        if row.ingredient_id is not None and row.unit_cost is not None
    }


def last_entry_cost(db: Session, ingredient_id: int) -> Decimal | None:
    """Último costo unitario de compra de un insumo concreto."""
    stmt = (
        select(InventoryMovementModel.unit_cost)
        .where(InventoryMovementModel.ingredient_id == ingredient_id)
        .where(InventoryMovementModel.movement_type == "entrada")
        .where(InventoryMovementModel.unit_cost.isnot(None))
        .order_by(
            InventoryMovementModel.created_at.desc(), InventoryMovementModel.id.desc()
        )
        .limit(1)
    )
    return db.scalars(stmt).first()


def list_movements(
    db: Session,
    day: date | None = None,
    ingredient_id: int | None = None,
    movement_type: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[InventoryMovementModel], int]:
    stmt = select(InventoryMovementModel).options()
    count_stmt = select(func.count(InventoryMovementModel.id))
    conditions = []
    if day is not None:
        tz = ZoneInfo(settings.timezone)
        start = datetime(day.year, day.month, day.day, tzinfo=tz)
        end = start + timedelta(days=1)
        conditions.append(InventoryMovementModel.created_at >= start)
        conditions.append(InventoryMovementModel.created_at < end)
    if ingredient_id is not None:
        conditions.append(InventoryMovementModel.ingredient_id == ingredient_id)
    if movement_type:
        conditions.append(InventoryMovementModel.movement_type == movement_type)
    if conditions:
        stmt = stmt.where(and_(*conditions))
        count_stmt = count_stmt.where(and_(*conditions))
    stmt = stmt.order_by(InventoryMovementModel.created_at.desc()).limit(limit).offset(offset)
    movements = list(db.scalars(stmt))
    total = db.scalars(count_stmt).one()
    return movements, int(total)


def purchases_in_period(db: Session, start: datetime, end: datetime) -> list[InventoryMovementModel]:
    stmt = (
        select(InventoryMovementModel)
        .where(InventoryMovementModel.movement_type == "entrada")
        .where(InventoryMovementModel.created_at >= start)
        .where(InventoryMovementModel.created_at < end)
        .order_by(InventoryMovementModel.created_at.desc())
    )
    return list(db.scalars(stmt))


def pending_recommendations(db: Session, status: str | None = None) -> list[PurchaseRecommendationModel]:
    stmt = (
        select(PurchaseRecommendationModel)
        .options()
        .order_by(PurchaseRecommendationModel.created_at.desc())
    )
    if status:
        stmt = stmt.where(PurchaseRecommendationModel.status == status)
    return list(db.scalars(stmt))


def get_recommendation(db: Session, recommendation_id: int) -> PurchaseRecommendationModel | None:
    return db.get(PurchaseRecommendationModel, recommendation_id)


def list_forecasts(db: Session, start: date, end: date) -> list[DemandForecastModel]:
    stmt = (
        select(DemandForecastModel)
        .where(DemandForecastModel.forecast_date >= start)
        .where(DemandForecastModel.forecast_date <= end)
        .order_by(DemandForecastModel.forecast_date, DemandForecastModel.product_id)
    )
    return list(db.scalars(stmt))


def list_anomalies(db: Session, start: date, end: date) -> list[SalesAnomalyModel]:
    stmt = (
        select(SalesAnomalyModel)
        .where(SalesAnomalyModel.detected_date >= start)
        .where(SalesAnomalyModel.detected_date <= end)
        .order_by(SalesAnomalyModel.detected_date.desc())
    )
    return list(db.scalars(stmt))


def get_anomaly(db: Session, anomaly_id: int) -> SalesAnomalyModel | None:
    return db.get(SalesAnomalyModel, anomaly_id)


# ---------------------------------------------------------------------------
# Analytics aggregations (SQL-side, orders cancelled never count as sales)
# ---------------------------------------------------------------------------

PAID = OrderModel.status == "pagado"


def paid_orders_query(db: Session, start: datetime, end: datetime):
    return (
        select(OrderModel)
        .where(PAID)
        .where(OrderModel.created_at >= start)
        .where(OrderModel.created_at < end)
    )


def daily_sales_series(db: Session, start: datetime, end: datetime) -> list[dict]:
    stmt = (
        select(
            func.date(OrderModel.created_at).label("day"),
            func.sum(OrderModel.total_amount).label("total"),
            func.count(OrderModel.id).label("orders"),
        )
        .where(PAID)
        .where(OrderModel.created_at >= start)
        .where(OrderModel.created_at < end)
        .group_by(func.date(OrderModel.created_at))
        .order_by(func.date(OrderModel.created_at))
    )
    rows = db.execute(stmt).all()
    return [
        {"date": str(row.day), "total": float(row.total or 0), "orders": int(row.orders)}
        for row in rows
    ]


def payment_breakdown(db: Session, start: datetime, end: datetime) -> dict[str, float]:
    stmt = (
        select(PaymentMethodModel.name, func.coalesce(func.sum(OrderModel.total_amount), 0))
        .join(OrderModel, OrderModel.payment_method_id == PaymentMethodModel.id)
        .where(PAID)
        .where(OrderModel.created_at >= start)
        .where(OrderModel.created_at < end)
        .group_by(PaymentMethodModel.name)
    )
    result = {name: float(total) for name, total in db.execute(stmt).all()}
    return {"Efectivo": result.get("Efectivo", 0.0), "Yape": result.get("Yape", 0.0)}


def top_products(
    db: Session, start: datetime, end: datetime, limit: int = 5, ascending: bool = False
) -> list[dict]:
    stmt = (
        select(
            ProductModel.id.label("product_id"),
            ProductModel.name.label("product_name"),
            func.sum(OrderDetailModel.quantity).label("quantity"),
            func.sum(OrderDetailModel.subtotal).label("revenue"),
        )
        .join(OrderModel, OrderDetailModel.order_id == OrderModel.id)
        .join(ProductModel, OrderDetailModel.product_id == ProductModel.id)
        .where(PAID)
        .where(OrderModel.created_at >= start)
        .where(OrderModel.created_at < end)
        .group_by(ProductModel.id, ProductModel.name)
    )
    rows = db.execute(stmt).all()
    result = [
        {
            "product_id": int(row.product_id),
            "product_name": row.product_name,
            "quantity": int(row.quantity or 0),
            "revenue": float(row.revenue or 0),
        }
        for row in rows
    ]
    result.sort(key=lambda r: r["quantity"], reverse=not ascending)
    return result[:limit]


def hourly_distribution(db: Session, start: datetime, end: datetime) -> list[dict]:
    stmt = (
        select(
            func.extract("hour", OrderModel.created_at).label("hour"),
            func.count(OrderModel.id).label("orders"),
        )
        .where(PAID)
        .where(OrderModel.created_at >= start)
        .where(OrderModel.created_at < end)
        .group_by(func.extract("hour", OrderModel.created_at))
        .order_by(func.extract("hour", OrderModel.created_at))
    )
    return [{"hour": int(row.hour), "orders": int(row.orders)} for row in db.execute(stmt).all()]
