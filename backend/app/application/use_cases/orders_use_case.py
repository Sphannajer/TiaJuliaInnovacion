"""Casos de uso de órdenes (secciones 26, 27.4 y 28).

Todas las operaciones son atómicas: el caso de uso controla commit/rollback.
El backend recalcula SIEMPRE precios y totales con datos de BD; nunca acepta
el total del frontend. El POS no se bloquea por stock desactualizado: si la
salida automática supera el stock, la venta se guarda y se registra alerta.
"""

import logging
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import (
    DomainError,
    InvalidOrderStateError,
    InvalidPaymentMethodError,
    PaymentRequiredError,
    ProductNotFoundError,
    UserNotFoundError,
    ValidationError,
)
from app.domain.enums import MovementType, OrderStatus
from app.domain.services.assembly import (
    GroupDefinition,
    GroupSelection,
    build_assembly_config,
    config_to_label,
    validate_selection,
)
from app.domain.services.inventory import consumption_for_detail
from app.domain.services.pricing import AssemblyOption, compute_detail_pricing
from app.infrastructure.db.models import (
    IngredientModel,
    InventoryMovementModel,
    OptionModel,
    OrderDetailModel,
    OrderModel,
    ProductModel,
    RecipeComponentModel,
)
from app.infrastructure.db.repositories import orders_repo

logger = logging.getLogger("tia_julia.orders")


class InventoryAlert:
    """Non-blocking stock alert raised while saving a sale."""

    def __init__(self, ingredient: IngredientModel, requested: Decimal):
        self.ingredient_id = ingredient.id
        self.ingredient_name = ingredient.name
        self.requested = float(requested)
        self.available = float(ingredient.current_stock)


class OrderResult:
    def __init__(self, order: OrderModel, inventory_alerts: list[InventoryAlert] | None = None):
        self.order = order
        self.inventory_alerts = inventory_alerts or []


def _load_product_context(db: Session, product_id: int) -> tuple[ProductModel, list[GroupDefinition], bool]:
    product = db.get(ProductModel, product_id)
    if product is None or not product.is_active:
        raise ProductNotFoundError()
    category = product.category
    allows_multiple = bool(category.allows_multiple_ingredients) if category else False
    groups: list[GroupDefinition] = []
    for group in sorted(product.option_groups, key=lambda g: g.id):
        options = [
            AssemblyOption(id=o.id, name=o.name, extra_cost=Decimal(o.extra_cost))
            for o in sorted(group.options, key=lambda x: x.id)
            if o.is_active
        ]
        groups.append(GroupDefinition(id=group.id, name=group.name, mode="single", options=options))
    return product, groups, allows_multiple


def _options_by_id(db: Session, option_ids: list[int]) -> dict[int, OptionModel]:
    if not option_ids:
        return {}
    options = db.query(OptionModel).filter(OptionModel.id.in_(option_ids)).all()
    found = {o.id: o for o in options}
    missing = set(option_ids) - set(found.keys())
    if missing:
        raise ValidationError("Una de las opciones seleccionadas no existe.", details={"option_ids": sorted(missing)})
    return found


def _price_detail(
    db: Session,
    product: ProductModel,
    quantity: int,
    option_ids: list[int],
) -> tuple[Decimal, Decimal, dict, list[OptionModel]]:
    """Validate options against groups, recompute price. Returns unit_price, subtotal, config, options."""
    _product, groups, allows_multiple = _load_product_context(db, product.id)
    valid_group_ids = {g.id for g in groups}
    options_map = _options_by_id(db, option_ids)
    for option in options_map.values():
        if option.group_id not in valid_group_ids:
            raise ValidationError(
                f"La opción {option.name} no pertenece a los grupos de {product.name}.",
                details={"option_id": option.id},
            )
    # Group all selected options by their group (multi-select groups like
    # Fruta may include several options in ONE selection).
    grouped: dict[int, list[int]] = {}
    for option in sorted(options_map.values(), key=lambda o: o.id):
        grouped.setdefault(int(option.group_id), []).append(option.id)
    selections = [
        GroupSelection(group_id=group_id, group_name="", selected_option_ids=ids)
        for group_id, ids in sorted(grouped.items())
    ]
    selected: list[AssemblyOption] = validate_selection(groups, selections, allows_multiple)
    pricing = compute_detail_pricing(Decimal(product.base_price), quantity, selected)
    # Rebuild selections with names for the structured config
    named_selections = []
    for group in groups:
        ids = [o.id for o in options_map.values() if o.group_id == group.id]
        if ids:
            named_selections.append(GroupSelection(group_id=group.id, group_name=group.name, selected_option_ids=ids))
    config = build_assembly_config(groups, named_selections, allows_multiple)
    ordered_options = [options_map[o.id] for o in selected]
    return pricing.unit_price, pricing.subtotal, config, ordered_options


