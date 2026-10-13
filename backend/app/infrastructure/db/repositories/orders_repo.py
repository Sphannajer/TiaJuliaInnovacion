"""Order repositories: creation, payment, cancellation and queries.

All write operations run inside the caller's transaction; use cases own
the commit so each order operation is atomic (sección 28).
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.infrastructure.db.models import (
    IngredientModel,
    OrderDetailModel,
    OrderModel,
    PaymentMethodModel,
    ProductModel,
    RecipeComponentModel,
    UserModel,
)


def lima_day_bounds(day: date) -> tuple[datetime, datetime]:
    tz = ZoneInfo(settings.timezone)
    start = datetime(day.year, day.month, day.day, tzinfo=tz)
    end = start + timedelta(days=1)
    return start, end


def list_payment_methods(db: Session) -> list[PaymentMethodModel]:
    return list(db.scalars(select(PaymentMethodModel).order_by(PaymentMethodModel.id)))


def get_payment_method(db: Session, payment_method_id: int) -> PaymentMethodModel | None:
    return db.get(PaymentMethodModel, payment_method_id)


def get_order(db: Session, order_id: int) -> OrderModel:
    stmt = (
        select(OrderModel)
        .options(
            joinedload(OrderModel.details).joinedload(OrderDetailModel.product),
            joinedload(OrderModel.user),
            joinedload(OrderModel.payment_method),
        )
        .where(OrderModel.id == order_id)
    )
    order = db.scalars(stmt).unique().first()
    if order is None:
        from app.core.exceptions import OrderNotFoundError

        raise OrderNotFoundError()
    return order


def list_orders(
    db: Session,
    day: date | None = None,
    status: str | None = None,
    order_type: str | None = None,
    search: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[OrderModel], int]:
    stmt = select(OrderModel).options(
        joinedload(OrderModel.details).joinedload(OrderDetailModel.product),
        joinedload(OrderModel.payment_method),
    )
    count_stmt = select(func.count(OrderModel.id))
    conditions = []
    if day is not None:
        start, end = lima_day_bounds(day)
        conditions.append(OrderModel.created_at >= start)
        conditions.append(OrderModel.created_at < end)
    if status:
        conditions.append(OrderModel.status == status)
    if order_type:
        conditions.append(OrderModel.order_type == order_type)
    if search:
        like = f"%{search.strip()}%"
        search_condition = (
            OrderModel.customer_name.ilike(like)
            | OrderModel.table_number.ilike(like)
        )
        if search.strip().lstrip("#").isdigit():
            search_condition = search_condition | (OrderModel.id == int(search.strip().lstrip("#")))
        conditions.append(search_condition)
    if conditions:
        stmt = stmt.where(and_(*conditions))
        count_stmt = count_stmt.where(and_(*conditions))
    stmt = stmt.order_by(OrderModel.created_at.desc()).limit(limit).offset(offset)
    orders = list(db.scalars(stmt).unique())
    total = db.scalars(count_stmt).one()
    return orders, int(total)


def recalc_order_total(db: Session, order: OrderModel) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(OrderDetailModel.subtotal), 0)).where(
            OrderDetailModel.order_id == order.id
        )
    )
    order.total_amount = Decimal(total or 0)
    return order.total_amount


def active_product_recipe(db: Session, product_id: int) -> list[RecipeComponentModel]:
    stmt = (
        select(RecipeComponentModel)
        .where(RecipeComponentModel.product_id == product_id)
        .where(RecipeComponentModel.is_active.is_(True))
    )
    return list(db.scalars(stmt))


def linked_ingredient(db: Session, ingredient_id: int) -> IngredientModel | None:
    return db.get(IngredientModel, ingredient_id)


def user_exists(db: Session, user_id: int) -> bool:
    return db.get(UserModel, user_id) is not None


def product_exists_active(db: Session, product_id: int) -> ProductModel | None:
    stmt = select(ProductModel).where(ProductModel.id == product_id, ProductModel.is_active.is_(True))
    return db.scalars(stmt).first()
