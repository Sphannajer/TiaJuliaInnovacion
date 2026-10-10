"""Endpoints de ML y analítica (sección 27.7)."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.application.dto import RecommendationStatusUpdate
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.infrastructure.db.models import IngredientModel
from app.infrastructure.db.repositories import inventory_repo
from app.infrastructure.ml.anomaly_detection import detect_anomalies, persist_anomalies
from app.infrastructure.ml.demand_forecast import LinearDemandForecaster, persist_forecasts
from app.infrastructure.ml.recommendations_engine import generate_recommendations

router = APIRouter()


def _forecast_dto(f) -> dict:
    return {
        "id": f.id,
        "forecast_date": f.forecast_date.isoformat(),
        "product_id": f.product_id,
        "product_name": f.product.name if f.product else None,
        "predicted_quantity": float(f.predicted_quantity),
        "confidence_score": float(f.confidence_score) if f.confidence_score is not None else None,
        "model_version": f.model_version,
    }


@router.get("/forecasts")
def list_forecasts(from_date: date = Query(alias="from"), to_date: date = Query(alias="to"), db: Session = Depends(get_db)):
    forecasts = inventory_repo.list_forecasts(db, from_date, to_date)
    return {"items": [_forecast_dto(f) for f in forecasts], "status": "ok"}


@router.post("/forecasts/generate")
def generate_forecasts(db: Session = Depends(get_db)):
    """Train and persist next-week forecasts on demand."""
    forecaster = LinearDemandForecaster(db)
    bundle = forecaster.forecast_next_week()
    saved = persist_forecasts(db, bundle)
    return {
        "status": bundle.status,
        "message": bundle.message,
        "saved": saved,
        "items": [
            {
                "forecast_date": r.forecast_date.isoformat(),
                "product_id": r.product_id,
                "product_name": r.product_name,
                "predicted_quantity": float(r.predicted_quantity),
                "confidence_score": float(r.confidence_score),
                "model_version": r.model_version,
            }
            for r in bundle.results
        ],
    }


@router.get("/anomalies")
def list_anomalies(from_date: date = Query(alias="from"), to_date: date = Query(alias="to"), db: Session = Depends(get_db)):
    anomalies = inventory_repo.list_anomalies(db, from_date, to_date)
    return {
        "items": [
            {
                "id": a.id,
                "detected_date": a.detected_date.isoformat(),
                "anomaly_type": a.anomaly_type,
                "description": a.description,
                "expected_value": float(a.expected_value) if a.expected_value is not None else None,
                "actual_value": float(a.actual_value) if a.actual_value is not None else None,
                "is_reviewed": a.is_reviewed,
            }
            for a in anomalies
        ]
    }


@router.post("/anomalies/detect")
def run_detection(db: Session = Depends(get_db)):
    """Run Isolation Forest detection and persist new anomalies."""
    anomalies = detect_anomalies(db)
    saved = persist_anomalies(db, anomalies)
    return {"detected": len(anomalies), "saved": saved}


@router.patch("/anomalies/{anomaly_id}/reviewed")
def review_anomaly(anomaly_id: int, db: Session = Depends(get_db)):
    anomaly = inventory_repo.get_anomaly(db, anomaly_id)
    if anomaly is None:
        raise NotFoundError("No encontramos esa anomalía.")
    anomaly.is_reviewed = True
    db.commit()
    return {"id": anomaly.id, "is_reviewed": True}


@router.get("/purchase-recommendations")
def list_recommendations(status: str | None = None, db: Session = Depends(get_db)):
    recommendations = inventory_repo.pending_recommendations(db, status)
    return {
        "items": [
            {
                "id": r.id,
                "ingredient_id": r.ingredient_id,
                "ingredient_name": r.ingredient.name if r.ingredient else None,
                "base_unit": r.ingredient.base_unit if r.ingredient else "",
                "recommended_quantity": float(r.recommended_quantity),
                "reason": r.reason,
                "status": r.status,
            }
            for r in recommendations
        ]
    }


@router.post("/purchase-recommendations/generate")
def run_recommendations(db: Session = Depends(get_db)):
    return {"items": generate_recommendations(db, days=7)}


@router.patch("/purchase-recommendations/{recommendation_id}/status")
def update_recommendation_status(recommendation_id: int, data: RecommendationStatusUpdate, db: Session = Depends(get_db)):
    recommendation = inventory_repo.get_recommendation(db, recommendation_id)
    if recommendation is None:
        raise NotFoundError("No encontramos esa recomendación.")
    recommendation.status = data.status
    db.commit()
    return {"id": recommendation.id, "status": recommendation.status}


@router.post("/ml/retrain")
def retrain(db: Session = Depends(get_db)):
    """Full retrain: demand models + anomaly detection + recommendations.

    Restricted to internal/admin use in production (sección 27.7).
    """
    from app.infrastructure.ml.anomaly_detection import run_training

    return run_training()
