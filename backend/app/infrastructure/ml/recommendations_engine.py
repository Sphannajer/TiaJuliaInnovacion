"""Motor de recomendaciones de compra (sección 32).

Usa: stock actual, stock mínimo, demanda prevista (pronósticos ML),
consumo estimado por recetas y margen de seguridad.
"""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.timezone import now_lima
from app.domain.services.recommendations import (
    build_recommendation_reason,
    recommend_purchase_quantity,
)
from app.infrastructure.db.models import (
    DemandForecastModel,
    IngredientModel,
    OrderDetailModel,
    OrderModel,
    PurchaseRecommendationModel,
    RecipeComponentModel,
)


def expected_consumption_for_week(db: Session, ingredient_id: int, days: int = 7) -> Decimal:
    """Estimated ingredient consumption over the forecast horizon.

    Combines demand forecasts (per product per day) with recipe components.
    Falls back to the recent 28-day average consumption when no forecast
    exists for the ingredient's products.
    """
    start = now_lima().date() + timedelta(days=1)
    end = start + timedelta(days=days)

    forecast_rows = db.execute(
        select(
            DemandForecastModel.product_id,
            DemandForecastModel.predicted_quantity,
        )
        .where(DemandForecastModel.forecast_date >= start)
        .where(DemandForecastModel.forecast_date < end)
    ).all()

    components = db.execute(
        select(
            RecipeComponentModel.product_id,
            RecipeComponentModel.option_id,
            RecipeComponentModel.ingredient_id,
            RecipeComponentModel.quantity_per_unit,
        )
        .where(RecipeComponentModel.ingredient_id == ingredient_id)
        .where(RecipeComponentModel.is_active.is_(True))
    ).all()

    consumption = Decimal("0")
    matched_any_forecast = False
    for product_id, option_id, comp_ingredient_id, per_unit in components:
        if int(comp_ingredient_id) != int(ingredient_id):
            continue
        predicted = sum(
            Decimal(str(_q)) for pid, _q in forecast_rows if int(pid) == int(product_id)
        )
        if predicted > 0:
            matched_any_forecast = True
        # Option-linked components apply only when that option is chosen; use a
        # conservative fraction (half of predicted units) for option extras, and
        # the full quantity for base components without option.
        factor = Decimal("0.5") if option_id is not None else Decimal("1")
        consumption += predicted * per_unit * factor

    if matched_any_forecast or consumption > 0:
        return consumption.quantize(Decimal("0.01"))

    return _recent_average_consumption(db, ingredient_id, days=28) * days


def _recent_average_consumption(db: Session, ingredient_id: int, days: int) -> Decimal:
    """Average daily consumption from recipe components over recent paid orders."""
    since = now_lima().date() - timedelta(days=days)
    details = db.execute(
        select(
            OrderDetailModel.product_id,
            OrderDetailModel.assembly_config,
            func.sum(OrderDetailModel.quantity).label("quantity"),
        )
        .join(OrderModel, OrderDetailModel.order_id == OrderModel.id)
        .where(OrderModel.status == "pagado")
        .where(func.date(OrderModel.created_at) >= since)
        .group_by(OrderDetailModel.product_id, OrderDetailModel.assembly_config)
    ).all()
    if not details:
        return Decimal("0")

    components = db.execute(
        select(
            RecipeComponentModel.product_id,
            RecipeComponentModel.option_id,
            RecipeComponentModel.ingredient_id,
            RecipeComponentModel.quantity_per_unit,
        )
        .where(RecipeComponentModel.ingredient_id == ingredient_id)
        .where(RecipeComponentModel.is_active.is_(True))
    ).all()

    total = Decimal("0")
    for product_id, config, quantity in details:
        chosen_options = _options_in_config(config)
        for comp_product, comp_option, _ing, per_unit in components:
            if int(comp_product) != int(product_id):
                continue
            if comp_option is not None and int(comp_option) not in chosen_options:
                continue
            total += Decimal(str(quantity)) * Decimal(str(per_unit))
    return (total / Decimal(days)).quantize(Decimal("0.01"))


def _options_in_config(config) -> set[int]:
    if not config:
        return set()
    chosen: set[int] = set()
    for _group, data in (config.get("groups") or {}).items():
        for option in data.get("options", []):
            if option.get("id"):
                chosen.add(int(option["id"]))
    return chosen


def generate_recommendations(db: Session, days: int = 7) -> list[dict]:
    """Create/update pending recommendations for ingredients below target."""
    ingredients = list(db.scalars(select(IngredientModel)).all())
    created: list[dict] = []
    for ingredient in ingredients:
        stock = Decimal(ingredient.current_stock)
        minimum = Decimal(ingredient.min_stock_alert)
        consumption = expected_consumption_for_week(db, ingredient.id, days)
        recommended = recommend_purchase_quantity(stock, minimum, consumption, ingredient.base_unit)
        if recommended <= 0:
            continue
        reason = build_recommendation_reason(
            ingredient.name, stock, minimum, consumption, recommended, ingredient.base_unit
        )
        existing = db.scalars(
            select(PurchaseRecommendationModel)
            .where(PurchaseRecommendationModel.ingredient_id == ingredient.id)
            .where(PurchaseRecommendationModel.status == "pendiente")
        ).first()
        if existing:
            existing.recommended_quantity = recommended
            existing.reason = reason
            row = existing
        else:
            row = PurchaseRecommendationModel(
                ingredient_id=ingredient.id,
                recommended_quantity=recommended,
                reason=reason,
                status="pendiente",
            )
            db.add(row)
        created.append(
            {
                "id": row.id,
                "ingredient_id": ingredient.id,
                "ingredient_name": ingredient.name,
                "recommended_quantity": float(recommended),
                "reason": reason,
                "status": row.status,
            }
        )
    db.commit()
    return created
