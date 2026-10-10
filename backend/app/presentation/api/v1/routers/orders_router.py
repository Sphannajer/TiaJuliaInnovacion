"""Endpoints de órdenes/ventas (sección 27.4) con idempotencia offline (24.2)."""

from datetime import date

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.dto import (
    OrderCreate,
    OrderDTO,
    OrderDetailAdd,
    OrderDetailUpdate,
    OrderListDTO,
    PayOrderRequest,
)
from app.application.use_cases import orders_use_case
from app.core.database import get_db
from app.infrastructure.db.models import SyncRequestModel
from app.infrastructure.db.repositories import orders_repo

router = APIRouter()


def _order_to_dto(order) -> OrderDTO:
    details = []
    for detail in order.details:
        details.append(
            {
                "id": detail.id,
                "product_id": detail.product_id,
                "product_name": detail.product.name if detail.product else None,
                "quantity": detail.quantity,
                "unit_price": detail.unit_price,
                "subtotal": detail.subtotal,
                "assembly_config": detail.assembly_config,
                "config_label": config_label(detail.assembly_config),
                "notes": detail.notes,
            }
        )
    return OrderDTO(
        id=order.id,
        user_id=order.user_id,
        user_name=order.user.name if order.user else None,
        order_type=order.order_type,
        status=order.status,
        customer_name=order.customer_name,
        table_number=order.table_number,
        total_amount=order.total_amount,
        payment_method_id=order.payment_method_id,
        payment_method_name=order.payment_method.name if order.payment_method else None,
        sync_status=order.sync_status,
        created_at=order.created_at.isoformat() if order.created_at else None,
        updated_at=order.updated_at.isoformat() if order.updated_at else None,
        details=details,
    )


def config_label(config: dict | None) -> str:
    from app.domain.services.assembly import config_to_label

    return config_to_label(config or {})


@router.post("/orders", status_code=201)
def create_order(
    data: OrderCreate,
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    """Create an order. With Idempotency-Key: replays return the original order."""
    if idempotency_key:
        existing = db.scalars(
            select(SyncRequestModel).where(SyncRequestModel.idempotency_key == idempotency_key)
        ).first()
        if existing and existing.resource_id:
            order = orders_repo.get_order(db, existing.resource_id)
            return {"order": _order_to_dto(order), "inventory_alerts": [], "idempotent_replay": True}

    result = orders_use_case.create_order(db, data)

    if idempotency_key:
        db.add(
            SyncRequestModel(
                idempotency_key=idempotency_key,
                resource_type="order",
                resource_id=result.order.id,
            )
        )
        db.commit()

    return {
        "order": _order_to_dto(result.order),
        "inventory_alerts": [
            {
                "ingredient_id": a.ingredient_id,
                "ingredient_name": a.ingredient_name,
                "requested": a.requested,
                "available": a.available,
            }
            for a in result.inventory_alerts
        ],
        "idempotent_replay": False,
    }


@router.get("/orders", response_model=OrderListDTO)
def list_orders(
    date: date | None = None,
    status: str | None = None,
    order_type: str | None = None,
    search: str | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    orders, total = orders_use_case.list_orders(db, date, status, order_type, search, limit, offset)
    return OrderListDTO(
        items=[_order_to_dto(o) for o in orders],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/orders/{order_id}", response_model=OrderDTO)
def get_order(order_id: int, db: Session = Depends(get_db)):
    return _order_to_dto(orders_repo.get_order(db, order_id))


@router.post("/orders/{order_id}/details", status_code=201)
def add_detail(order_id: int, item: OrderDetailAdd, db: Session = Depends(get_db)):
    result = orders_use_case.add_detail(db, order_id, item)
    return {
        "order": _order_to_dto(result.order),
        "inventory_alerts": [
            {
                "ingredient_id": a.ingredient_id,
                "ingredient_name": a.ingredient_name,
                "requested": a.requested,
                "available": a.available,
            }
            for a in result.inventory_alerts
        ],
    }


@router.put("/orders/{order_id}/details/{detail_id}", response_model=OrderDTO)
def update_detail(order_id: int, detail_id: int, item: OrderDetailUpdate, db: Session = Depends(get_db)):
    result = orders_use_case.update_detail(db, order_id, detail_id, item)
    return _order_to_dto(result.order)


@router.delete("/orders/{order_id}/details/{detail_id}", response_model=OrderDTO)
def remove_detail(order_id: int, detail_id: int, db: Session = Depends(get_db)):
    result = orders_use_case.remove_detail(db, order_id, detail_id)
    return _order_to_dto(result.order)


@router.post("/orders/{order_id}/pay", response_model=OrderDTO)
def pay_order(order_id: int, data: PayOrderRequest, db: Session = Depends(get_db)):
    order = orders_use_case.pay_order(db, order_id, data.payment_method_id)
    return _order_to_dto(order)


@router.post("/orders/{order_id}/cancel", response_model=OrderDTO)
def cancel_order(order_id: int, db: Session = Depends(get_db)):
    order = orders_use_case.cancel_order(db, order_id)
    return _order_to_dto(order)
