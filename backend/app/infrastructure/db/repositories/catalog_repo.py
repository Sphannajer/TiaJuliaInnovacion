"""Repositories for catalog data: users, categories, products, option groups."""

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import OptionGroupNotFoundError, ProductNotFoundError, UserNotFoundError
from app.infrastructure.db.models import (
    CategoryModel,
    OptionGroupModel,
    OptionModel,
    ProductModel,
    UserModel,
)


def list_users(db: Session, active_only: bool = True) -> list[UserModel]:
    stmt = select(UserModel).order_by(UserModel.id)
    if active_only:
        stmt = stmt.where(UserModel.is_active.is_(True))
    return list(db.scalars(stmt))


def get_user(db: Session, user_id: int) -> UserModel:
    user = db.get(UserModel, user_id)
    if user is None:
        raise UserNotFoundError()
    return user


def list_categories(db: Session) -> list[CategoryModel]:
    return list(db.scalars(select(CategoryModel).order_by(CategoryModel.id)))


def list_products(
    db: Session,
    active_only: bool = True,
    category_id: int | None = None,
) -> list[ProductModel]:
    stmt = (
        select(ProductModel)
        .options(joinedload(ProductModel.category))
        .order_by(ProductModel.name)
    )
    if active_only:
        stmt = stmt.where(ProductModel.is_active.is_(True))
    if category_id is not None:
        stmt = stmt.where(ProductModel.category_id == category_id)
    return list(db.scalars(stmt).unique())


def get_product(db: Session, product_id: int) -> ProductModel:
    stmt = (
        select(ProductModel)
        .options(joinedload(ProductModel.category))
        .where(ProductModel.id == product_id)
    )
    product = db.scalars(stmt).first()
    if product is None:
        raise ProductNotFoundError()
    return product


def list_option_groups(db: Session) -> list[OptionGroupModel]:
    stmt = (
        select(OptionGroupModel)
        .options(joinedload(OptionGroupModel.options))
        .order_by(OptionGroupModel.id)
    )
    return list(db.scalars(stmt).unique())


def get_option_group(db: Session, group_id: int) -> OptionGroupModel:
    group = db.get(OptionGroupModel, group_id)
    if group is None:
        raise OptionGroupNotFoundError()
    return group


def get_option(db: Session, option_id: int) -> OptionModel | None:
    return db.get(OptionModel, option_id)


def product_option_groups(db: Session, product_id: int) -> list[OptionGroupModel]:
    product = get_product(db, product_id)
    groups = sorted(product.option_groups, key=lambda g: g.id)
    return groups
