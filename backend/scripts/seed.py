"""Seed idempotente del catálogo (sección 25).

Si los registros ya existen, no se duplican. Los datos demo se identifican
claramente en logs y nunca se mezclan con producción.
"""

import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.logging import logger
from app.infrastructure.db.models import (
    CategoryModel,
    IngredientModel,
    OptionGroupModel,
    OptionModel,
    PaymentMethodModel,
    ProductModel,
    ProductOptionGroupModel,
    RecipeComponentModel,
    UserModel,
)

# 25.1 Usuarios (nombres propios, no se normalizan)
USERS = ["Olga", "Aylin", "Angelo", "Alejandro"]

# 25.2 Métodos de pago (deben coincidir con el reporte Yape/Efectivo)
PAYMENT_METHODS = ["Efectivo", "Yape"]

# 25.3 Categorías — nombres en minúsculas (estandarización)
CATEGORIES = [
    ("jugos", True),
    ("empanadas", False),
    ("queques", False),
    ("panes", False),
    ("gelatinas", False),
]

# 25.4 Insumos demo (modelo de inventario profundo, sección 4 y 6).
# (name, category, unit, stock, min_stock, unit_name, unit_weight,
#  purchase_unit, conversion_factor, behavioral_type)
#
# · base_unit es la unidad en la que se guarda el stock.
# · purchase_unit describe el empaque de compra ("Caja/Litro", "Saco 5kg").
# · conversion_factor = cuántas unidades de consumo rinde una compra.
# · behavioral_type define los botones: liquidos | solidos | unidades | frutas_verduras.
# · unit_name/unit_weight permiten CONTAR en vez de pesar/medir (1 fresa ≈ 15 g).
INGREDIENTS = [
    ("papaya", "fruta", "kg", "3.200", "5.000", None, None, "kg", "1000", "frutas_verduras"),
    ("fresa", "fruta", "kg", "6.000", "3.000", "fresa", "0.015", "kg", "1000", "frutas_verduras"),
    ("naranja", "fruta", "kg", "12.000", "5.000", "naranja", "0.200", "kg", "1000", "frutas_verduras"),
    ("piña", "fruta", "kg", "5.500", "3.000", None, None, "kg", "1000", "frutas_verduras"),
    ("plátano", "fruta", "kg", "7.000", "3.000", "plátano", "0.120", "kg", "1000", "frutas_verduras"),
    ("leche", "lácteo", "ml", "8000", "3000", "vaso", "50", "Caja/Litro", "1000", "liquidos"),
    ("algarrobina", "abarrote", "ml", "500", "1000", "cucharada", "15", "Botella 500ml", "500", "liquidos"),
    ("agua", "abarrote", "ml", "20000", "5000", "vaso", "50", "Bidón 20L", "20000", "liquidos"),
    ("azúcar", "abarrote", "kg", "4.000", "2.000", "cucharada", "0.008", "Saco 10kg", "10000", "solidos"),
    ("harina", "abarrote", "kg", "2.000", "5.000", None, None, "Saco 5kg", "5000", "solidos"),
    ("pollo", "abarrote", "kg", "6.000", "3.000", None, None, "kg", "1000", "solidos"),
    ("chorizo", "abarrote", "unidad", "4", "6", "unidad", "1", "Paquete 12u", "12", "unidades"),
    ("pan", "abarrote", "unidad", "30", "15", "unidad", "1", "Ciento", "1", "unidades"),
    ("gelatina", "abarrote", "unidad", "25", "10", "unidad", "1", "unidad", "1", "unidades"),
    ("huevo", "abarrote", "unidad", "30", "24", "unidad", "1", "Jaba 30u", "30", "unidades"),
    ("milanesa de pollo", "carne", "unidad", "10", "10", "unidad", "1", "Bandeja 10u", "10", "unidades"),
]

# 25.5 Grupos de opciones
OPTION_GROUPS = ["tamaño", "fruta", "base", "endulzante", "tipo", "porción", "relleno"]

