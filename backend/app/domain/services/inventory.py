"""Reglas de inventario (sección 26.5 y 26.6).

Los estados siempre llevan texto: nunca solo color.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

THREE_PLACES = Decimal("0.001")

# --- Motor de comportamiento universal de insumos (sección 6) -------------
# Cada comportamiento autodefine las etiquetas y los saltos de sus botones de
# incremento rápido. `unit` es la unidad de la ETIQUETA (g, ml, u); `amount` es
# la cantidad en ESA unidad (el frontend la convierte a la unidad de consumo).
BEHAVIOR_BUTTONS: dict[str, list[dict[str, str]]] = {
    "liquidos": [
        {"label": "+ 10 ml", "unit": "ml", "amount": "10"},
        {"label": "+ 50 ml", "unit": "ml", "amount": "50"},
        {"label": "+ 100 ml", "unit": "ml", "amount": "100"},
        {"label": "+ 250 ml", "unit": "ml", "amount": "250"},
    ],
    "solidos": [
        {"label": "+ 5 g", "unit": "g", "amount": "5"},
        {"label": "+ 25 g", "unit": "g", "amount": "25"},
        {"label": "+ 100 g", "unit": "g", "amount": "100"},
        {"label": "+ 500 g", "unit": "g", "amount": "500"},
    ],
    "unidades": [
        {"label": "+ 1 u", "unit": "u", "amount": "1"},
        {"label": "+ 5 u", "unit": "u", "amount": "5"},
        {"label": "+ 10 u", "unit": "u", "amount": "10"},
    ],
    "frutas_verduras": [
        {"label": "+ 10 g", "unit": "g", "amount": "10"},
        {"label": "+ 50 g", "unit": "g", "amount": "50"},
        {"label": "+ 200 g", "unit": "g", "amount": "200"},
        {"label": "+ 1 kg", "unit": "kg", "amount": "1"},
    ],
}

LIQUID_UNITS = {"ml", "l", "litro", "litros"}
COUNT_UNITS = {"unidad", "unidades", "u", "docena", "docenas"}
WEIGHT_UNITS = {"kg", "g", "gramo", "gramos", "kilo", "kilos"}


def effective_consumption_unit(base_unit: str | None, consumption_unit: str | None) -> str:
    """Unidad mínima en la que se guarda el stock: ml, g o unidad."""
    return (consumption_unit or base_unit or "unidad").strip().lower()


def effective_behavioral_type(
    category: str | None, base_unit: str | None, behavioral_type: str | None
) -> str:
    """Deduce el comportamiento cuando la fila no lo trae explícito."""
    if behavioral_type:
        return behavioral_type
    unit = (base_unit or "").strip().lower()
    cat = (category or "").strip().lower()
    if unit in LIQUID_UNITS:
        return "liquidos"
    if unit in COUNT_UNITS:
        return "unidades"
    if unit in WEIGHT_UNITS and ("fruta" in cat or "verdura" in cat):
        return "frutas_verduras"
    if unit in WEIGHT_UNITS:
        return "solidos"
    return "unidades"


def behavior_buttons(behavioral_type: str | None) -> list[dict[str, str]]:
    return BEHAVIOR_BUTTONS.get(behavioral_type or "unidades", BEHAVIOR_BUTTONS["unidades"])


def is_count_unit(consumption_unit: str | None) -> bool:
    """True para insumos que solo se cuentan en enteros (sin decimales)."""
    return (consumption_unit or "unidad").strip().lower() in COUNT_UNITS


def is_integer_quantity(value: Decimal) -> bool:
    return Decimal(value) == Decimal(value).to_integral_value()


def stock_state(current_stock: Decimal, min_stock_alert: Decimal) -> str:
    """BIEN / BAJO / CRITICO — siempre con texto, no solo color."""
    current = Decimal(current_stock)
    minimum = Decimal(min_stock_alert)
    if current <= minimum * Decimal("0.5"):
        return "CRITICO"
    if current <= minimum:
        return "BAJO"
    return "BIEN"


@dataclass(frozen=True)
class LowStockItem:
    ingredient_id: int
    name: str
    category: str
    base_unit: str
    current_stock: Decimal
    min_stock_alert: Decimal
    state: str


def low_stock_ingredients(rows: list[dict]) -> list[LowStockItem]:
    """Filter ingredients at or below their minimum, sorted by severity then ratio."""
    items: list[LowStockItem] = []
    for row in rows:
        state = stock_state(row["current_stock"], row["min_stock_alert"])
        if state == "BIEN":
            continue
        items.append(
            LowStockItem(
                ingredient_id=row["id"],
                name=row["name"],
                category=row["category"],
                base_unit=row["base_unit"],
                current_stock=Decimal(row["current_stock"]),
                min_stock_alert=Decimal(row["min_stock_alert"]),
                state=state,
            )
        )
    items.sort(key=lambda i: (i.state != "CRITICO", i.current_stock / max(i.min_stock_alert, Decimal("0.001"))))
    return items


def consumption_for_detail(
    recipe: list[dict],
    quantity: int,
    selected_option_ids: set[int] | None = None,
    selected_size_id: int | None = None,
    selected_size_name: str | None = None,
) -> dict[int, Decimal]:
    """Ingredient consumption for one order detail.

    Cada fila de receta (recipe row) aporta:
      · ingredient_id, quantity_per_unit (en unidad base),
      · option_id  -> la fila solo aplica si esa opción fue elegida,
      · size_option_id -> la fila solo aplica a ese tamaño (personal/pareja/familiar),
      · size_multiplier -> mapa {nombre_tamaño: factor} heredado (compatibilidad).
    """
    usage: dict[int, Decimal] = {}
    chosen = selected_option_ids or set()
    for component in recipe:
        option_id = component.get("option_id")
        if option_id is not None and option_id not in chosen:
            continue
        size_option_id = component.get("size_option_id")
        if size_option_id is not None:
            if selected_size_id is None or size_option_id != selected_size_id:
                continue
        factor = Decimal("1")
        multipliers = component.get("size_multiplier")
        if multipliers and selected_size_name and selected_size_name in multipliers:
            factor = Decimal(str(multipliers[selected_size_name]))
        ingredient_id = int(component["ingredient_id"])
        per_unit = Decimal(component["quantity_per_unit"])
        amount = (per_unit * factor * Decimal(quantity)).quantize(THREE_PLACES, rounding=ROUND_HALF_UP)
        usage[ingredient_id] = usage.get(ingredient_id, Decimal("0")) + amount
    return usage
