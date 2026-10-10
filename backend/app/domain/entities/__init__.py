"""Domain entities live as pure dataclasses where useful.

The project keeps SQLAlchemy models in infrastructure/db/models and pure
business rules in domain/services, following the hexagonal split required
by the specification (section 4.1).
"""
