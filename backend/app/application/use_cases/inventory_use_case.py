"""Casos de uso de inventario (secciones 17.4, 17.5 y 26.5)."""

from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.core.exceptions import ValidationError
from app.domain.enums import MovementType
from app.domain.services.inventory import (
    effective_consumption_unit,
    is_count_unit,
    is_integer_quantity,
    stock_state,
)
from app.infrastructure.db.models import IngredientModel, InventoryMovementModel
from app.infrastructure.db.repositories import inventory_repo


def register_entry(db: Session, data) -> dict:
    """Entrada de mercadería: inserta movimiento, suma stock y calcula
    unit_cost = total_cost / quantity dentro de una transacción."""
    ingredient = inventory_repo.get_ingredient(db, data.ingredient_id)
    quantity = Decimal(data.quantity)
    # Validación estricta (sección 5.B): insumos contables solo con enteros.
    if is_count_unit(effective_consumption_unit(ingredient.base_unit, ingredient.consumption_unit)) and not is_integer_quantity(quantity):
        raise ValidationError(
            "Este insumo solo se cuenta por piezas enteras (sin decimales).",
            details={"ingredient_id": ingredient.id},
        )
    total_cost = Decimal(data.total_cost) if data.total_cost is not None else None

    unit_cost = None
    if total_cost is not None and total_cost > 0:
        unit_cost = (total_cost / quantity).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)

    # Aprende cuánto pesa/contiene una unidad natural para poder contar en vez
    # de pesar. Ej.: llegaron 2 kg y son 40 fresas -> 0.050 kg por fresa.
    if data.unit_count is not None and Decimal(data.unit_count) > 0:
        ingredient.unit_weight = (quantity / Decimal(data.unit_count)).quantize(
            Decimal("0.001"), rounding=ROUND_HALF_UP
        )
    if data.unit_name is not None:
        cleaned = " ".join(data.unit_name.strip().lower().split())
        ingredient.unit_name = cleaned or None

    movement = InventoryMovementModel(
        ingredient_id=ingredient.id,
        movement_type=MovementType.ENTRADA.value,
        quantity=quantity,
        total_cost=total_cost,
        unit_cost=unit_cost,
    )
    ingredient.current_stock = Decimal(ingredient.current_stock) + quantity
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return {
        "id": movement.id,
        "ingredient_id": ingredient.id,
        "ingredient_name": ingredient.name,
        "movement_type": movement.movement_type,
        "quantity": movement.quantity,
        "total_cost": movement.total_cost,
        "unit_cost": unit_cost,
        "unit_name": ingredient.unit_name,
        "unit_weight": ingredient.unit_weight,
        "created_at": movement.created_at,
        "new_stock": ingredient.current_stock,
        "state": stock_state(ingredient.current_stock, ingredient.min_stock_alert),
    }


def register_adjustment(db: Session, data) -> dict:
    """Ajuste: lleva el stock al conteo físico registrando la diferencia."""
    ingredient = inventory_repo.get_ingredient(db, data.ingredient_id)
    current = Decimal(ingredient.current_stock)
    new_stock = Decimal(data.new_stock)
    if is_count_unit(effective_consumption_unit(ingredient.base_unit, ingredient.consumption_unit)) and not is_integer_quantity(new_stock):
        raise ValidationError(
            "Este insumo solo se cuenta por piezas enteras (sin decimales).",
            details={"ingredient_id": ingredient.id},
        )
    difference = new_stock - current

    movement = InventoryMovementModel(
        ingredient_id=ingredient.id,
        movement_type=MovementType.AJUSTE.value,
        quantity=difference,
        notes=(data.reason or "Ajuste de conteo físico")[:255],
    )
    ingredient.current_stock = new_stock
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return {
        "id": movement.id,
        "ingredient_id": ingredient.id,
        "ingredient_name": ingredient.name,
        "movement_type": movement.movement_type,
        "quantity": movement.quantity,
        "previous_stock": current,
        "new_stock": new_stock,
        "created_at": movement.created_at,
        "state": stock_state(new_stock, ingredient.min_stock_alert),
    }


def low_stock(db: Session) -> list[dict]:
    """Ingredients at/below minimum, worst first, with human states."""
    result = []
    for ingredient in inventory_repo.list_ingredients(db):
        state = stock_state(ingredient.current_stock, ingredient.min_stock_alert)
        if state == "BIEN":
            continue
        result.append(
            {
                "ingredient_id": ingredient.id,
                "name": ingredient.name,
                "category": ingredient.category,
                "base_unit": ingredient.base_unit,
                "current_stock": ingredient.current_stock,
                "min_stock_alert": ingredient.min_stock_alert,
                "state": state,
            }
        )
    result.sort(key=lambda i: (i["state"] != "CRITICO", Decimal(i["current_stock"]) / max(Decimal(i["min_stock_alert"]), Decimal("0.001"))))
    return result
