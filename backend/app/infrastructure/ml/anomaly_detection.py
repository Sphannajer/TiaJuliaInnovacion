"""Detección de anomalías con Isolation Forest (sección 31).

- Datos: ventas diarias totales (solo órdenes pagadas) + órdenes por día.
- Features: sales_total, orders_count, average_ticket, day_of_week,
  rolling_mean_7, relative_deviation.
- Modelo: IsolationForest(n_estimators=200, contamination=0.05, random_state=42).
- El score bruto nunca se muestra: se traduce a pico_venta / caida_venta
  comparando contra el promedio por día de semana.
- Se persisten expected_value y actual_value.
"""

import logging
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sqlalchemy.orm import Session

from app.domain.ports import AnomalyFound
from app.infrastructure.ml.demand_forecast import LinearDemandForecaster, persist_forecasts
from app.infrastructure.ml.features import (
    add_sales_features,
    daily_by_dow_baseline,
    daily_sales_totals,
)
from app.infrastructure.ml.model_store import model_version, save_model

logger = logging.getLogger("tia_julia.ml")

ANOMALY_FEATURES = [
    "sales_total",
    "orders_count",
    "average_ticket",
    "day_of_week",
    "rolling_mean_7",
    "relative_deviation",
]

MIN_DAYS = 21  # need at least ~3 weeks to judge a weekday pattern

DOW_NAMES = [
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
]


def train_isolation_forest(frame: pd.DataFrame) -> dict | None:
    data = add_sales_features(frame).dropna(subset=ANOMALY_FEATURES)
    if len(data) < MIN_DAYS:
        return None
    model = IsolationForest(
        n_estimators=200,
        contamination=0.05,
        random_state=42,
    )
    model.fit(data[ANOMALY_FEATURES])
    predictions = model.predict(data[ANOMALY_FEATURES])  # -1 anomaly, 1 normal
    data = data.assign(is_anomaly=predictions == -1)
    return {"model": model, "data": data}


def _money(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def detect_anomalies(db: Session) -> list[AnomalyFound]:
    frame = daily_sales_totals(db)
    if frame.empty or len(frame) < MIN_DAYS:
        return []
    trained = train_isolation_forest(frame)
    if trained is None:
        return []
    data = trained["data"]
    baseline = daily_by_dow_baseline(frame).set_index("day_of_week")["sales_total"]
    anomalies: list[AnomalyFound] = []
    for _, row in data[data["is_anomaly"]].iterrows():
        day: pd.Timestamp = row["day"]
        dow = int(row["day_of_week"])
        actual = float(row["sales_total"])
        expected = float(baseline.get(dow, actual))
        day_name = DOW_NAMES[dow]
        if expected > 0:
            deviation = (actual - expected) / expected
        else:
            deviation = 0.0
        if deviation < 0:
            anomaly_type = "caida_venta"
            percent = round(abs(deviation) * 100)
            description = (
                f"Ventas {percent}% menores de lo esperado para un {day_name}."
            )
        else:
            anomaly_type = "pico_venta"
            percent = round(deviation * 100)
            description = (
                f"Ventas {percent}% mayores de lo esperado para un {day_name}."
            )
        anomalies.append(
            AnomalyFound(
                detected_date=day.date(),
                anomaly_type=anomaly_type,
                description=description,
                expected_value=_money(expected),
                actual_value=_money(actual),
            )
        )
    anomalies.sort(key=lambda a: a.detected_date)
    return anomalies


def persist_anomalies(db: Session, anomalies: list[AnomalyFound]) -> int:
    """Insert anomalies that are not already stored for the same date/type."""
    from sqlalchemy import select

    from app.infrastructure.db.models import SalesAnomalyModel

    saved = 0
    for anomaly in anomalies:
        exists = db.scalars(
            select(SalesAnomalyModel)
            .where(SalesAnomalyModel.detected_date == anomaly.detected_date)
            .where(SalesAnomalyModel.anomaly_type == anomaly.anomaly_type)
        ).first()
        if exists:
            continue
        db.add(
            SalesAnomalyModel(
                detected_date=anomaly.detected_date,
                anomaly_type=anomaly.anomaly_type,
                description=anomaly.description,
                expected_value=anomaly.expected_value,
                actual_value=anomaly.actual_value,
                is_reviewed=False,
            )
        )
        saved += 1
    db.commit()
    return saved


def run_training(version_day: date | None = None) -> dict:
    """Full training run: demand models + anomaly detection + persistence."""
    from app.core.database import SessionLocal

    with SessionLocal() as db:
        forecaster = LinearDemandForecaster(db)
        demand = forecaster.train_all(version_day)
        anomalies = detect_anomalies(db)
        saved_anomalies = persist_anomalies(db, anomalies)
        bundle = forecaster.forecast_next_week()
        saved_forecasts = persist_forecasts(db, bundle)
        return {
            "demand": demand,
            "anomalies_detected": len(anomalies),
            "anomalies_saved": saved_anomalies,
            "forecasts_saved": saved_forecasts,
            "forecast_status": bundle.status,
            "model_version": model_version("tia-julia", version_day),
        }