# 25.6 Opciones: (group, name, extra_cost, linked_ingredient)
OPTIONS = [
    ("tamaño", "personal", "0.00", None),
    ("tamaño", "pareja", "1.00", None),
    ("tamaño", "familiar", "2.00", None),
    ("fruta", "papaya", "0.00", "papaya"),
    ("fruta", "fresa", "0.50", "fresa"),
    ("fruta", "naranja", "0.00", "naranja"),
    ("fruta", "piña", "0.50", "piña"),
    ("fruta", "plátano", "0.00", "plátano"),
    ("base", "agua", "0.00", "agua"),
    ("base", "leche", "2.00", "leche"),
    ("endulzante", "sin azúcar", "0.00", None),
    ("endulzante", "azúcar", "0.00", "azúcar"),
    ("tipo", "pollo", "0.00", "pollo"),
    ("tipo", "chorizo", "1.00", "chorizo"),
    ("porción", "regular", "0.00", None),
    ("porción", "grande", "2.00", None),
    ("relleno", "sin relleno", "0.00", None),
    ("relleno", "manjar", "1.00", None),
]

# 25.7 Productos demo: (name, category, base_price)
PRODUCTS = [
    ("jugo clásico", "jugos", "8.00"),
    ("jugo especial", "jugos", "10.00"),
    ("jugo surtido", "jugos", "11.00"),
    ("empanada", "empanadas", "4.00"),
    ("queque", "queques", "4.50"),
    ("pan", "panes", "5.00"),
    ("gelatina", "gelatinas", "3.50"),
]

# 25.8 Relación producto-grupos
PRODUCT_GROUPS = {
    "jugo clásico": ["tamaño", "fruta", "base", "endulzante"],
    "jugo especial": ["tamaño", "fruta", "base", "endulzante"],
    "jugo surtido": ["tamaño", "fruta", "base", "endulzante"],
    "empanada": ["tipo"],
    "queque": ["porción", "relleno"],
    "pan": ["tipo"],
    "gelatina": ["porción"],
}

# 24.1 Recetas para descuento automático de inventario.
# (product, option, ingredient, quantity_per_unit, size_multiplier)
# size_multiplier escala la cantidad según el tamaño elegido (personal/pareja/familiar).
RECIPES = [
    # jugo clásico: una fruta
    ("jugo clásico", "papaya", "papaya", "0.180", {"personal": 0.8, "pareja": 1.0, "familiar": 1.25}),
    ("jugo clásico", "fresa", "fresa", "0.150", {"personal": 0.8, "pareja": 1.0, "familiar": 1.25}),
    ("jugo clásico", "naranja", "naranja", "0.200", {"personal": 0.8, "pareja": 1.0, "familiar": 1.25}),
    ("jugo clásico", "piña", "piña", "0.180", {"personal": 0.8, "pareja": 1.0, "familiar": 1.25}),
    ("jugo clásico", "plátano", "plátano", "0.150", {"personal": 0.8, "pareja": 1.0, "familiar": 1.25}),
    ("jugo clásico", "agua", "agua", "150", None),
    ("jugo clásico", "leche", "leche", "150", None),
    ("jugo clásico", "azúcar", "azúcar", "0.008", None),
    # jugo especial
    ("jugo especial", "papaya", "papaya", "0.220", {"personal": 0.8, "pareja": 1.0, "familiar": 1.25}),
    ("jugo especial", "fresa", "fresa", "0.180", {"personal": 0.8, "pareja": 1.0, "familiar": 1.25}),
    ("jugo especial", "naranja", "naranja", "0.240", {"personal": 0.8, "pareja": 1.0, "familiar": 1.25}),
    ("jugo especial", "piña", "piña", "0.220", {"personal": 0.8, "pareja": 1.0, "familiar": 1.25}),
    ("jugo especial", "plátano", "plátano", "0.180", {"personal": 0.8, "pareja": 1.0, "familiar": 1.25}),
    ("jugo especial", "agua", "agua", "180", None),
    ("jugo especial", "leche", "leche", "180", None),
    ("jugo especial", "azúcar", "azúcar", "0.010", None),
    # jugo surtido: base siempre, sin azúcar por defecto
    ("jugo surtido", "agua", "agua", "200", None),
    ("jugo surtido", "leche", "leche", "200", None),
    # empanada
    ("empanada", "pollo", "pollo", "0.090", None),
    ("empanada", "chorizo", "chorizo", "1", None),
    ("empanada", "harina", "harina", "0.080", None),
    # queque
    ("queque", "harina", "harina", "0.060", None),
    ("queque", "azúcar", "azúcar", "0.030", None),
    # pan
    ("pan", "pollo", "pollo", "0.070", None),
    ("pan", "chorizo", "chorizo", "1", None),
    ("pan", "harina", "harina", "0.090", None),
    # gelatina
    ("gelatina", "gelatina", "gelatina", "1", None),
    ("gelatina", "azúcar", "azúcar", "0.015", None),
]

