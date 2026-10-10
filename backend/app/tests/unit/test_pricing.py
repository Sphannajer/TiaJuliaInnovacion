"""Tests unitarios de reglas de negocio (sección 41.1)."""

from decimal import Decimal

import pytest

from app.domain.services.assembly import (
    GroupDefinition,
    GroupSelection,
    build_assembly_config,
    is_group_multiple,
    validate_selection,
)
from app.domain.services.inventory import consumption_for_detail, stock_state
from app.domain.services.pricing import (
    AssemblyOption,
    compute_detail_pricing,
    compute_order_total,
)
from app.domain.services.recommendations import (
    recommend_purchase_quantity,
    unit_rounding,
)


def _opt(id_: int, name: str, extra: str) -> AssemblyOption:
    return AssemblyOption(id=id_, name=name, extra_cost=Decimal(extra))


class TestPricing:
    def test_unit_price_con_extras(self):
        """26.1: unit_price = base + suma(extra_cost)."""
        pricing = compute_detail_pricing(
            Decimal("10.00"),
            1,
            [
                _opt(1, "Grande", "2.00"),
                _opt(2, "Fresa", "0.50"),
                _opt(3, "Leche", "2.00"),
            ],
        )
        assert pricing.unit_price == Decimal("14.50")
        assert pricing.subtotal == Decimal("14.50")

    def test_subtotal_multiplica_cantidad(self):
        pricing = compute_detail_pricing(Decimal("10.00"), 3, [_opt(1, "Grande", "2.00")])
        assert pricing.subtotal == Decimal("36.00")

    def test_cantidad_cero_rechazada(self):
        with pytest.raises(ValueError):
            compute_detail_pricing(Decimal("10"), 0, [])

    def test_total_orden_suma_subtotales(self):
        total = compute_order_total([Decimal("12.50"), Decimal("8.00"), Decimal("4.50")])
        assert total == Decimal("25.00")


class TestMultiFruit:
    def _groups(self):
        frutas = GroupDefinition(
            id=2,
            name="Fruta",
            mode="single",
            options=[_opt(4, "Papaya", "0"), _opt(5, "Fresa", "0.50"), _opt(6, "Naranja", "0")],
        )
        tamano = GroupDefinition(
            id=1,
            name="Tamaño",
            mode="single",
            options=[_opt(3, "Grande", "2.00")],
        )
        return [tamano, frutas]

    def test_multi_fruta_permitida_con_categoria_multiple(self):
        options = validate_selection(
            self._groups(),
            [
                GroupSelection(group_id=2, group_name="Fruta", selected_option_ids=[4, 5]),
                GroupSelection(group_id=1, group_name="Tamaño", selected_option_ids=[3]),
            ],
            category_allows_multiple=True,
        )
        assert {o.name for o in options} == {"Papaya", "Fresa", "Grande"}

    def test_multi_fruta_rechazada_sin_categoria_multiple(self):
        from app.core.exceptions import InsufficientOptionsError

        with pytest.raises(InsufficientOptionsError):
            validate_selection(
                self._groups(),
                [GroupSelection(group_id=2, group_name="Fruta", selected_option_ids=[4, 5])],
                category_allows_multiple=False,
            )

    def test_grupo_single_rechaza_dos_opciones(self):
        from app.core.exceptions import InsufficientOptionsError

        with pytest.raises(InsufficientOptionsError):
            validate_selection(
                self._groups(),
                [GroupSelection(group_id=1, group_name="Tamaño", selected_option_ids=[3, 4])],
                category_allows_multiple=True,
            )

    def test_opcion_de_otro_grupo_rechazada(self):
        from app.core.exceptions import InsufficientOptionsError

        groups = self._groups()
        with pytest.raises(InsufficientOptionsError):
            validate_selection(
                groups,
                [GroupSelection(group_id=1, group_name="Tamaño", selected_option_ids=[4])],
                category_allows_multiple=True,
            )

    def test_is_group_multiple_solo_fruta(self):
        assert is_group_multiple("Fruta", True) is True
        assert is_group_multiple("Fruta", False) is False
        assert is_group_multiple("Base", True) is False

    def test_assembly_config_estructura(self):
        """26.2: JSON estructurado con IDs y nombres."""
        config = build_assembly_config(
            self._groups(),
            [
                GroupSelection(group_id=1, group_name="Tamaño", selected_option_ids=[3]),
                GroupSelection(group_id=2, group_name="Fruta", selected_option_ids=[4, 5]),
            ],
            True,
        )
        assert config["groups"]["Tamaño"]["mode"] == "single"
        assert config["groups"]["Fruta"]["mode"] == "multiple"
        assert config["groups"]["Fruta"]["options"][0]["id"] == 4
        assert config["groups"]["Fruta"]["options"][0]["name"] == "Papaya"


