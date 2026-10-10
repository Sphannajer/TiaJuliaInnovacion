"""Casos de uso del catálogo: CRUD de productos e insumos.

Regla de estandarización (pedido de la dueña): los nombres de catálogo se
normalizan en minúsculas para que buscar "Papaya" y "papaya" coincidan y no
se creen duplicados.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.core.exceptions import IngredientNotFoundError
from app.domain.services.inventory import (
    behavior_buttons,
    effective_behavioral_type,
    effective_consumption_unit,
    is_count_unit,
    is_integer_quantity,
    stock_state,
)
from app.infrastructure.db.models import (
    CategoryModel,
    IngredientModel,
    OptionGroupModel,
    OptionModel,
    ProductModel,
    RecipeComponentModel,
)
from app.infrastructure.db.repositories import catalog_repo


def normalize_name(value: str) -> str:
    """Estandariza nombres de catálogo en minúsculas sin espacios sobrantes."""
    return " ".join(value.strip().lower().split())


def _product_option_ids(product: ProductModel) -> set[int]:
    return {option.id for group in product.option_groups for option in group.options}


def _validate_and_build_recipe_components(db: Session, product: ProductModel, components) -> list[RecipeComponentModel]:
    """Validate ingredient/option existence and build RecipeComponentModel list.

    Las opciones usadas en la receta deben pertenecer a un grupo del producto,
    para que el consumo solo ocurra cuando esa opción fue elegida en la venta.
    """
    valid_option_ids = _product_option_ids(product)
    models: list[RecipeComponentModel] = []
    for component in components:
        ingredient = db.get(IngredientModel, component.ingredient_id)
        if ingredient is None:
            raise ValidationError("El insumo indicado no existe.", details={"ingredient_id": component.ingredient_id})
        # Validación estricta (sección 5.B): los insumos contables solo admiten enteros.
        consumption_unit = effective_consumption_unit(ingredient.base_unit, ingredient.consumption_unit)
        quantity = Decimal(str(component.quantity_per_unit))
        if is_count_unit(consumption_unit) and not is_integer_quantity(quantity):
            raise ValidationError(
                "Este insumo solo se cuenta por piezas enteras (sin decimales).",
                details={"ingredient_id": ingredient.id, "quantity_per_unit": str(quantity)},
            )
        if component.option_id is not None:
            if db.get(OptionModel, component.option_id) is None:
                raise ValidationError("La opción indicada no existe.", details={"option_id": component.option_id})
            if component.option_id not in valid_option_ids:
                raise ValidationError(
                    "La opción de la receta no pertenece a los grupos del producto.",
                    details={"option_id": component.option_id},
                )
        size_option_id = getattr(component, "size_option_id", None)
        if size_option_id is not None:
            if db.get(OptionModel, size_option_id) is None:
                raise ValidationError("El tamaño indicado no existe.", details={"size_option_id": size_option_id})
            if size_option_id not in valid_option_ids:
                raise ValidationError(
                    "El tamaño de la receta no pertenece a los grupos del producto.",
                    details={"size_option_id": size_option_id},
                )
        models.append(
            RecipeComponentModel(
                product_id=product.id,
                option_id=component.option_id,
                size_option_id=size_option_id,
                ingredient_id=component.ingredient_id,
                quantity_per_unit=Decimal(str(component.quantity_per_unit)),
                size_multiplier=component.size_multiplier,
                is_active=component.is_active,
            )
        )
    return models


def _persist_recipe(db: Session, product: ProductModel, components) -> None:
    """Replace the recipe of a product (borra la anterior y guarda la nueva)."""
    for existing in list(product.recipe_components):
        db.delete(existing)
    db.flush()
    new_components = _validate_and_build_recipe_components(db, product, components or [])
    if new_components:
        db.add_all(new_components)
        db.flush()


def create_product(db: Session, data) -> ProductModel:
    if db.get(CategoryModel, data.category_id) is None:
        raise ValidationError("La categoría indicada no existe.")
    name = normalize_name(data.name)
    if db.scalars(select(ProductModel).where(ProductModel.name == name)).first() is not None:
        raise ValidationError("Ya existe un producto con ese nombre.", details={"name": name})
    product = ProductModel(
        name=name,
        category_id=data.category_id,
        base_price=Decimal(data.base_price),
        is_active=data.is_active,
    )
    if data.option_group_ids:
        groups = list(db.scalars(select(OptionGroupModel).where(OptionGroupModel.id.in_(data.option_group_ids))))
        if len(groups) != len(set(data.option_group_ids)):
            raise ValidationError("Uno de los grupos de opciones no existe.")
        product.option_groups = groups
    db.add(product)
    db.commit()
    db.refresh(product)
    # Persist recipe components (receta de insumos)
    if data.recipe_components:
        _persist_recipe(db, product, data.recipe_components)
        db.commit()
        db.refresh(product)
    return product


def update_product(db: Session, product_id: int, data) -> ProductModel:
    product = catalog_repo.get_product(db, product_id)
    if data.name is not None:
        name = normalize_name(data.name)
        duplicate = db.scalars(
            select(ProductModel).where(ProductModel.name == name, ProductModel.id != product.id)
        ).first()
        if duplicate is not None:
            raise ValidationError("Ya existe un producto con ese nombre.", details={"name": name})
        product.name = name
    if data.category_id is not None:
        if db.get(CategoryModel, data.category_id) is None:
            raise ValidationError("La categoría indicada no existe.")
        product.category_id = data.category_id
    if data.base_price is not None:
        product.base_price = Decimal(data.base_price)
    if data.is_active is not None:
        product.is_active = data.is_active
    if data.option_group_ids is not None:
        groups = list(db.scalars(select(OptionGroupModel).where(OptionGroupModel.id.in_(data.option_group_ids))))
        if len(groups) != len(set(data.option_group_ids)):
            raise ValidationError("Uno de los grupos de opciones no existe.")
        product.option_groups = groups
    # Replace recipe only when the client sends it explicitly
    if data.recipe_components is not None:
        _persist_recipe(db, product, data.recipe_components)
    db.commit()
    db.refresh(product)
    return product


def set_product_status(db: Session, product_id: int, is_active: bool) -> ProductModel:
    product = catalog_repo.get_product(db, product_id)
    product.is_active = is_active
    db.commit()
    db.refresh(product)
    return product


def create_ingredient(db: Session, data) -> IngredientModel:
    name = normalize_name(data.name)
    if db.scalars(select(IngredientModel).where(IngredientModel.name == name)).first() is not None:
        raise ValidationError("Ya existe un insumo con ese nombre.", details={"name": name})
    category = normalize_name(data.category)
    base_unit = normalize_name(data.base_unit)
    purchase_unit = normalize_name(data.purchase_unit) if data.purchase_unit else base_unit
    consumption_unit = normalize_name(data.consumption_unit) if data.consumption_unit else base_unit
    behavioral_type = data.behavioral_type or effective_behavioral_type(category, base_unit, None)
    conversion_factor = (
        Decimal(data.conversion_factor) if data.conversion_factor is not None else Decimal("1")
    )
    ingredient = IngredientModel(
        name=name,
        category=category,
        base_unit=base_unit,
        purchase_unit=purchase_unit,
        consumption_unit=consumption_unit,
        conversion_factor=conversion_factor,
        behavioral_type=behavioral_type,
        unit_name=normalize_name(data.unit_name) if data.unit_name else None,
        unit_weight=Decimal(data.unit_weight) if data.unit_weight is not None else None,
        current_stock=Decimal(data.current_stock),
        min_stock_alert=Decimal(data.min_stock_alert),
    )
    db.add(ingredient)
    db.commit()
    db.refresh(ingredient)
    return ingredient


def update_ingredient(db: Session, ingredient_id: int, data) -> IngredientModel:
    ingredient = db.get(IngredientModel, ingredient_id)
    if ingredient is None:
        raise NotFoundError("No encontramos ese insumo.")
    if data.name is not None:
        ingredient.name = normalize_name(data.name)
    if data.category is not None:
        ingredient.category = normalize_name(data.category)
    if data.base_unit is not None:
        ingredient.base_unit = normalize_name(data.base_unit)
    if data.purchase_unit is not None:
        ingredient.purchase_unit = normalize_name(data.purchase_unit) or None
    if data.consumption_unit is not None:
        ingredient.consumption_unit = normalize_name(data.consumption_unit) or None
    if data.conversion_factor is not None:
        ingredient.conversion_factor = Decimal(data.conversion_factor)
    if data.behavioral_type is not None:
        ingredient.behavioral_type = data.behavioral_type
    if data.unit_name is not None:
        ingredient.unit_name = normalize_name(data.unit_name) or None
    if data.unit_weight is not None:
        ingredient.unit_weight = Decimal(data.unit_weight)
    if data.min_stock_alert is not None:
        ingredient.min_stock_alert = Decimal(data.min_stock_alert)
    db.commit()
    db.refresh(ingredient)
    return ingredient


def ingredient_with_state(ingredient: IngredientModel, last_unit_cost: Decimal | None = None) -> dict:
    behavioral_type = effective_behavioral_type(
        ingredient.category, ingredient.base_unit, ingredient.behavioral_type
    )
    consumption_unit = effective_consumption_unit(ingredient.base_unit, ingredient.consumption_unit)
    return {
        "id": ingredient.id,
        "name": ingredient.name,
        "category": ingredient.category,
        "base_unit": ingredient.base_unit,
        "purchase_unit": ingredient.purchase_unit or ingredient.base_unit,
        "consumption_unit": consumption_unit,
        "conversion_factor": (
            ingredient.conversion_factor if ingredient.conversion_factor is not None else Decimal("1")
        ),
        "behavioral_type": behavioral_type,
        "increments": behavior_buttons(behavioral_type),
        "unit_name": ingredient.unit_name,
        "unit_weight": ingredient.unit_weight,
        "current_stock": ingredient.current_stock,
        "min_stock_alert": ingredient.min_stock_alert,
        "last_unit_cost": last_unit_cost,
        "updated_at": ingredient.updated_at,
        "state": stock_state(ingredient.current_stock, ingredient.min_stock_alert),
    }