# Renombrado de tamaños antiguos a los nombres pedidos por la dueña.
SIZE_RENAMES = {"chico": "personal", "mediano": "pareja", "grande": "familiar"}


def _normalize_existing(db) -> None:
    """Estandariza los nombres ya existentes en la BD (minúsculas) y renombra
    los tamaños antiguos. Idempotente: puede correr tantas veces como sea.
    """
    for group in db.scalars(select(OptionGroupModel)):
        group.name = " ".join(group.name.strip().lower().split())
    db.flush()

    for option in db.scalars(select(OptionModel)):
        name = " ".join(option.name.strip().lower().split())
        group = db.get(OptionGroupModel, option.group_id) if option.group_id else None
        if group is not None and group.name == "tamaño":
            name = SIZE_RENAMES.get(name, name)
        option.name = name

    for category in db.scalars(select(CategoryModel)):
        category.name = " ".join(category.name.strip().lower().split())

    # Backfill de unidad natural + metadatos de inventario profundo.
    defaults = {
        name: {
            "unit_name": unit_name,
            "unit_weight": unit_weight,
            "purchase_unit": purchase_unit,
            "conversion_factor": conversion_factor,
            "consumption_unit": unit,
            "behavioral_type": behavioral_type,
        }
        for name, _c, unit, _s, _m, unit_name, unit_weight, purchase_unit, conversion_factor, behavioral_type in INGREDIENTS
    }
    for ingredient in db.scalars(select(IngredientModel)):
        ingredient.name = " ".join(ingredient.name.strip().lower().split())
        ingredient.category = " ".join(ingredient.category.strip().lower().split())
        ingredient.base_unit = " ".join(ingredient.base_unit.strip().lower().split())
        if ingredient.unit_name:
            ingredient.unit_name = " ".join(ingredient.unit_name.strip().lower().split())
        default = defaults.get(ingredient.name)
        # Backfill de la unidad natural para insumos ya existentes (una vez).
        if default is not None and ingredient.unit_weight is None and default["unit_weight"] is not None:
            ingredient.unit_name = default["unit_name"]
            ingredient.unit_weight = Decimal(default["unit_weight"])
        # Los insumos demo usan SIEMPRE el empaque y factor del seed (el seed es
        # la fuente de verdad), de modo que un backfill genérico no los opaque.
        if default is not None:
            ingredient.consumption_unit = default["consumption_unit"]
            ingredient.conversion_factor = Decimal(default["conversion_factor"])
            ingredient.purchase_unit = default["purchase_unit"]
            ingredient.behavioral_type = default["behavioral_type"]
        else:
            if ingredient.consumption_unit is None:
                ingredient.consumption_unit = ingredient.base_unit
            if ingredient.conversion_factor is None:
                ingredient.conversion_factor = Decimal("1")
            if ingredient.purchase_unit is None:
                ingredient.purchase_unit = ingredient.base_unit
            if ingredient.behavioral_type is None:
                from app.domain.services.inventory import effective_behavioral_type

                ingredient.behavioral_type = effective_behavioral_type(
                    ingredient.category, ingredient.base_unit, None
                )

    for product in db.scalars(select(ProductModel)):
        product.name = " ".join(product.name.strip().lower().split())
    db.flush()

    # Re-mapear las claves de size_multiplier a los nuevos nombres de tamaño.
    for component in db.scalars(select(RecipeComponentModel)):
        if component.size_multiplier:
            remapped = {}
            for key, value in component.size_multiplier.items():
                normalized = " ".join(str(key).strip().lower().split())
                remapped[SIZE_RENAMES.get(normalized, normalized)] = value
            component.size_multiplier = remapped
    db.flush()


def _dedupe_recipes(db) -> None:
    """Elimina filas de receta duplicadas (mismo producto+insumo) que quedaron
    sin enlace a opción cuando ya existe otra fila con el enlace correcto."""
    from collections import defaultdict

    grouped: dict[tuple[int, int], list] = defaultdict(list)
    for row in db.scalars(select(RecipeComponentModel)):
        grouped[(row.product_id, row.ingredient_id)].append(row)
    for _key, rows in grouped.items():
        if len(rows) > 1 and any(r.option_id is not None for r in rows):
            for row in rows:
                if row.option_id is None:
                    db.delete(row)
    db.flush()