def _recipe_rows(recipe) -> list[dict]:
    """Normaliza las filas de receta a los campos que consume el cálculo."""
    return [
        {
            "ingredient_id": row.ingredient_id,
            "quantity_per_unit": row.quantity_per_unit,
            "option_id": row.option_id,
            "size_option_id": row.size_option_id,
            "size_multiplier": row.size_multiplier,
        }
        for row in recipe
    ]


def _selected_size(options: list[OptionModel]) -> tuple[int | None, str | None]:
    """Encuentra el tamaño elegido (personal/pareja/familiar) entre las opciones."""
    for option in options:
        group = option.group
        if group is None:
            continue
        group_name = " ".join((group.name or "").strip().lower().split())
        if group_name in ("tamaño", "tamano"):
            return option.id, option.name
    return None, None


def _detail_consumption(db: Session, detail: OrderDetailModel, options: list[OptionModel]):
    recipe = orders_repo.active_product_recipe(db, detail.product_id)
    if not recipe:
        return None
    size_id, size_name = _selected_size(options)
    return consumption_for_detail(
        _recipe_rows(recipe),
        detail.quantity,
        {o.id for o in options},
        size_id,
        size_name,
    )


def _deduct_inventory(
    db: Session,
    order: OrderModel,
    detail: OrderDetailModel,
    options: list[OptionModel],
) -> list[InventoryAlert]:
    """Deduct ingredient stock per recipe components. Never blocks the sale."""
    usage = _detail_consumption(db, detail, options)
    if not usage:
        return []
    alerts: list[InventoryAlert] = []
    for ingredient_id, amount in usage.items():
        if amount <= 0:
            continue
        ingredient = db.get(IngredientModel, ingredient_id)
        if ingredient is None:
            continue
        if ingredient.current_stock < amount:
            alerts.append(InventoryAlert(ingredient, amount))
        ingredient.current_stock = Decimal(ingredient.current_stock) - amount
        db.add(
            InventoryMovementModel(
                ingredient_id=ingredient.id,
                movement_type=MovementType.SALIDA.value,
                quantity=amount,
                reference_id=detail.order_id,
                notes=f"Venta orden #{order.id}",
            )
        )
    return alerts


def create_order(db: Session, data) -> OrderResult:
    """Create an order from validated DTO. pay_now -> status pagado in one transaction."""
    if not orders_repo.user_exists(db, data.user_id):
        raise UserNotFoundError()
    if data.pay_now and data.payment_method_id is None:
        raise PaymentRequiredError()
    if data.payment_method_id is not None and orders_repo.get_payment_method(db, data.payment_method_id) is None:
        raise InvalidPaymentMethodError()

    order = OrderModel(
        user_id=data.user_id,
        order_type=data.order_type,
        status=OrderStatus.EN_PREPARACION.value,
        customer_name=(data.customer_name or None),
        table_number=(data.table_number or None),
        sync_status="synced",
    )
    db.add(order)
    db.flush()  # get order.id

    alerts: list[InventoryAlert] = []
    for item in data.items:
        product = db.get(ProductModel, item.product_id)
        if product is None or not product.is_active:
            raise ProductNotFoundError()
        unit_price, subtotal, config, options = _price_detail(db, product, item.quantity, item.option_ids)
        detail = OrderDetailModel(
            order_id=order.id,
            product_id=product.id,
            quantity=item.quantity,
            unit_price=unit_price,
            subtotal=subtotal,
            assembly_config=config,
            notes=item.notes,
        )
        db.add(detail)
        db.flush()
        alerts.extend(_deduct_inventory(db, order, detail, options))

    orders_repo.recalc_order_total(db, order)

    if data.pay_now:
        order.status = OrderStatus.PAGADO.value
        order.payment_method_id = data.payment_method_id

    db.commit()
    db.refresh(order)
    return OrderResult(order, alerts)


def add_detail(db: Session, order_id: int, item) -> OrderResult:
    return add_details(db, order_id, [item])


def add_details(db: Session, order_id: int, items) -> OrderResult:
    order = orders_repo.get_order(db, order_id)
    if order.status == OrderStatus.CANCELADO.value:
        raise InvalidOrderStateError("No se puede modificar una orden cancelada.")
    if order.status == OrderStatus.PAGADO.value:
        raise InvalidOrderStateError("La orden ya está pagada; no admite más productos.")
    alerts: list[InventoryAlert] = []
    for item in items:
        product = db.get(ProductModel, item.product_id)
        if product is None or not product.is_active:
            raise ProductNotFoundError()
        unit_price, subtotal, config, options = _price_detail(db, product, item.quantity, item.option_ids)
        detail = OrderDetailModel(
            order_id=order.id,
            product_id=product.id,
            quantity=item.quantity,
            unit_price=unit_price,
            subtotal=subtotal,
            assembly_config=config,
            notes=item.notes,
        )
        db.add(detail)
        db.flush()
        alerts.extend(_deduct_inventory(db, order, detail, options))
    orders_repo.recalc_order_total(db, order)
    db.commit()
    db.refresh(order)
    return OrderResult(order, alerts)


