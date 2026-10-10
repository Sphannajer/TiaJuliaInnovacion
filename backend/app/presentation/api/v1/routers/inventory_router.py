"""Endpoints de inventario (sección 27.5)."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.application.dto import (
    IngredientCreate,
    IngredientDTO,
    IngredientUpdate,
    InventoryAdjustmentCreate,
    InventoryEntryCreate,
)
from app.application.use_cases import catalog_use_case, inventory_use_case
from app.core.database import get_db
from app.infrastructure.db.repositories import inventory_repo

router = APIRouter()


@router.get("/ingredients", response_model=list[IngredientDTO])
def list_ingredients(db: Session = Depends(get_db)):
    costs = inventory_repo.last_entry_costs(db)
    return [
        catalog_use_case.ingredient_with_state(i, costs.get(i.id))
        for i in inventory_repo.list_ingredients(db)
    ]


@router.get("/ingredients/low-stock", response_model=list[dict])
def low_stock(db: Session = Depends(get_db)):
    return inventory_use_case.low_stock(db)


@router.post("/ingredients", response_model=IngredientDTO, status_code=201)
def create_ingredient(data: IngredientCreate, db: Session = Depends(get_db)):
    ingredient = catalog_use_case.create_ingredient(db, data)
    return catalog_use_case.ingredient_with_state(
        ingredient, inventory_repo.last_entry_cost(db, ingredient.id)
    )


@router.put("/ingredients/{ingredient_id}", response_model=IngredientDTO)
def update_ingredient(ingredient_id: int, data: IngredientUpdate, db: Session = Depends(get_db)):
    ingredient = catalog_use_case.update_ingredient(db, ingredient_id, data)
    return catalog_use_case.ingredient_with_state(
        ingredient, inventory_repo.last_entry_cost(db, ingredient.id)
    )


@router.get("/inventory/movements")
def list_movements(
    date: date | None = None,
    ingredient_id: int | None = None,
    movement_type: str | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    movements, total = inventory_repo.list_movements(
        db,
        day=date,
        ingredient_id=ingredient_id,
        movement_type=movement_type,
        limit=limit,
        offset=offset,
    )
    items = [
        {
            "id": m.id,
            "ingredient_id": m.ingredient_id,
            "ingredient_name": m.ingredient.name if m.ingredient else None,
            "movement_type": m.movement_type,
            "quantity": m.quantity,
            "total_cost": m.total_cost,
            "unit_cost": m.unit_cost,
            "reference_id": m.reference_id,
            "notes": m.notes,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in movements
    ]
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("/inventory/entries", status_code=201)
def register_entry(data: InventoryEntryCreate, db: Session = Depends(get_db)):
    return inventory_use_case.register_entry(db, data)


@router.post("/inventory/adjustments", status_code=201)
def register_adjustment(data: InventoryAdjustmentCreate, db: Session = Depends(get_db)):
    return inventory_use_case.register_adjustment(db, data)
