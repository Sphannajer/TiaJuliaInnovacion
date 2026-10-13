BEGIN;

DROP TABLE IF EXISTS public.recipe_components CASCADE;
DROP TABLE IF EXISTS public.product_option_groups CASCADE;
DROP TABLE IF EXISTS public.order_details CASCADE;
DROP TABLE IF EXISTS public.inventory_movements CASCADE;
DROP TABLE IF EXISTS public.demand_forecasts CASCADE;
DROP TABLE IF EXISTS public.sales_anomalies CASCADE;
DROP TABLE IF EXISTS public.purchase_recommendations CASCADE;
DROP TABLE IF EXISTS public.sync_requests CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.options CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.option_groups CASCADE;
DROP TABLE IF EXISTS public.ingredients CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.payment_methods CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.alembic_version CASCADE;

CREATE TABLE public.users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE public.categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    allows_multiple_ingredients BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE public.ingredients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    base_unit VARCHAR(20) NOT NULL,
    current_stock NUMERIC(10,3) NOT NULL DEFAULT 0.000,
    min_stock_alert NUMERIC(10,3) NOT NULL DEFAULT 5.000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unit_name VARCHAR(50),
    unit_weight NUMERIC(10,3),
    purchase_unit VARCHAR(20),
    consumption_unit VARCHAR(20),
    conversion_factor NUMERIC(10,3),
    behavioral_type VARCHAR(30)
);

CREATE TABLE public.products (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES public.categories(id),
    name VARCHAR(150) NOT NULL,
    base_price NUMERIC(10,2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.option_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);

CREATE TABLE public.options (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES public.option_groups(id),
    name VARCHAR(100) NOT NULL,
    extra_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    linked_ingredient_id INTEGER REFERENCES public.ingredients(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE public.product_option_groups (
    product_id INTEGER NOT NULL REFERENCES public.products(id),
    group_id INTEGER NOT NULL REFERENCES public.option_groups(id),
    PRIMARY KEY (product_id, group_id)
);

CREATE TABLE public.orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES public.users(id),
    order_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'en_preparacion',
    customer_name VARCHAR(100),
    table_number VARCHAR(10),
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    payment_method_id INTEGER REFERENCES public.payment_methods(id),
    sync_status VARCHAR(20) NOT NULL DEFAULT 'synced',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_orders_order_type CHECK (order_type IN ('mesa', 'delivery', 'mostrador')),
    CONSTRAINT ck_orders_status CHECK (status IN ('en_preparacion', 'pagado', 'cancelado')),
    CONSTRAINT ck_orders_sync_status CHECK (sync_status IN ('pending', 'synced'))
);

CREATE TABLE public.order_details (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES public.products(id),
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    subtotal NUMERIC(10,2) NOT NULL,
    assembly_config JSONB,
    notes VARCHAR(255),
    CONSTRAINT ck_order_details_quantity_positive CHECK (quantity > 0)
);

CREATE TABLE public.inventory_movements (
    id SERIAL PRIMARY KEY,
    ingredient_id INTEGER REFERENCES public.ingredients(id),
    movement_type VARCHAR(20) NOT NULL,
    quantity NUMERIC(10,3) NOT NULL,
    total_cost NUMERIC(10,2),
    unit_cost NUMERIC(10,3),
    reference_id INTEGER,
    notes VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_inventory_movement_type CHECK (movement_type IN ('entrada', 'salida', 'ajuste'))
);

CREATE TABLE public.demand_forecasts (
    id SERIAL PRIMARY KEY,
    forecast_date DATE NOT NULL,
    product_id INTEGER REFERENCES public.products(id),
    predicted_quantity NUMERIC(10,2) NOT NULL,
    confidence_score NUMERIC(5,2),
    model_version VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_forecast_date_product UNIQUE (forecast_date, product_id)
);

CREATE TABLE public.sales_anomalies (
    id SERIAL PRIMARY KEY,
    detected_date DATE NOT NULL,
    anomaly_type VARCHAR(50),
    description TEXT,
    expected_value NUMERIC(10,2),
    actual_value NUMERIC(10,2),
    is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.purchase_recommendations (
    id SERIAL PRIMARY KEY,
    ingredient_id INTEGER REFERENCES public.ingredients(id),
    recommended_quantity NUMERIC(10,2) NOT NULL,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.recipe_components (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    option_id INTEGER REFERENCES public.options(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES public.ingredients(id),
    quantity_per_unit NUMERIC(10,3) NOT NULL,
    size_multiplier JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    size_option_id INTEGER REFERENCES public.options(id) ON DELETE CASCADE
);

CREATE TABLE public.sync_requests (
    id SERIAL PRIMARY KEY,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    resource_type VARCHAR(50) NOT NULL,
    resource_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.alembic_version (
    version_num VARCHAR(32) PRIMARY KEY
);

CREATE INDEX idx_anomalies_date
    ON public.sales_anomalies (detected_date);

CREATE INDEX idx_forecasts_product_date
    ON public.demand_forecasts (product_id, forecast_date);

CREATE INDEX idx_inventory_movements_ingredient_date
    ON public.inventory_movements (ingredient_id, created_at);

CREATE INDEX idx_order_details_order_id
    ON public.order_details (order_id);

CREATE INDEX idx_order_details_product_id
    ON public.order_details (product_id);

CREATE INDEX idx_orders_created_at
    ON public.orders (created_at);

CREATE INDEX idx_orders_payment_method
    ON public.orders (payment_method_id);

CREATE INDEX idx_orders_status_created_at
    ON public.orders (status, created_at);

CREATE INDEX idx_purchase_recommendations_status
    ON public.purchase_recommendations (status);

COMMIT;
