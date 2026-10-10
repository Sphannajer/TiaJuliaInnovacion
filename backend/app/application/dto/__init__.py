"""Application DTOs (Pydantic v2) for API contracts."""

import re
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Validación estricta (sección 5.A): nombres solo con letras y espacios.
TEXT_ONLY_RE = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$")
BEHAVIORAL_TYPES = ("liquidos", "solidos", "unidades", "frutas_verduras")


def strip_text(value: str) -> str:
    """Elimina espacios duplicados u huérfanos. Nunca deja la cadena vacía."""
    return " ".join(value.strip().split())


def clean_name(value: str) -> str:
    cleaned = strip_text(value)
    if not TEXT_ONLY_RE.match(cleaned):
        raise ValueError("Usa solo letras y espacios para el nombre")
    return cleaned


class UserDTO(BaseModel):
    id: int
    name: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class CategoryDTO(BaseModel):
    id: int
    name: str
    allows_multiple_ingredients: bool

    model_config = ConfigDict(from_attributes=True)


class OptionDTO(BaseModel):
    id: int
    group_id: int | None = None
    name: str
    extra_cost: Decimal
    linked_ingredient_id: int | None = None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class OptionGroupDTO(BaseModel):
    id: int
    name: str
    options: list[OptionDTO] = []

    model_config = ConfigDict(from_attributes=True)


class RecipeComponentDTO(BaseModel):
    """Receta de insumo para un producto (sección 24.1).

    option_id enlaza el consumo a una opción elegida (fruta, base o un tamaño);
    si es None, el insumo siempre se consume. Se usa para que cada producto
    descuente sus insumos al venderse.
    """
    ingredient_id: int
    option_id: int | None = None
    size_option_id: int | None = None
    quantity_per_unit: Decimal = Field(ge=Decimal("0"), max_digits=10, decimal_places=3)
    size_multiplier: dict | None = None
    is_active: bool = True
    id: int | None = None
    product_id: int | None = None
    ingredient_name: str | None = None
    ingredient_unit: str | None = None
    option_name: str | None = None


class ProductDTO(BaseModel):
    id: int
    category_id: int | None
    name: str
    base_price: Decimal
    is_active: bool
    category_name: str | None = None
    option_group_ids: list[int] = []
    has_options: bool = False
    has_recipe: bool = False
    recipe_components: list[RecipeComponentDTO] = []


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    category_id: int
    base_price: Decimal = Field(ge=Decimal("0"))
    is_active: bool = True
    option_group_ids: list[int] = []
    recipe_components: list[RecipeComponentDTO] = []

    @field_validator("name")
    @classmethod
    def _name_only_letters(cls, value: str) -> str:
        return clean_name(value)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    category_id: int | None = None
    base_price: Decimal | None = Field(default=None, ge=Decimal("0"))
    is_active: bool | None = None
    option_group_ids: list[int] | None = None
    recipe_components: list[RecipeComponentDTO] | None = None

    @field_validator("name")
    @classmethod
    def _name_only_letters(cls, value: str | None) -> str | None:
        return clean_name(value) if value is not None else None


class IngredientDTO(BaseModel):
    id: int
    name: str
    category: str
    base_unit: str
    purchase_unit: str | None = None
    consumption_unit: str | None = None
    conversion_factor: Decimal | None = None
    behavioral_type: str | None = None
    increments: list[dict] = []
    unit_name: str | None = None
    unit_weight: Decimal | None = None
    current_stock: Decimal
    min_stock_alert: Decimal
    # Último costo unitario de compra (sección 8): base para sugerir precios.
    last_unit_cost: Decimal | None = None
    updated_at: Any = None
    state: str = "BIEN"


class IngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=50)
    base_unit: str = Field(min_length=1, max_length=20)
    purchase_unit: str | None = Field(default=None, max_length=20)
    consumption_unit: str | None = Field(default=None, max_length=20)
    conversion_factor: Decimal | None = Field(default=None, gt=Decimal("0"))
    behavioral_type: Literal["liquidos", "solidos", "unidades", "frutas_verduras"] | None = None
    unit_name: str | None = Field(default=None, max_length=50)
    unit_weight: Decimal | None = Field(default=None, gt=Decimal("0"))
    current_stock: Decimal = Field(default=Decimal("0"), ge=Decimal("0"), max_digits=10, decimal_places=3)
    min_stock_alert: Decimal = Field(default=Decimal("0"), ge=Decimal("0"), max_digits=10, decimal_places=3)

    @field_validator("name")
    @classmethod
    def _name_only_letters(cls, value: str) -> str:
        return clean_name(value)


class IngredientUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=50)
    base_unit: str | None = Field(default=None, max_length=20)
    purchase_unit: str | None = Field(default=None, max_length=20)
    consumption_unit: str | None = Field(default=None, max_length=20)
    conversion_factor: Decimal | None = Field(default=None, gt=Decimal("0"))
    behavioral_type: Literal["liquidos", "solidos", "unidades", "frutas_verduras"] | None = None
    unit_name: str | None = Field(default=None, max_length=50)
    unit_weight: Decimal | None = Field(default=None, gt=Decimal("0"))
    min_stock_alert: Decimal | None = Field(default=None, ge=Decimal("0"), max_digits=10, decimal_places=3)

    @field_validator("name")
    @classmethod
    def _name_only_letters(cls, value: str | None) -> str | None:
        return clean_name(value) if value is not None else None


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=99)
    option_ids: list[int] = []
    notes: str | None = Field(default=None, max_length=255)


