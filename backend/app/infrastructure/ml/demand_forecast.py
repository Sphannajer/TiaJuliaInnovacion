"""Predicción de demanda con Regresión Lineal (sección 30).

- Dataset: órdenes pagadas, agregadas por producto + fecha.
- Features: day_of_week, is_friday, is_weekend, week_of_year, lag_7,
  rolling_mean_7, rolling_mean_28.
- Validación temporal (sin shuffle). Métricas: MAE, RMSE, R².
- confidence_score = clamp(R² * 100, 0, 100): puntuación heurística de
  confiabilidad, no una probabilidad estadística.
- Si el historial es insuficiente (<4 semanas), status = insufficient_data
  y no se inventan resultados (regla final, sección 51).
"""

import logging
from datetime import date, timedelta
from decimal import Decimal

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.ports import ForecastBundle, ForecastResult
from app.infrastructure.db.models import DemandForecastModel, ProductModel
from app.infrastructure.ml.features import (
    add_calendar_features,
    next_week_days,
    product_daily_sales,
)
from app.infrastructure.ml.model_store import model_version, save_model

logger = logging.getLogger("tia_julia.ml")

FEATURE_COLUMNS = [
    "day_of_week",
    "is_friday",
    "is_weekend",
    "week_of_year",
    "lag_7",
    "rolling_mean_7",
    "rolling_mean_28",
]

MIN_WEEKS = 4
MIN_HISTORY_DAYS = MIN_WEEKS * 7 // 2


def _confidence_score(r2: float) -> Decimal:
    """confidence_score = clamp(R² * 100, 0, 100). Heuristic, documented."""
    return Decimal(str(max(0.0, min(100.0, r2 * 100.0)))).quantize(Decimal("0.01"))


def train_product_model(frame: pd.DataFrame) -> dict | None:
    """Train one Linear Regression for a product's daily series.

    Temporal split: first 80% of days train, last 20% validate. No shuffle.
    Returns None when history is insufficient.
    """
    data = add_calendar_features(frame).dropna(subset=FEATURE_COLUMNS)
    if len(data) < MIN_HISTORY_DAYS:
        return None
    split = int(len(data) * 0.8)
    train, valid = data.iloc[:split], data.iloc[split:]
    if len(train) < 10 or len(valid) < 3:
        return None
    model = LinearRegression()
    model.fit(train[FEATURE_COLUMNS], train["quantity_sold"])
    predictions = model.predict(valid[FEATURE_COLUMNS])
    metrics = {
        "mae": float(mean_absolute_error(valid["quantity_sold"], predictions)),
        "rmse": float(np.sqrt(mean_squared_error(valid["quantity_sold"], predictions))),
        "r2": float(r2_score(valid["quantity_sold"], predictions)),
        "train_days": int(len(train)),
        "valid_days": int(len(valid)),
    }
    return {"model": model, "metrics": metrics, "frame": data}


def _extend_features(history: pd.DataFrame, future_day: date) -> dict:
    """Feature row for a future day from the historical daily series."""
    series = history.set_index("day")["quantity_sold"]
    dow = future_day.weekday()
    lag_day = pd.Timestamp(future_day - timedelta(days=7))
    lag_7 = float(series.get(lag_day, np.nan))
    tail7 = series.tail(7)
    rolling_7 = float(tail7.mean()) if len(tail7) else 0.0
    tail28 = series.tail(28)
    rolling_28 = float(tail28.mean()) if len(tail28) else rolling_7
    if np.isnan(lag_7):
        lag_7 = rolling_7
    return {
        "day_of_week": dow,
        "is_friday": int(dow == 4),
        "is_weekend": int(dow >= 5),
        "week_of_year": int(future_day.isocalendar().week),
        "lag_7": lag_7,
        "rolling_mean_7": rolling_7,
        "rolling_mean_28": rolling_28,
    }


class LinearDemandForecaster:
    """Trains per-product Linear Regression and forecasts the next 7 days."""

    def __init__(self, db: Session):
        self.db = db

    def _products(self) -> list[tuple[int, str]]:
        rows = self.db.execute(select(ProductModel.id, ProductModel.name)).all()
        return [(int(r[0]), r[1]) for r in rows]

    def train_all(self, version_day: date | None = None) -> dict:
        version = model_version("lr-demand", version_day)
        trained, skipped, metrics = 0, 0, []
        for product_id, _name in self._products():
            frame = product_daily_sales(self.db, product_id)
            if frame.empty:
                skipped += 1
                continue
            result = train_product_model(frame)
            if result is None:
                skipped += 1
                continue
            save_model(
                f"demand_{product_id}",
                result["model"],
                {
                    "model_version": f"{version}-p{product_id}",
                    "product_id": product_id,
                    "metrics": result["metrics"],
                    "features": FEATURE_COLUMNS,
                    "trained_at": str(date.today()),
                },
            )
            metrics.append({"product_id": product_id, **result["metrics"]})
            trained += 1
        return {
            "status": "ok",
            "trained": trained,
            "skipped": skipped,
            "metrics": metrics,
            "version": version,
        }

    def forecast_next_week(self) -> ForecastBundle:
        horizon = next_week_days()
        results: list[ForecastResult] = []
        insufficient = 0
        version = f"lr-demand-v1-{date.today().isoformat()}"
        for product_id, product_name in self._products():
            frame = product_daily_sales(self.db, product_id)
            if frame.empty:
                insufficient += 1
                continue
            trained = train_product_model(frame)
            if trained is None:
                insufficient += 1
                continue
            model = trained["model"]
            confidence = _confidence_score(trained["metrics"]["r2"])
            history = trained["frame"][["day", "quantity_sold"]]
            for day in horizon:
                row = _extend_features(history, day)
                row_frame = pd.DataFrame([row])[FEATURE_COLUMNS]
                predicted = max(0.0, float(model.predict(row_frame)[0]))
                results.append(
                    ForecastResult(
                        product_id=product_id,
                        product_name=product_name,
                        forecast_date=day,
                        predicted_quantity=Decimal(str(round(predicted, 2))),
                        confidence_score=confidence,
                        model_version=version,
                    )
                )
        if not results:
            return ForecastBundle(
                status="insufficient_data",
                message=(
                    "Todavía no hay suficientes ventas para calcular una predicción "
                    "confiable. Necesitamos al menos 4 semanas de datos."
                ),
                results=[],
                metrics={},
            )
        message = "Predicción calculada con las ventas registradas."
        if insufficient:
            message += f" {insufficient} producto(s) sin datos suficientes."
        return ForecastBundle(status="ok", message=message, results=results, metrics={})


def persist_forecasts(db: Session, bundle: ForecastBundle) -> int:
    """Upsert forecasts into demand_forecasts (unique: forecast_date + product)."""
    saved = 0
    for result in bundle.results:
        existing = db.scalars(
            select(DemandForecastModel)
            .where(DemandForecastModel.forecast_date == result.forecast_date)
            .where(DemandForecastModel.product_id == result.product_id)
        ).first()
        if existing:
            existing.predicted_quantity = result.predicted_quantity
            existing.confidence_score = result.confidence_score
            existing.model_version = result.model_version
        else:
            db.add(
                DemandForecastModel(
                    forecast_date=result.forecast_date,
                    product_id=result.product_id,
                    predicted_quantity=result.predicted_quantity,
                    confidence_score=result.confidence_score,
                    model_version=result.model_version,
                )
            )
        saved += 1
    db.commit()
    return saved
