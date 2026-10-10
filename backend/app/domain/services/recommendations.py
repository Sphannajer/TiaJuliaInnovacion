"""Recomendaciones de compra (sección 32).

necesidad = consumo_previsto + stock_seguridad - stock_actual
recomendado = max(0, necesidad), redondeado según unidad.
Nunca cantidades negativas. Motivo en lenguaje natural.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_CEILING


SAFETY_MARGIN = Decimal("1.0")  # in units of min_stock_alert


@dataclass(frozen=True)
class PurchaseRecommendation:
    ingredient_id: int
    ingredient_name: str
    base_unit: str
    recommended_quantity: Decimal
    reason: str


def unit_rounding(base_unit: str, quantity: Decimal) -> Decimal:
    """Round up to practical purchase steps: kg -> 0.5, ml -> 500, units -> 1."""
    quantity = Decimal(quantity)
    if quantity <= 0:
        return Decimal("0")
    if base_unit == "kg":
        step = Decimal("0.5")
    elif base_unit == "ml":
        step = Decimal("500")
    elif base_unit in ("unidad", "unid."):
        step = Decimal("1")
    else:
        step = Decimal("1")
    units = (quantity / step).to_integral_value(rounding=ROUND_CEILING)
    return (units * step).quantize(Decimal("0.001"))


def recommend_purchase_quantity(
    current_stock: Decimal,
    min_stock_alert: Decimal,
    expected_consumption: Decimal,
    base_unit: str,
    safety_margin: Decimal = SAFETY_MARGIN,
) -> Decimal:
    """recommended = max(0, consumo_previsto + margen_seguridad - stock_actual)."""
    if min_stock_alert <= 0:
        safety = Decimal("0")
    else:
        safety = min_stock_alert * safety_margin
    need = Decimal(expected_consumption) + safety - Decimal(current_stock)
    return unit_rounding(base_unit, max(Decimal("0"), need))


def format_quantity(quantity: Decimal, base_unit: str) -> str:
    value = Decimal(quantity)
    if base_unit == "ml":
        if value >= 1000:
            liters = value / Decimal("1000")
            return f"{liters.normalize()} L"
        return f"{value.normalize()} ml"
    unit_labels = {"unidad": "unid.", "unid.": "unid."}
    label = unit_labels.get(base_unit, base_unit)
    return f"{value.normalize()} {label}"


def build_recommendation_reason(
    ingredient_name: str,
    current_stock: Decimal,
    min_stock_alert: Decimal,
    expected_consumption: Decimal,
    recommended: Decimal,
    base_unit: str,
) -> str:
    stock_txt = format_quantity(Decimal(current_stock), base_unit)
    consumption_txt = format_quantity(Decimal(expected_consumption), base_unit)
    reserve_txt = format_quantity(Decimal(min_stock_alert), base_unit)
    buy_txt = format_quantity(Decimal(recommended), base_unit)
    if Decimal(recommended) <= 0:
        return (
            f"El stock de {ingredient_name} ({stock_txt}) alcanza para el consumo "
            f"esperado ({consumption_txt}) manteniendo la reserva de {reserve_txt}."
        )
    return (
        f"El stock actual es {stock_txt} y se estima un consumo de {consumption_txt} "
        f"para el periodo. Para mantener {reserve_txt} de reserva, se recomienda "
        f"comprar {buy_txt}."
    )
