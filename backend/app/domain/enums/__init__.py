import enum


class OrderType(str, enum.Enum):
    MESA = "mesa"
    DELIVERY = "delivery"
    MOSTRADOR = "mostrador"


class OrderStatus(str, enum.Enum):
    EN_PREPARACION = "en_preparacion"
    PAGADO = "pagado"
    CANCELADO = "cancelado"


class SyncStatus(str, enum.Enum):
    PENDING = "pending"
    SYNCED = "synced"


class MovementType(str, enum.Enum):
    ENTRADA = "entrada"
    SALIDA = "salida"
    AJUSTE = "ajuste"


class StockState(str, enum.Enum):
    """Human-readable stock states (never color-only)."""

    BIEN = "BIEN"
    BAJO = "BAJO"
    CRITICO = "CRITICO"


class RecommendationStatus(str, enum.Enum):
    PENDIENTE = "pendiente"
    REALIZADA = "realizada"
    DESCARTADA = "descartada"


class AnomalyType(str, enum.Enum):
    PICO_VENTA = "pico_venta"
    CAIDA_VENTA = "caida_venta"


class PaymentMethod(str, enum.Enum):
    EFECTIVO = "Efectivo"
    YAPE = "Yape"
