"""Endpoints de catálogo (sección 27.2 y 27.3)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.application.dto import (
    CategoryDTO,
    OptionGroupDTO,
    ProductCreate,
    ProductDTO,
    ProductUpdate,
    RecipeComponentDTO,
    UserDTO,
)
from app.application.use_cases import catalog_use_case
from app.core.database import get_db
from app.infrastructure.db.repositories import catalog_repo

router = APIRouter()


def _recipe_to_dto(component) -> RecipeComponentDTO:
    return RecipeComponentDTO(
        id=component.id,
        product_id=component.product_id,
        ingredient_id=component.ingredient_id,
        option_id=component.option_id,
        size_option_id=component.size_option_id,
        quantity_per_unit=component.quantity_per_unit,
        size_multiplier=component.size_multiplier,
        is_active=component.is_active,
        ingredient_name=component.ingredient.name if component.ingredient else None,
        ingredient_unit=component.ingredient.base_unit if component.ingredient else None,
        option_name=component.option.name if component.option else None,
    )


def _product_to_dto(product) -> ProductDTO:
    recipe = [_recipe_to_dto(c) for c in product.recipe_components if c.is_active]
    return ProductDTO(
        id=product.id,
        category_id=product.category_id,
        name=product.name,
        base_price=product.base_price,
        is_active=product.is_active,
        category_name=product.category.name if product.category else None,
        option_group_ids=[g.id for g in product.option_groups],
        has_options=len(product.option_groups) > 0,
        has_recipe=len(recipe) > 0,
        recipe_components=recipe,
    )


@router.get("/users", response_model=list[UserDTO])
def list_users(active: bool = Query(default=True, alias="active"), db: Session = Depends(get_db)):
    return catalog_repo.list_users(db, active_only=active)


@router.get("/categories", response_model=list[CategoryDTO])
def list_categories(db: Session = Depends(get_db)):
    return catalog_repo.list_categories(db)


@router.get("/products", response_model=list[ProductDTO])
def list_products(
    active: bool = True,
    category_id: int | None = None,
    db: Session = Depends(get_db),
):
    products = catalog_repo.list_products(db, active_only=active, category_id=category_id)
    return [_product_to_dto(p) for p in products]


@router.get("/products/{product_id}", response_model=ProductDTO)
def get_product(product_id: int, db: Session = Depends(get_db)):
    return _product_to_dto(catalog_repo.get_product(db, product_id))


@router.post("/products", response_model=ProductDTO, status_code=201)
def create_product(data: ProductCreate, db: Session = Depends(get_db)):
    product = catalog_use_case.create_product(db, data)
    return _product_to_dto(product)


@router.put("/products/{product_id}", response_model=ProductDTO)
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db)):
    product = catalog_use_case.update_product(db, product_id, data)
    return _product_to_dto(product)


@router.patch("/products/{product_id}/status", response_model=ProductDTO)
def set_product_status(product_id: int, is_active: bool = Query(...), db: Session = Depends(get_db)):
    product = catalog_use_case.set_product_status(db, product_id, is_active)
    return _product_to_dto(product)


@router.get("/option-groups", response_model=list[OptionGroupDTO])
def list_option_groups(db: Session = Depends(get_db)):
    return catalog_repo.list_option_groups(db)


@router.get("/products/{product_id}/option-groups", response_model=list[OptionGroupDTO])
def product_option_groups(product_id: int, db: Session = Depends(get_db)):
    groups = catalog_repo.product_option_groups(db, product_id)
    return [OptionGroupDTO.model_validate(g) for g in groups]
