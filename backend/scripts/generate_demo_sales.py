"""Ventas históricas demo para ML (sección 25.9).

Genera 12 semanas reproducibles con random.seed(42):
- Lunes y martes: demanda baja. Miércoles: media. Jueves: sube.
- Viernes, sábado y domingo: demanda alta.
- Pico habitual entre 10:00 y 13:00.
- Mezcla de pagos aproximada (no es una regla de negocio real).
- Inserta 2-3 anomalías controladas para probar Isolation Forest.

Los datos demo se marcan en logs y nunca deben mezclarse con producción.
"""

import random
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import logger
from app.infrastructure.db.models import (
    CategoryModel,
    OptionGroupModel,
    OptionModel,
    OrderDetailModel,
    OrderModel,
    PaymentMethodModel,
    ProductModel,
    SalesAnomalyModel,
    UserModel,
)

LIMA = ZoneInfo(settings.timezone)

# Demand profile per weekday (0=Monday ... 6=Sunday)
DOW_ORDERS = {
    0: (18, 26),  # Monday: low
    1: (17, 25),  # Tuesday: low
    2: (28, 38),  # Wednesday: medium
    3: (38, 52),  # Thursday: rising
    4: (58, 78),  # Friday: high
    5: (70, 95),  # Saturday: high
    6: (60, 85),  # Sunday: high
}

HOUR_WEIGHTS = {
    9: 4,
    10: 12,
    11: 14,
    12: 15,
    13: 8,
    14: 5,
    15: 4,
    16: 4,
    17: 4,
    18: 5,
    19: 4,
    20: 2,
}

# Controlled anomalies: (days_ago, scale) — a weak Sunday and a strong Saturday
ANOMALIES = [
    (12, 0.45),  # Sunday, 45% of normal demand
    (26, 1.85),  # Saturday, almost double demand
    (54, 0.50),  # Sunday dip
]


def pick_hour(rng: random.Random) -> int:
    hours = list(HOUR_WEIGHTS.keys())
    weights = list(HOUR_WEIGHTS.values())
    return rng.choices(hours, weights=weights, k=1)[0]


def pick_product(rng: random.Random, products) -> ProductModel:
    """Weighted product choice: juices dominate (it is a juguería)."""
    weights = [30, 28, 12, 12, 8, 6, 4] if len(products) == 7 else [1] * len(products)
    return rng.choices(products, weights=weights, k=1)[0]


def build_items(rng: random.Random, products, options_by_group, jugo_category_id) -> list[dict]:
    """Random but plausible assembly for one order (1-3 lines)."""
    lines = []
    for _ in range(rng.randint(1, 3)):
        product = pick_product(rng, products)
        option_ids = []
        if product.category_id == jugo_category_id:
            sizes = options_by_group["Tamaño"]
            size = rng.choices(sizes, weights=[20, 40, 40], k=1)[0]
            option_ids.append(size["id"])
            fruits = options_by_group["Fruta"]
            chosen = rng.sample(fruits, k=rng.randint(1, 2))
            option_ids.extend(f["id"] for f in chosen)
            base = rng.choices(options_by_group["Base"], weights=[60, 40], k=1)[0]
            option_ids.append(base["id"])
            option_ids.append(rng.choice(options_by_group["Endulzante"])["id"])
        elif product.name in ("Empanada", "Pan"):
            option_ids.append(rng.choice(options_by_group["Tipo"])["id"])
        elif product.name == "Queque":
            option_ids.append(rng.choice(options_by_group["Porción"])["id"])
            if rng.random() < 0.4:
                option_ids.append(rng.choice(options_by_group["Relleno"])["id"])
        elif product.name == "Gelatina":
            option_ids.append(rng.choice(options_by_group["Porción"])["id"])
        quantity = rng.choices([1, 2, 3], weights=[70, 22, 8], k=1)[0]
        lines.append({"product": product, "quantity": quantity, "option_ids": option_ids})
    return lines


def price_line(product, option_ids, options_by_id) -> Decimal:
    total = Decimal(product.base_price)
    for option_id in option_ids:
        total += Decimal(options_by_id[option_id].extra_cost)
    return total.quantize(Decimal("0.01"))