class OrderCreate(BaseModel):
    user_id: int
    order_type: Literal["mesa", "delivery", "mostrador"]
    customer_name: str | None = Field(default=None, max_length=100)
    table_number: str | None = Field(default=None, max_length=10)
    pay_now: bool = False
    payment_method_id: int | None = None
    items: list[OrderItemCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_type_fields(self):
        if self.order_type == "mesa" and not (self.table_number and self.table_number.strip()):
            raise ValueError("Mesa es obligatoria para órdenes de tipo mesa.")
        if self.pay_now and self.payment_method_id is None:
            raise ValueError("Debes indicar el medio de pago.")
        return self


class OrderDetailDTO(BaseModel):
    id: int
    product_id: int | None
    product_name: str | None = None
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    assembly_config: dict | None = None
    config_label: str = ""
    notes: str | None = None


class OrderDTO(BaseModel):
    id: int
    user_id: int | None
    user_name: str | None = None
    order_type: str
    status: str
    customer_name: str | None
    table_number: str | None
    total_amount: Decimal
    payment_method_id: int | None
    payment_method_name: str | None = None
    sync_status: str
    created_at: Any = None
    updated_at: Any = None
    details: list[OrderDetailDTO] = []


class OrderListDTO(BaseModel):
    items: list[OrderDTO]
    total: int
    limit: int
    offset: int


class PayOrderRequest(BaseModel):
    payment_method_id: int


class OrderDetailAdd(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=99)
    option_ids: list[int] = []
    notes: str | None = Field(default=None, max_length=255)


class OrderDetailUpdate(BaseModel):
    quantity: int | None = Field(default=None, ge=1, le=99)
    option_ids: list[int] | None = None
    notes: str | None = Field(default=None, max_length=255)


class InventoryEntryCreate(BaseModel):
    ingredient_id: int
    quantity: Decimal = Field(gt=Decimal("0"), max_digits=10, decimal_places=3)
    total_cost: Decimal | None = Field(default=None, ge=Decimal("0"))
    # Si se indica cuántas piezas/porciones llegaron, el backend deduce cuánto
    # pesa una unidad (unit_weight = quantity / unit_count) y lo guarda para no
    # volver a pesar ni contar a mano.
    unit_count: Decimal | None = Field(default=None, gt=Decimal("0"))
    unit_name: str | None = Field(default=None, max_length=50)


class InventoryAdjustmentCreate(BaseModel):
    ingredient_id: int
    new_stock: Decimal = Field(ge=Decimal("0"), max_digits=10, decimal_places=3)
    reason: str | None = Field(default=None, max_length=255)


class IngredientLowStockDTO(BaseModel):
    ingredient_id: int
    name: str
    category: str
    base_unit: str
    current_stock: Decimal
    min_stock_alert: Decimal
    state: str


class DashboardSummaryDTO(BaseModel):
    period: str
    sales_total: float
    orders_paid: int
    average_ticket: float
    payments: dict[str, float]


class DashboardSeriesPointDTO(BaseModel):
    date: str
    label: str
    total: float
    orders: int
    cash: float
    yape: float


class TopProductDTO(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    revenue: float


class DashboardAlertDTO(BaseModel):
    id: str
    type: str  # anomaly | stock | forecast
    icon: str  # "!" | "i"
    message: str
    action: str | None = None
    link: str | None = None


class StockAttentionItem(BaseModel):
    ingredient_id: int
    name: str
    base_unit: str
    current_stock: Decimal
    min_stock_alert: Decimal
    state: str


class DashboardResponse(BaseModel):
    summary: DashboardSummaryDTO
    stock_attention: list[StockAttentionItem]
    recommendation_preview: list[dict] | None = None
    recommendation_status: str = "ok"
    alerts: list[DashboardAlertDTO]


class MovementDTO(BaseModel):
    id: int
    ingredient_id: int | None
    ingredient_name: str | None = None
    movement_type: str
    quantity: Decimal
    total_cost: Decimal | None
    unit_cost: Decimal | None
    reference_id: int | None
    notes: str | None = None
    created_at: Any = None


class ForecastDTO(BaseModel):
    id: int | None = None
    forecast_date: date
    product_id: int | None
    product_name: str | None = None
    predicted_quantity: Decimal
    confidence_score: Decimal | None
    model_version: str | None = None


class AnomalyDTO(BaseModel):
    id: int
    detected_date: date
    anomaly_type: str | None
    description: str | None
    expected_value: Decimal | None
    actual_value: Decimal | None
    is_reviewed: bool


class RecommendationDTO(BaseModel):
    id: int
    ingredient_id: int | None
    ingredient_name: str | None = None
    recommended_quantity: Decimal
    reason: str | None
    status: str


class RecommendationStatusUpdate(BaseModel):
    status: Literal["pendiente", "realizada", "descartada"]


class ReportSummaryDTO(BaseModel):
    from_date: date
    to_date: date
    sales_total: float
    orders_paid: int
    average_ticket: float
    best_day: str | None
    payments: dict[str, float]
    series: list[dict]


class ReportSalesDTO(BaseModel):
    series: list[dict]
    by_order_type: list[dict]
    rows: list[dict]


class ReportPaymentsDTO(BaseModel):
    cash: float
    yape: float
    cash_pct: float
    yape_pct: float


class ReportProductsDTO(BaseModel):
    top: list[dict]
    slow: list[dict]


class ReportInventoryDTO(BaseModel):
    low_stock: list[dict]
    purchases: list[dict]
    recommendations: dict


class PDFRequest(BaseModel):
    from_date: date
    to_date: date
    sections: list[
        Literal["summary", "sales", "payments", "products", "inventory", "forecasts", "anomalies"]
    ] = ["summary", "payments", "products", "inventory", "forecasts", "anomalies"]
