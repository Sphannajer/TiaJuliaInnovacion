"""unidades contables en insumos y tamaño por fila de receta

Revision ID: b8f1c2a4d6e7
Revises: 27b56e248eb4
Create Date: 2026-10-06 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'b8f1c2a4d6e7'
down_revision = '27b56e248eb4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Unidad natural contable (fresa, vaso, cucharada) y su peso/volumen en la
    # unidad base. Permite contar en vez de pesar o medir a mano.
    op.add_column('ingredients', sa.Column('unit_name', sa.String(length=50), nullable=True))
    op.add_column('ingredients', sa.Column('unit_weight', sa.Numeric(precision=10, scale=3), nullable=True))
    # Tamaño explícito por fila de receta (personal/pareja/familiar).
    op.add_column('recipe_components', sa.Column('size_option_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_recipe_components_size_option',
        'recipe_components',
        'options',
        ['size_option_id'],
        ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint('fk_recipe_components_size_option', 'recipe_components', type_='foreignkey')
    op.drop_column('recipe_components', 'size_option_id')
    op.drop_column('ingredients', 'unit_weight')
    op.drop_column('ingredients', 'unit_name')
