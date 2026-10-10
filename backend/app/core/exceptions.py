"""Typed domain errors mapped to consistent HTTP error payloads."""


class DomainError(Exception):
    code = "DOMAIN_ERROR"
    message = "Ocurrió un error inesperado."
    status_code = 400

    def __init__(self, message: str | None = None, details: dict | None = None):
        self.message = message or self.message
        self.details = details
        super().__init__(self.message)


class NotFoundError(DomainError):
    code = "NOT_FOUND"
    message = "No encontramos ese registro."
    status_code = 404


class OrderNotFoundError(NotFoundError):
    code = "ORDER_NOT_FOUND"
    message = "No encontramos esa orden."


class ProductNotFoundError(NotFoundError):
    code = "PRODUCT_NOT_FOUND"
    message = "No encontramos ese producto."


class IngredientNotFoundError(NotFoundError):
    code = "INGREDIENT_NOT_FOUND"
    message = "No encontramos ese insumo."


class UserNotFoundError(NotFoundError):
    code = "USER_NOT_FOUND"
    message = "No encontramos ese usuario."


class OptionGroupNotFoundError(NotFoundError):
    code = "OPTION_GROUP_NOT_FOUND"
    message = "No encontramos ese grupo de opciones."


class ValidationError(DomainError):
    code = "VALIDATION_ERROR"
    message = "Revisa los datos ingresados."
    status_code = 422


class InvalidOrderStateError(ValidationError):
    code = "INVALID_ORDER_STATE"
    message = "La orden no admite esta acción en su estado actual."


class PaymentRequiredError(ValidationError):
    code = "PAYMENT_METHOD_REQUIRED"
    message = "Debes indicar el medio de pago para marcar la orden como pagada."


class InvalidPaymentMethodError(ValidationError):
    code = "INVALID_PAYMENT_METHOD"
    message = "El medio de pago indicado no existe."


class InsufficientOptionsError(ValidationError):
    code = "INVALID_OPTIONS"
    message = "Las opciones seleccionadas no corresponden al producto."
