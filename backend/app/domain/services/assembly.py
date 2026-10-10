"""Ensamblador universal (sección 26.2 y 26.3).

Validación en backend de la selección de opciones, y construcción del
assembly_config estructurado (JSON con nombres e IDs para trazabilidad).
"""

from dataclasses import dataclass, field
from decimal import Decimal

from app.core.exceptions import InsufficientOptionsError, ValidationError
from app.domain.services.pricing import AssemblyOption


@dataclass(frozen=True)
class GroupDefinition:
    """Definition of an option group attached to a product."""

    id: int
    name: str
    mode: str  # "single" | "multiple"
    options: list[AssemblyOption] = field(default_factory=list)


@dataclass(frozen=True)
class GroupSelection:
    group_id: int
    group_name: str
    selected_option_ids: list[int]


MULTI_INGREDIENT_GROUP = "Fruta"


def is_group_multiple(group_name: str, category_allows_multiple: bool) -> bool:
    """MVP rule (26.3): only 'Fruta' is multi-select, and only when the
    product's category allows multiple ingredients."""
    if not category_allows_multiple:
        return False
    return group_name == MULTI_INGREDIENT_GROUP


def validate_selection(
    groups: list[GroupDefinition],
    selections: list[GroupSelection],
    category_allows_multiple: bool,
) -> list[AssemblyOption]:
    """Validate option selection against product groups.

    Rules:
    - every selected option must belong to a group of the product;
    - single groups accept exactly one option (empty allowed only if the
      group has no required semantics — the frontend always sends one);
    - multi groups (Fruta) accept one or more;
    - backend never trusts the frontend label: it re-derives the mode.
    """
    by_id = {g.id: g for g in groups}
    selected_options: list[AssemblyOption] = []
    seen_groups: set[int] = set()

    for sel in selections:
        group = by_id.get(sel.group_id)
        if group is None:
            raise InsufficientOptionsError(
                "El producto no tiene un grupo de opciones válido.",
                details={"group_id": sel.group_id},
            )
        if group.id in seen_groups:
            raise ValidationError("No se puede repetir un grupo de opciones.")
        seen_groups.add(group.id)

        mode = (
            "multiple"
            if is_group_multiple(group.name, category_allows_multiple)
            else "single"
        )
        if mode == "single" and len(sel.selected_option_ids) > 1:
            raise InsufficientOptionsError(
                f"El grupo {group.name} solo acepta una opción.",
                details={"group_id": group.id},
            )
        if not sel.selected_option_ids:
            continue

        valid_ids = {o.id for o in group.options}
        for option_id in sel.selected_option_ids:
            option = next((o for o in group.options if o.id == option_id), None)
            if option is None:
                raise InsufficientOptionsError(
                    f"La opción no pertenece al grupo {group.name}.",
                    details={"group_id": group.id, "option_id": option_id},
                )
            selected_options.append(option)

    return selected_options


def build_assembly_config(
    groups: list[GroupDefinition],
    selections: list[GroupSelection],
    category_allows_multiple: bool,
) -> dict:
    """Structured assembly_config with names and IDs for historical traceability."""
    by_id = {g.id: g for g in groups}
    config: dict = {"groups": {}}
    for sel in selections:
        group = by_id.get(sel.group_id)
        if group is None or not sel.selected_option_ids:
            continue
        mode = (
            "multiple"
            if is_group_multiple(group.name, category_allows_multiple)
            else "single"
        )
        options = [
            {
                "id": o.id,
                "name": o.name,
                "extra_cost": float(o.extra_cost),
            }
            for o in group.options
            if o.id in sel.selected_option_ids
        ]
        config["groups"][group.name] = {"mode": mode, "options": options}
    return config


def config_to_label(config: dict) -> str:
    """Human-readable one-line label, e.g. 'Grande · Papaya + Fresa · Leche'."""
    parts: list[str] = []
    for _group_name, data in (config.get("groups") or {}).items():
        names = [o.get("name", "") for o in data.get("options", [])]
        if names:
            parts.append(" + ".join(n for n in names if n))
    return " · ".join(parts)


def config_extra_cost(config: dict) -> Decimal:
    total = Decimal("0")
    for _group_name, data in (config.get("groups") or {}).items():
        for option in data.get("options", []):
            total += Decimal(str(option.get("extra_cost", "0")))
    return total
