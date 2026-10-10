"""Fixtures de pytest: base de datos de pruebas aislada en PostgreSQL."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, get_db

TEST_DB_URL = os.environ.get(
    "TIAJULIA_TEST_DATABASE_URL",
    "postgresql+psycopg://postgres:privva12345@localhost:5432/tiajulia_test",
)

engine = create_engine(TEST_DB_URL, future=True)
TestingSession = sessionmaker(bind=engine, future=True)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.infrastructure.db import models  # noqa: F401,E402 - register tables


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create a dedicated test database once per test session."""
    admin_engine = create_engine(
        "postgresql+psycopg://postgres:privva12345@localhost:5432/postgres",
        isolation_level="AUTOCOMMIT",
    )
    with admin_engine.connect() as conn:
        conn.execute(text("DROP DATABASE IF EXISTS tiajulia_test WITH (FORCE)"))
        conn.execute(text("CREATE DATABASE tiajulia_test"))
    admin_engine.dispose()

    Base.metadata.create_all(engine)
    yield
    engine.dispose()


@pytest.fixture
def db_session():
    """Transaction-scoped session: rollback after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSession(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    """TestClient wired to the test session."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def seed_catalog(db_session):
    """Minimal catalog for order flow tests."""
    from decimal import Decimal
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

    user = UserModel(name="Olga", is_active=True)
    cash = PaymentMethodModel(name="Efectivo")
    yape = PaymentMethodModel(name="Yape")
    db_session.add_all([user, cash, yape])
    db_session.flush()

    category = CategoryModel(name="Jugos", allows_multiple_ingredients=True)
    db_session.add(category)
    db_session.flush()

    papaya = IngredientModel(
        name="Papaya", category="Fruta", base_unit="kg",
        current_stock=Decimal("10"), min_stock_alert=Decimal("5"),
    )
    agua = IngredientModel(
        name="Agua", category="Abarrote", base_unit="ml",
        current_stock=Decimal("20000"), min_stock_alert=Decimal("5000"),
    )
    db_session.add_all([papaya, agua])
    db_session.flush()

    size_group = OptionGroupModel(name="Tamaño")
    fruit_group = OptionGroupModel(name="Fruta")
    base_group = OptionGroupModel(name="Base")
    db_session.add_all([size_group, fruit_group, base_group])
    db_session.flush()

    grande = OptionModel(group_id=size_group.id, name="Grande", extra_cost=Decimal("2.00"))
    papaya_opt = OptionModel(group_id=fruit_group.id, name="Papaya", extra_cost=Decimal("0"), linked_ingredient_id=papaya.id)
    agua_opt = OptionModel(group_id=base_group.id, name="Agua", extra_cost=Decimal("0"), linked_ingredient_id=agua.id)
    db_session.add_all([grande, papaya_opt, agua_opt])
    db_session.flush()

    product = ProductModel(name="Jugo Especial", category_id=category.id, base_price=Decimal("10.00"))
    db_session.add(product)
    db_session.flush()
    db_session.add_all(
        [
            ProductOptionGroupModel(product_id=product.id, group_id=size_group.id),
            ProductOptionGroupModel(product_id=product.id, group_id=fruit_group.id),
            ProductOptionGroupModel(product_id=product.id, group_id=base_group.id),
            # recipe: 0.20 kg papaya per unit; water fixed 180 ml
            RecipeComponentModel(
                product_id=product.id, option_id=papaya_opt.id, ingredient_id=papaya.id,
                quantity_per_unit=Decimal("0.200"), size_multiplier={"Chico": 0.8, "Mediano": 1.0, "Grande": 1.25},
            ),
            RecipeComponentModel(
                product_id=product.id, option_id=agua_opt.id, ingredient_id=agua.id,
                quantity_per_unit=Decimal("180"),
            ),
        ]
    )
    db_session.flush()

    return {
        "user_id": user.id,
        "cash_id": cash.id,
        "yape_id": yape.id,
        "product_id": product.id,
        "size_grande_id": grande.id,
        "papaya_option_id": papaya_opt.id,
        "agua_option_id": agua_opt.id,
        "papaya_ingredient_id": papaya.id,
        "agua_ingredient_id": agua.id,
    }