def generate_demo_sales(weeks: int = 12) -> dict:
    rng = random.Random(42)  # reproducible (25.9)
    logger.info("=== GENERANDO VENTAS DEMO (%d semanas, seed=42): solo datos de demostración ===", weeks)
    with SessionLocal() as db:
        existing_demo = db.scalar(select(OrderModel.id).limit(1))
        if existing_demo is not None:
            logger.info("Ya existen órdenes; no se generan datos demo duplicados.")
            return {"skipped": True, "orders": 0}

        users = list(db.scalars(select(UserModel)).all())
        products = list(db.scalars(select(ProductModel).where(ProductModel.is_active.is_(True))).all())
        methods = {m.name: m for m in db.scalars(select(PaymentMethodModel)).all()}
        options = list(db.scalars(select(OptionModel)).all())
        options_by_id = {o.id: o for o in options}
        group_names = {g.id: g.name for g in db.scalars(select(OptionGroupModel)).all()}
        options_by_group: dict[str, list] = {}
        for option in options:
            name = group_names.get(option.group_id, "")
            options_by_group.setdefault(name, []).append({"id": option.id, "name": option.name})
        jugo_category = db.scalars(select(CategoryModel).where(CategoryModel.name == "Jugos")).first()

        today = datetime.now(LIMA).date()
        last_sunday = today - timedelta(days=(today.weekday() + 1) % 7)
        start = last_sunday - timedelta(weeks=weeks - 1)
        total_orders = 0

        for week_offset in range(weeks):
            for dow in range(7):
                day = start + timedelta(days=week_offset * 7 + dow)
                if day > today:
                    continue
                low, high = DOW_ORDERS[dow]
                n_orders = rng.randint(low, high)
                days_ago = (today - day).days
                for anomaly_days, scale in ANOMALIES:
                    if days_ago == anomaly_days:
                        n_orders = max(3, int(n_orders * scale))
                for _ in range(n_orders):
                    hour = pick_hour(rng)
                    minute = rng.randint(0, 59)
                    created = datetime(day.year, day.month, day.day, hour, minute, tzinfo=LIMA)
                    user = rng.choice(users)
                    lines = build_items(rng, products, options_by_group, jugo_category.id if jugo_category else 1)
                    pay_now = rng.random() < 0.92
                    method = methods["Yape"] if rng.random() < 0.45 else methods["Efectivo"]
                    order = OrderModel(
                        user_id=user.id,
                        order_type=rng.choices(["mostrador", "mesa", "delivery"], weights=[55, 30, 15], k=1)[0],
                        status="en_preparacion",
                        customer_name=None,
                        table_number=f"Mesa {rng.randint(1, 8)}" if rng.random() < 0.3 else None,
                        sync_status="synced",
                        created_at=created,
                        updated_at=created,
                    )
                    db.add(order)
                    db.flush()
                    total_amount = Decimal("0")
                    for line in lines:
                        unit_price = price_line(line["product"], line["option_ids"], options_by_id)
                        subtotal = (unit_price * line["quantity"]).quantize(Decimal("0.01"))
                        config: dict = {"groups": {}}
                        for option_id in line["option_ids"]:
                            option = options_by_id[option_id]
                            group_name = group_names.get(option.group_id, "")
                            entry = config["groups"].setdefault(group_name, {"mode": "single", "options": []})
                            if group_name == "Fruta":
                                entry["mode"] = "multiple"
                            entry["options"].append(
                                {"id": option.id, "name": option.name, "extra_cost": float(option.extra_cost)}
                            )
                        db.add(
                            OrderDetailModel(
                                order_id=order.id,
                                product_id=line["product"].id,
                                quantity=line["quantity"],
                                unit_price=unit_price,
                                subtotal=subtotal,
                                assembly_config=config,
                            )
                        )
                        total_amount += subtotal
                    order.total_amount = total_amount.quantize(Decimal("0.01"))
                    if pay_now:
                        order.status = "pagado"
                        order.payment_method_id = method.id
                    total_orders += 1

        # Controlled anomaly reference row for Isolation Forest validation (31)
        if db.scalars(select(SalesAnomalyModel)).first() is None:
            anomaly_day = today - timedelta(days=12)
            db.add(
                SalesAnomalyModel(
                    detected_date=anomaly_day,
                    anomaly_type="caida_venta",
                    description="Ventas 25% menores de lo esperado para un domingo.",
                    expected_value=Decimal("1600.00"),
                    actual_value=Decimal("1200.00"),
                    is_reviewed=False,
                )
            )

        db.commit()
        logger.info("demo sales generated: %d orders", total_orders)
        return {"skipped": False, "orders": total_orders}


if __name__ == "__main__":
    result = generate_demo_sales()
    print("Ventas demo:", result)