class TestStockState:
    def test_bien_sobre_minimo(self):
        assert stock_state(Decimal("8"), Decimal("5")) == "BIEN"

    def test_bajo_en_minimo(self):
        assert stock_state(Decimal("5"), Decimal("5")) == "BAJO"

    def test_critico_a_la_mitad(self):
        assert stock_state(Decimal("2.4"), Decimal("5")) == "CRITICO"


class TestConsumption:
    def test_consumo_con_receta(self):
        recipe = [
            {"ingredient_id": 1, "quantity_per_unit": "0.200", "size_option_id": None, "size_multiplier": None},
        ]
        usage = consumption_for_detail(recipe, 3, None)
        assert usage[1] == Decimal("0.600")

    def test_consumo_por_tamano_explicito(self):
        """Cada fila guarda su tamaño (size_option_id): se cuenta solo el elegido."""
        recipe = [
            {"ingredient_id": 1, "quantity_per_unit": "1", "option_id": 10, "size_option_id": 100, "size_multiplier": None},
            {"ingredient_id": 1, "quantity_per_unit": "2", "option_id": 10, "size_option_id": 200, "size_multiplier": None},
        ]
        # Tamaño 200 (pareja) y opción elegida 10 -> 2 unidades.
        assert consumption_for_detail(recipe, 1, {10}, 200, "pareja")[1] == Decimal("2.000")
        # Otro tamaño no aporta nada.
        assert consumption_for_detail(recipe, 1, {10}, 999, "x") == {}
        # Si no se eligió la opción gatillo, no se descuenta.
        assert consumption_for_detail(recipe, 1, set(), 100, "personal") == {}

    def test_consumo_legacy_size_multiplier(self):
        """Compatibilidad: filas antiguas escalan por nombre de tamaño."""
        recipe = [
            {
                "ingredient_id": 1,
                "quantity_per_unit": "0.200",
                "option_id": None,
                "size_option_id": None,
                "size_multiplier": {"personal": 0.8, "pareja": 1.0, "familiar": 1.25},
            }
        ]
        assert consumption_for_detail(recipe, 2, set(), None, "familiar")[1] == Decimal("0.500")

    def test_consumo_no_negativo_y_redondeo_recomendacion(self):
        """32: nunca negativa; kg a pasos de 0.5."""
        recommended = recommend_purchase_quantity(
            current_stock=Decimal("3.2"),
            min_stock_alert=Decimal("5"),
            expected_consumption=Decimal("6.1"),
            base_unit="kg",
        )
        assert recommended >= 0
        # 6.1 + 5 (reserva) - 3.2 = 7.9 -> redondeado a pasos de 0.5 kg (ejemplo del spec: 8 kg)
        assert recommended == Decimal("8.000")
        assert unit_rounding("kg", Decimal("6.3")) == Decimal("6.500")
        assert unit_rounding("kg", Decimal("0")) == Decimal("0")
        assert recommend_purchase_quantity(Decimal("50"), Decimal("5"), Decimal("1"), "kg") == Decimal("0")
