"""Ports: interfaces the application layer depends on, implemented in infrastructure."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class ForecastResult:
    product_id: int
    product_name: str
    forecast_date: date
    predicted_quantity: Decimal
    confidence_score: Decimal
    model_version: str


@dataclass(frozen=True)
class ForecastBundle:
    status: str  # "ok" | "insufficient_data"
    message: str
    results: list[ForecastResult] = field(default_factory=list)
    metrics: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class AnomalyFound:
    detected_date: date
    anomaly_type: str  # pico_venta | caida_venta
    description: str
    expected_value: Decimal
    actual_value: Decimal


class DemandForecasterPort(ABC):
    @abstractmethod
    def train(self) -> dict: ...

    @abstractmethod
    def forecast_next_week(self) -> ForecastBundle: ...


class AnomalyDetectorPort(ABC):
    @abstractmethod
    def train(self) -> dict: ...

    @abstractmethod
    def detect(self) -> list[AnomalyFound]: ...
