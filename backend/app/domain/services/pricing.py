"""Reglas de negocio puras para precios de ventas.

El backend es la fuente de verdad: nunca se acepta el total calculado por
el frontend (sección 26.1). Estas funciones no conocen FastAPI ni SQLAlchemy.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


TWO_PLACES = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    """Round to 2 decimals with half-up, the convention for cash handling."""
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class AssemblyOption:
    id: int
    name: str
    extra_cost: Decimal = Decimal("0")


@dataclass(frozen=True)
class DetailPricing:
    unit_price: Decimal
    subtotal: Decimal


def compute_detail_pricing(
    base_price: Decimal,
    quantity: int,
    options: list[AssemblyOption],
) -> DetailPricing:
    """unit_price = base + sum(extra_cost); subtotal = unit_price * quantity."""
    if quantity <= 0:
        raise ValueError("La cantidad debe ser mayor a cero.")
    extras = sum((opt.extra_cost for opt in options), Decimal("0"))
    unit_price = money(Decimal(base_price) + extras)
    subtotal = money(unit_price * quantity)
    return DetailPricing(unit_price=unit_price, subtotal=subtotal)


def compute_order_total(subtotals: list[Decimal]) -> Decimal:
    """order.total_amount = sum of all detail subtotals."""
    return money(sum((Decimal(s) for s in subtotals), Decimal("0")))