def update_detail(db: Session, order_id: int, detail_id: int, data) -> OrderResult:
    order = orders_repo.get_order(db, order_id)
    if order.status != OrderStatus.EN_PREPARACION.value:
        raise InvalidOrderStateError("Solo las órdenes en preparación admiten cambios.")
    detail = db.get(OrderDetailModel, detail_id)
    if detail is None or detail.order_id != order.id:
        raise DomainError("Ese detalle no pertenece a la orden.", details={})
    new_quantity = data.quantity if data.quantity is not None else detail.quantity
    option_ids = data.option_ids if data.option_ids is not None else _config_option_ids(detail.assembly_config)
    product = db.get(ProductModel, detail.product_id)
    if product is None:
        raise ProductNotFoundError()
    unit_price, subtotal, config, options = _price_detail(db, product, new_quantity, option_ids)
    # Reverse previous inventory effect then apply the new one
    _reverse_detail_inventory(db, order, detail)
    detail.quantity = new_quantity
    detail.unit_price = unit_price
    detail.subtotal = subtotal
    detail.assembly_config = config
    if data.notes is not None:
        detail.notes = data.notes
    db.flush()
    alerts = _deduct_inventory(db, order, detail, options)
    orders_repo.recalc_order_total(db, order)
    db.commit()
    db.refresh(order)
    return OrderResult(order, alerts)


def remove_detail(db: Session, order_id: int, detail_id: int) -> OrderResult:
    order = orders_repo.get_order(db, order_id)
    if order.status != OrderStatus.EN_PREPARACION.value:
        raise InvalidOrderStateError("Solo las órdenes en preparación admiten cambios.")
    detail = db.get(OrderDetailModel, detail_id)
    if detail is None or detail.order_id != order.id:
        raise DomainError("Ese detalle no pertenece a la orden.", details={})
    _reverse_detail_inventory(db, order, detail)
    db.delete(detail)
    db.flush()
    orders_repo.recalc_order_total(db, order)
    db.commit()
    db.refresh(order)
    return OrderResult(order)


def _config_option_ids(config: dict | None) -> list[int]:
    if not config:
        return []
    ids: list[int] = []
    for _group, group_data in (config.get("groups") or {}).items():
        for option in group_data.get("options", []):
            if option.get("id"):
                ids.append(int(option["id"]))
    return ids


def _reverse_detail_inventory(db: Session, order: OrderModel, detail: OrderDetailModel) -> None:
    """Return deducted ingredients to stock when editing/removing a detail."""
    option_ids = _config_option_ids(detail.assembly_config)
    options_by_id = _options_by_id(db, option_ids)
    options = list(options_by_id.values())
    usage = _detail_consumption(db, detail, options)
    if not usage:
        return
    for ingredient_id, amount in usage.items():
        ingredient = db.get(IngredientModel, ingredient_id)
        if ingredient is None or amount <= 0:
            continue
        ingredient.current_stock = Decimal(ingredient.current_stock) + amount
        db.add(
            InventoryMovementModel(
                ingredient_id=ingredient.id,
                movement_type=MovementType.ENTRADA.value,
                quantity=amount,
                reference_id=order.id,
                notes=f"Reversión por edición de orden #{order.id}",
            )
        )


def pay_order(db: Session, order_id: int, payment_method_id: int) -> OrderModel:
    """Atomic payment flow (sección 28, pasos 1-8)."""
    order = orders_repo.get_order(db, order_id)
    if order.status == OrderStatus.PAGADO.value:
        raise InvalidOrderStateError("La orden ya está pagada.")
    if order.status == OrderStatus.CANCELADO.value:
        raise InvalidOrderStateError("No se puede pagar una orden cancelada.")
    method = orders_repo.get_payment_method(db, payment_method_id)
    if method is None:
        raise InvalidPaymentMethodError()
    orders_repo.recalc_order_total(db, order)
    order.status = OrderStatus.PAGADO.value
    order.payment_method_id = method.id
    db.commit()
    db.refresh(order)
    return order


def cancel_order(db: Session, order_id: int) -> OrderModel:
    """Soft cancel: never delete. Cancelled orders never count as sales."""
    order = orders_repo.get_order(db, order_id)
    if order.status == OrderStatus.CANCELADO.value:
        raise InvalidOrderStateError("La orden ya está cancelada.")
    if order.status == OrderStatus.PAGADO.value:
        raise InvalidOrderStateError(
            "Una orden pagada no puede cancelarse desde la pantalla normal."
        )
    # Return reserved inventory for pending details
    for detail in list(order.details):
        _reverse_detail_inventory(db, order, detail)
    order.status = OrderStatus.CANCELADO.value
    db.commit()
    db.refresh(order)
    return order


def list_orders(db: Session, day: date | None, status: str | None, order_type: str | None, search: str | None, limit: int, offset: int):
    return orders_repo.list_orders(db, day=day, status=status, order_type=order_type, search=search, limit=limit, offset=offset)