def get_or_create(db, model, defaults=None, **kwargs):
    instance = db.scalars(select(model).filter_by(**kwargs)).first()
    if instance is None:
        instance = model(**{**kwargs, **(defaults or {})})
        db.add(instance)
        db.flush()
        logger.info("seed created %s %s", model.__tablename__, kwargs)
    return instance


def run_seed() -> dict:
    logger.info("=== SEED DEMO TÍA JULIA: datos de demostración, no inventario real ===")
    with SessionLocal() as db:
        # Estandariza nombres existentes (minúsculas) y renombra tamaños antiguos
        _normalize_existing(db)
        _dedupe_recipes(db)

        for name in USERS:
            get_or_create(db, UserModel, name=name, defaults={"is_active": True})

        for name in PAYMENT_METHODS:
            get_or_create(db, PaymentMethodModel, name=name)

        categories = {}
        for name, multi in CATEGORIES:
            categories[name] = get_or_create(db, CategoryModel, name=name, defaults={"allows_multiple_ingredients": multi})

        ingredients = {}
        for (
            name,
            cat,
            unit,
            stock,
            minimum,
            unit_name,
            unit_weight,
            purchase_unit,
            conversion_factor,
            behavioral_type,
        ) in INGREDIENTS:
            ingredients[name] = get_or_create(
                db,
                IngredientModel,
                name=name,
                defaults={
                    "category": cat,
                    "base_unit": unit,
                    "purchase_unit": purchase_unit,
                    "consumption_unit": unit,
                    "conversion_factor": Decimal(conversion_factor),
                    "behavioral_type": behavioral_type,
                    "unit_name": unit_name,
                    "unit_weight": Decimal(unit_weight) if unit_weight is not None else None,
                    "current_stock": Decimal(stock),
                    "min_stock_alert": Decimal(minimum),
                },
            )

        groups = {}
        for name in OPTION_GROUPS:
            groups[name] = get_or_create(db, OptionGroupModel, name=name)

        options = {}
        for group_name, name, extra, linked in OPTIONS:
            option = db.scalars(
                select(OptionModel).filter_by(group_id=groups[group_name].id, name=name)
            ).first()
            if option is None:
                option = OptionModel(
                    group_id=groups[group_name].id,
                    name=name,
                    extra_cost=Decimal(extra),
                    linked_ingredient_id=ingredients[linked].id if linked else None,
                )
                db.add(option)
                db.flush()
            options[(group_name, name)] = option

        products = {}
        for name, cat, price in PRODUCTS:
            product = get_or_create(db, ProductModel, name=name, defaults={"category_id": categories[cat].id, "base_price": Decimal(price)})
            products[name] = product

        # 25.8 product-option groups
        for product_name, group_names in PRODUCT_GROUPS.items():
            product = products[product_name]
            for group_name in group_names:
                exists = db.scalars(
                    select(ProductOptionGroupModel).filter_by(product_id=product.id, group_id=groups[group_name].id)
                ).first()
                if exists is None:
                    db.add(ProductOptionGroupModel(product_id=product.id, group_id=groups[group_name].id))

        # 24.1 recipe components
        for product_name, option_name, ingredient_name, per_unit, multiplier in RECIPES:
            product = products[product_name]
            option = (
                options.get(("fruta", option_name))
                or options.get(("base", option_name))
                or options.get(("tipo", option_name))
                or options.get(("endulzante", option_name))
            )
            ingredient = ingredients[ingredient_name]
            exists = db.scalars(
                select(RecipeComponentModel).filter_by(
                    product_id=product.id,
                    option_id=option.id if option else None,
                    ingredient_id=ingredient.id,
                )
            ).first()
            if exists is None:
                db.add(
                    RecipeComponentModel(
                        product_id=product.id,
                        option_id=option.id if option else None,
                        ingredient_id=ingredient.id,
                        quantity_per_unit=Decimal(per_unit),
                        size_multiplier=multiplier,
                    )
                )

        db.commit()
        counts = {
            "users": db.scalars(select(func_count(UserModel))).one(),
            "products": db.scalars(select(func_count(ProductModel))).one(),
            "ingredients": db.scalars(select(func_count(IngredientModel))).one(),
            "options": db.scalars(select(func_count(OptionModel))).one(),
            "recipes": db.scalars(select(func_count(RecipeComponentModel))).one(),
        }
        logger.info("seed summary: %s", counts)
        return counts


def func_count(model):
    from sqlalchemy import func

    return func.count(model.id)


if __name__ == "__main__":
    summary = run_seed()
    print("Seed completado:", summary)
