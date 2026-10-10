"""SQLAlchemy models for all business tables (sección 23) plus the two
technical migrations required by section 24: recipe_components and sync_requests.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    orders: Mapped[list["OrderModel"]] = relationship(back_populates="user")


class PaymentMethodModel(Base):
    __tablename__ = "payment_methods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)


class CategoryModel(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    allows_multiple_ingredients: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    products: Mapped[list["ProductModel"]] = relationship(back_populates="category")


class IngredientModel(Base):
    __tablename__ = "ingredients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    base_unit: Mapped[str] = mapped_column(String(20), nullable=False)
    # Modelo de inventario profundo (sección 4).
    # purchase_unit describe el empaque con que se compra ("Caja/Litro", "Saco 5kg").
    purchase_unit: Mapped[str | None] = mapped_column(String(20))
    # consumption_unit es la unidad mínima en la que se descuenta y se muestra
    # el stock (ml, g, unidad). Si es NULL se usa base_unit.
    consumption_unit: Mapped[str | None] = mapped_column(String(20))
    # Cuántas unidades mínimas de consumo rinde una compra (1 caja = 1000 ml).
    conversion_factor: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    # Comportamiento que define los botones táctiles: liquidos | solidos |
    # unidades | frutas_verduras.
    behavioral_type: Mapped[str | None] = mapped_column(String(30))
    # Unidad natural contable: "fresa", "vaso", "cucharada"… (sección 17.4).
    unit_name: Mapped[str | None] = mapped_column(String(50))
    # Cuánto de la unidad base pesa/contiene una unidad natural
    # (p. ej. fresa -> 0.015 kg, vaso -> 50 ml). Permite contar en vez de pesar.
    unit_weight: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    current_stock: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=Decimal("0"), nullable=False)
    min_stock_alert: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=Decimal("5"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    movements: Mapped[list["InventoryMovementModel"]] = relationship(back_populates="ingredient")


class ProductModel(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    category: Mapped[CategoryModel | None] = relationship(back_populates="products")
    option_groups: Mapped[list["OptionGroupModel"]] = relationship(
        secondary="product_option_groups", back_populates="products"
    )
    details: Mapped[list["OrderDetailModel"]] = relationship(back_populates="product")
    recipe_components: Mapped[list["RecipeComponentModel"]] = relationship(back_populates="product")


class OptionGroupModel(Base):
    __tablename__ = "option_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)

    options: Mapped[list["OptionModel"]] = relationship(back_populates="group")
    products: Mapped[list[ProductModel]] = relationship(
        secondary="product_option_groups", back_populates="option_groups"
    )


class OptionModel(Base):
    __tablename__ = "options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("option_groups.id"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    extra_cost: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), nullable=False)
    linked_ingredient_id: Mapped[int | None] = mapped_column(ForeignKey("ingredients.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    group: Mapped[OptionGroupModel | None] = relationship(back_populates="options")
    linked_ingredient: Mapped[IngredientModel | None] = relationship()


class ProductOptionGroupModel(Base):
    __tablename__ = "product_option_groups"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("option_groups.id"), primary_key=True)


class OrderModel(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            "order_type IN ('mesa', 'delivery', 'mostrador')",
            name="ck_orders_order_type",
        ),
        CheckConstraint(
            "status IN ('en_preparacion', 'pagado', 'cancelado')",
            name="ck_orders_status",
        ),
        CheckConstraint(
            "sync_status IN ('pending', 'synced')",
            name="ck_orders_sync_status",
        ),
        Index("idx_orders_created_at", "created_at"),
        Index("idx_orders_status_created_at", "status", "created_at"),
        Index("idx_orders_payment_method", "payment_method_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    order_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="en_preparacion", nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(100))
    table_number: Mapped[str | None] = mapped_column(String(10))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), nullable=False)
    payment_method_id: Mapped[int | None] = mapped_column(ForeignKey("payment_methods.id"))
    sync_status: Mapped[str] = mapped_column(String(20), default="synced", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[UserModel | None] = relationship(back_populates="orders")
    payment_method: Mapped[PaymentMethodModel | None] = relationship()
    details: Mapped[list["OrderDetailModel"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderDetailModel.id"
    )


class OrderDetailModel(Base):
    __tablename__ = "order_details"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_details_quantity_positive"),
        Index("idx_order_details_order_id", "order_id"),
        Index("idx_order_details_product_id", "product_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    assembly_config: Mapped[dict | None] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(String(255))

    order: Mapped[OrderModel] = relationship(back_populates="details")
    product: Mapped[ProductModel | None] = relationship(back_populates="details")


class InventoryMovementModel(Base):
    __tablename__ = "inventory_movements"
    __table_args__ = (
        CheckConstraint(
            "movement_type IN ('entrada', 'salida', 'ajuste')",
            name="ck_inventory_movement_type",
        ),
        Index("idx_inventory_movements_ingredient_date", "ingredient_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ingredient_id: Mapped[int | None] = mapped_column(ForeignKey("ingredients.id"))
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    reference_id: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    ingredient: Mapped[IngredientModel | None] = relationship(back_populates="movements")


class DemandForecastModel(Base):
    __tablename__ = "demand_forecasts"
    __table_args__ = (
        UniqueConstraint("forecast_date", "product_id", name="uq_forecast_date_product"),
        Index("idx_forecasts_product_date", "product_id", "forecast_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    forecast_date: Mapped[object] = mapped_column(Date, nullable=False)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    predicted_quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    confidence_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    model_version: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    product: Mapped[ProductModel | None] = relationship()


class SalesAnomalyModel(Base):
    __tablename__ = "sales_anomalies"
    __table_args__ = (Index("idx_anomalies_date", "detected_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    detected_date: Mapped[object] = mapped_column(Date, nullable=False)
    anomaly_type: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text)
    expected_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    actual_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    is_reviewed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PurchaseRecommendationModel(Base):
    __tablename__ = "purchase_recommendations"
    __table_args__ = (Index("idx_purchase_recommendations_status", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ingredient_id: Mapped[int | None] = mapped_column(ForeignKey("ingredients.id"))
    recommended_quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pendiente", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    ingredient: Mapped[IngredientModel | None] = relationship()


class RecipeComponentModel(Base):
    """Technical table (sección 24.1): how much of an ingredient each
    product/option consumes per unit sold, enabling real stock deduction."""

    __tablename__ = "recipe_components"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    option_id: Mapped[int | None] = mapped_column(ForeignKey("options.id", ondelete="CASCADE"))
    # Tamaño (personal/pareja/familiar) al que aplica esta fila. Permite definir
    # cantidades distintas por tamaño sin ambigüedad.
    size_option_id: Mapped[int | None] = mapped_column(ForeignKey("options.id", ondelete="CASCADE"))
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredients.id"), nullable=False)
    quantity_per_unit: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    size_multiplier: Mapped[dict | None] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    product: Mapped[ProductModel] = relationship(back_populates="recipe_components")
    # Dos FK apuntan a options (disparador y tamaño): hay que desambiguar.
    option: Mapped[OptionModel | None] = relationship(foreign_keys=[option_id])
    size_option: Mapped[OptionModel | None] = relationship(foreign_keys=[size_option_id])
    ingredient: Mapped[IngredientModel] = relationship()


class SyncRequestModel(Base):
    """Technical table (sección 24.2): idempotency for offline sync."""

    __tablename__ = "sync_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


__all__ = [
    "UserModel",
    "PaymentMethodModel",
    "CategoryModel",
    "IngredientModel",
    "ProductModel",
    "OptionGroupModel",
    "OptionModel",
    "ProductOptionGroupModel",
    "OrderModel",
    "OrderDetailModel",
    "InventoryMovementModel",
    "DemandForecastModel",
    "SalesAnomalyModel",
    "PurchaseRecommendationModel",
    "RecipeComponentModel",
    "SyncRequestModel",
]
