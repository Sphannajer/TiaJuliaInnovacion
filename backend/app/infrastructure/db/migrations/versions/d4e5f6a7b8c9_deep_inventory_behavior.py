"""modelo de inventario profundo: unidad de compra, consumo, factor y comportamiento

Revision ID: d4e5f6a7b8c9
Revises: b8f1c2a4d6e7
Create Date: 2026-10-06 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e5f6a7b8c9'
down_revision = 'b8f1c2a4d6e7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Se añaden como NULL para no romper filas existentes; la app deriva el
    # valor de base_unit/categoría cuando están vacíos (compatibilidad).
    op.add_column('ingredients', sa.Column('purchase_unit', sa.String(length=20), nullable=True))
    op.add_column('ingredients', sa.Column('consumption_unit', sa.String(length=20), nullable=True))
    op.add_column('ingredients', sa.Column('conversion_factor', sa.Numeric(precision=10, scale=3), nullable=True))
    op.add_column('ingredients', sa.Column('behavioral_type', sa.String(length=30), nullable=True))

    # Backfill: la unidad de consumo es la unidad base, y el comportamiento se
    # deduce del tipo de unidad y la categoría.
    op.execute(
        """
        UPDATE ingredients SET
            consumption_unit = base_unit,
            conversion_factor = CASE
                WHEN base_unit = 'kg' THEN 1000.000
                WHEN base_unit = 'L' THEN 1000.000
                ELSE 1.000
            END,
            purchase_unit = CASE
                WHEN base_unit = 'kg' THEN 'kg'
                WHEN base_unit = 'g' THEN 'Saco'
                WHEN base_unit = 'ml' THEN 'Litro'
                WHEN base_unit = 'L' THEN 'Litro'
                WHEN base_unit = 'docena' THEN 'Docena'
                ELSE 'unidad'
            END,
            behavioral_type = CASE
                WHEN base_unit IN ('ml', 'L') THEN 'liquidos'
                WHEN base_unit IN ('unidad', 'docena') THEN 'unidades'
                WHEN base_unit IN ('kg', 'g')
                     AND (lower(category) LIKE '%fruta%' OR lower(category) LIKE '%verdura%')
                    THEN 'frutas_verduras'
                WHEN base_unit IN ('kg', 'g') THEN 'solidos'
                ELSE 'unidades'
            END
        """
    )


def downgrade() -> None:
    op.drop_column('ingredients', 'behavioral_type')
    op.drop_column('ingredients', 'conversion_factor')
    op.drop_column('ingredients', 'consumption_unit')
    op.drop_column('ingredients', 'purchase_unit')
