"""Entrena los modelos ML y persiste pronósticos, anomalías y recomendaciones.

Uso:
    python scripts/train_models.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.infrastructure.ml.anomaly_detection import run_training


if __name__ == "__main__":
    result = run_training()
    print("Entrenamiento completado:")
    for key, value in result.items():
        print(f"  {key}: {value}")
