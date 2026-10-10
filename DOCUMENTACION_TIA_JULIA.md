# Tía Julia — Documentación completa (Frontend + Backend)

Sistema web de **ventas, órdenes, inventario profundo y analítica** para la juguería/fuente de soda **Tía Julia**.
Pensado para una propietaria **mayor de 60 años** en una **tablet horizontal fija de 1024×768**: botones grandes,
lenguaje cotidiano, navegación predecible y mínima carga cognitiva.

> Este documento explica **todo el sistema**: cómo está construido el backend (FastAPI + PostgreSQL), cómo está
> construido el frontend (React + TypeScript + Tailwind v4), los flujos de negocio, el modelo de inventario
> profundo, el motor de comportamiento de insumos, los endpoints y las decisiones de diseño.

---

## Índice

1. [Stack y decisiones transversales](#1-stack-y-decisiones-transversales)
2. [Cómo ejecutar el proyecto](#2-cómo-ejecutar-el-proyecto)
3. [Arquitectura del backend](#3-arquitectura-del-backend)
4. [Modelo de datos (PostgreSQL)](#4-modelo-de-datos-postgresql)
5. [Inventario profundo: unidades, comportamiento y descuento](#5-inventario-profundo-unidades-comportamiento-y-descuento)
6. [Validación estricta de entradas](#6-validación-estricta-de-entradas)
7. [API REST (endpoints)](#7-api-rest-endpoints)
8. [Seed reproducible](#8-seed-reproducible)
9. [Analítica y machine learning](#9-analítica-y-machine-learning)
10. [Arquitectura del frontend](#10-arquitectura-del-frontend)
11. [Interfaz de recetas (ensamblador 65/35)](#11-interfaz-de-recetas-ensamblador-6535)
12. [Traducción visual de stock y semáforo](#12-traducción-visual-de-stock-y-semáforo)
13. [Alta de insumos con control de duplicados](#13-alta-de-insumos-con-control-de-duplicados)
14. [Flujos de negocio de extremo a extremo](#14-flujos-de-negocio-de-extremo-a-extremo)
15. [Sistema de diseño y accesibilidad](#15-sistema-de-diseño-y-accesibilidad)
16. [Verificación realizada](#16-verificación-realizada)
17. [Limitaciones conocidas](#17-limitaciones-conocidas)

---

## 1. Stack y decisiones transversales

| Capa | Tecnología |
|------|------------|
| Frontend | React 18 + TypeScript, Vite, React Router, TanStack Query, Chart.js |
| Estilos | **Tailwind CSS v4** como sistema único (`@theme` + `@layer components` + tokens CSS). Sin Bootstrap ni plantillas de terceros |
| Estado local / offline | Zustand (`cartStore`), IndexedDB (`idb`) + Service Worker (PWA) |
| Backend | Python 3.12+ (probado en 3.14), FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic |
| Base de datos | PostgreSQL (`America/Lima`, moneda PEN `S/`, fecha `dd/mm/yyyy`) |
| Analítica | pandas, scikit-learn, joblib (forecast, anomalías, recomendaciones) |
| Reportes | Generación de PDF en backend |

**Reglas UX transversales aplicadas en todo el frontend**

- Recorrido visual izquierda → derecha y arriba → abajo.
- Paleta Tía Julia (`#C92429` rojo, `#E99015` naranja, `#4F9C3A` verde, `#F2D4A2` arena, `#F6F3E6` hueso).
- Navbar y grupos de acciones **en una sola fila** a 1024 px (punto de quiebre `--breakpoint-nav: 1000px`).
- Sin `...` para ocultar navegación o acciones principales.
- Estados de inventario y alertas con **componente semántico + texto** (nunca solo color).
- Target táctil mínimo **52 px** (`--touch-comfort`) y 56 px (`--touch-large`).
- Toda acción produce feedback visual inmediato.

---

## 2. Cómo ejecutar el proyecto

### 2.1 Backend

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -e .                 # o pip install -r requirements si aplica
.venv/bin/alembic upgrade head             # crea/actualiza las tablas
.venv/bin/python scripts/seed.py           # datos demo idempotentes
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001
```

- Documentación interactiva: `http://127.0.0.1:8001/docs`.
- Health: `GET http://127.0.0.1:8001/health`.
- Configuración por variables de entorno (`.env`): `DATABASE_URL`, `API_V1_PREFIX` (`/api/v1`),
  `TIMEZONE`, `CORS_ORIGINS`, `ML_MODEL_DIR`, `REPORT_OUTPUT_DIR`, `LOG_LEVEL`.

### 2.2 Base de datos

- PostgreSQL en `localhost:5432`, base `tiajulia`, usuario `postgres`.
- Base de pruebas: `tiajulia_test` (el `conftest.py` la recrea con `DROP DATABASE ... WITH (FORCE)`).

### 2.3 Frontend

```bash
cd frontend
npm install
npm run dev        # Vite en http://localhost:5173
npm run build      # build de producción + PWA
npx tsc -b         # verificación de tipos
npx vitest run     # pruebas
```

Base de la API configurada en `frontend/src/lib/api.ts` (`VITE_API_BASE_URL`,
por defecto `http://localhost:8001/api/v1`).

### 2.4 Docker (opcional)

`docker-compose.yml` en la raíz levanta backend + frontend + base de datos.

---

## 3. Arquitectura del backend

Arquitectura **por capas (Clean Architecture ligera)**:

```
backend/app/
├── domain/                     # Reglas de negocio puras (sin framework)
│   ├── enums/                  # MovementType, OrderStatus, OrderType…
│   ├── entities/               # Entidades de dominio
│   └── services/
│       ├── assembly.py         # Validación de grupos/opciones y armado de pedidos
│       ├── inventory.py        # Estados de stock, comportamiento, consumo por receta
│       ├── pricing.py          # unit_price = base + extras, subtotales, total
│       └── recommendations.py  # Redondeo por unidad y cantidad sugerida de compra
├── application/                # Orquestación (casos de uso + DTOs)
│   ├── dto/__init__.py         # Contratos Pydantic v2 (request/response)
│   └── use_cases/
│       ├── catalog_use_case.py     # CRUD productos/insumos, recetas, validaciones
│       ├── orders_use_case.py      # Ventas, descuento de inventario, pagos, cancelación
│       ├── inventory_use_case.py   # Entradas, ajustes, stock bajo, aprendizaje de unidad
│       ├── dashboard_use_case.py   # KPIs y alertas del panel
│       └── reports_use_case.py     # Reportes y PDF
├── infrastructure/             # Detalles técnicos
│   ├── db/
│   │   ├── models/__init__.py      # Modelos SQLAlchemy 2.x
│   │   ├── migrations/versions/    # Migraciones Alembic
│   │   └── repositories/           # Acceso a datos (catalog, inventory, orders)
│   ├── ml/                      # Forecast, anomalías, recomendaciones, features, model store
│   ├── pdf/report_generator.py  # PDF
│   └── sync/                    # Soporte de sincronización offline
├── presentation/api/v1/routers/ # Endpoints FastAPI por recurso
├── core/                        # config, database, exceptions, logging, timezone
└── main.py                      # App FastAPI, CORS, manejo de errores, /health
tests/                           # pytest (unit + api)
```

**Manejo de errores uniforme** (sección 27): todas las respuestas de error usan

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": { … } } }
```

`DomainError` (y sus subclases como `ValidationError`, `NotFoundError`, `InsufficientOptionsError`,
`IngredientNotFoundError`) define el `status_code`. En producción nunca se expone el stack trace.

---

## 4. Modelo de datos (PostgreSQL)

Tablas principales (sección 4 y 23):

| Tabla | Rol |
|-------|-----|
| `users` | Usuarios (Olga, Aylin, Angelo, Alejandro) |
| `payment_methods` | Métodos de pago (1 = Efectivo, 2 = Yape, hardcodeados por el negocio) |
| `categories` | Categorías de producto; `allows_multiple_ingredients` habilita multi-fruta (jugos) |
| `ingredients` | Insumos con inventario profundo (ver §5) |
| `products` | Catálogo de productos y precios base |
| `option_groups` / `options` | Modificadores (tamaño, fruta, base, endulzante, tipo, porción, relleno) |
| `product_option_groups` | Qué grupos aplica cada producto |
| `recipe_components` | **Tabla técnica de recetas**: cuánto insumo consume cada producto/opción |
| `orders` / `order_details` | Ventas, `assembly_config` en JSONB, `sync_status` |
| `inventory_movements` | Entradas, salidas y ajustes (cantidad en unidad base) |
| `demand_forecasts`, `sales_anomalies`, `purchase_recommendations` | Resultados de ML |
| `sync_requests` | **Tabla técnica de idempotencia** para el modo offline |

### Tabla `ingredients` (inventario profundo)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `name` | VARCHAR(100) | Nombre normalizado en minúsculas (evita duplicados) |
| `category` | VARCHAR(50) | Fruta/Verdura, Lácteo, Abarrote, Carne, Panadería, Bebida, Insumo seco, Otro |
| `base_unit` | VARCHAR(20) | Unidad en la que se **guarda** el stock (kg, g, ml, L, unidad, docena) |
| `purchase_unit` | VARCHAR(20) NULL | Empaque de compra: `Caja/Litro`, `Saco 5kg`, `Jaba 30u`, `Bidón 20L`… |
| `consumption_unit` | VARCHAR(20) NULL | Unidad mínima de consumo (ml, g, unidad). Si es NULL se usa `base_unit` |
| `conversion_factor` | NUMERIC(10,3) NULL | Cuántas unidades de consumo rinde una compra |
| `behavioral_type` | VARCHAR(30) NULL | `liquidos` \| `solidos` \| `unidades` \| `frutas_verduras` |
| `unit_name` | VARCHAR(50) NULL | Unidad natural contable: `fresa`, `vaso`, `cucharada` |
| `unit_weight` | NUMERIC(10,3) NULL | Cuánto de la unidad base contiene una unidad natural |
| `current_stock` | NUMERIC(10,3) | Stock actual |
| `min_stock_alert` | NUMERIC(10,3) | Umbral de aviso |

### Tabla `recipe_components`

| Columna | Descripción |
|---------|-------------|
| `product_id` | Producto al que pertenece |
| `option_id` NULL | Si es NULL, el insumo **siempre** se consume; si no, solo cuando se elige esa opción |
| `size_option_id` NULL | Tamaño (personal/pareja/familiar) al que aplica la fila |
| `ingredient_id` | Insumo consumido |
| `quantity_per_unit` | Cantidad en unidad base por unidad vendida |
| `size_multiplier` JSONB NULL | Compatibilidad: factor por nombre de tamaño `{"personal":0.8,…}` |
| `is_active` | Baja lógica |

> **Nota de compatibilidad:** existían dos claves foráneas a `options` (`option_id` y `size_option_id`).
> El modelo desambigua las relaciones con `relationship(foreign_keys=[...])` para evitar el error
> *"Could not determine join condition… multiple foreign key paths"*.

### Migraciones

| Revisión | Contenido |
|----------|-----------|
| `27b56e248eb4` | Tablas de negocio con constraints e índices |
| `b8f1c2a4d6e7` | `unit_name`/`unit_weight` en insumos + `size_option_id` en recetas |
| `d4e5f6a7b8c9` *(head)* | **Inventario profundo**: `purchase_unit`, `consumption_unit`, `conversion_factor`, `behavioral_type` (+ backfill) |

---

## 5. Inventario profundo: unidades, comportamiento y descuento

### 5.1 Motor de comportamiento universal (4 grupos)

Cada insumo tiene un `behavioral_type` que **autodefine los botones táctiles** del constructor de recetas
(sección 6). El backend expone los botones ya resueltos en `IngredientDTO.increments`:

| Comportamiento | Unidad | Botones |
|----------------|--------|---------|
| `liquidos` | ml | `+10 ml`, `+50 ml`, `+100 ml`, `+250 ml` |
| `solidos` | g | `+5 g`, `+25 g`, `+100 g`, `+500 g` |
| `unidades` | unidad | `+1 u`, `+5 u`, `+10 u` (**solo enteros**) |
| `frutas_verduras` | g | `+10 g`, `+50 g`, `+200 g`, `+1 kg` |

Si un insumo no tiene comportamiento explícito, se **deduce** de la unidad y la categoría
(`effective_behavioral_type`). El frontend tiene el mismo fallback (`deriveBehaviorFromUnit`) por si
el backend no lo envía, y prefiere `increments` cuando vienen.

### 5.2 Unidad natural contable (contar en vez de pesar)

`unit_name` + `unit_weight` permiten contar en unidades naturales: **1 fresa ≈ 15 g**, **1 vaso = 50 ml**,
**1 cucharada de azúcar ≈ 8 g**. Al registrar una entrada con `unit_count` (cuántas piezas llegaron) y
`unit_name`, el backend **aprende** `unit_weight = quantity / unit_count` (3 decimales, ROUND_HALF_UP) y lo
guarda para no volver a pesar ni medir.

### 5.3 Descuento transaccional (una única transacción)

Al crear una orden (o confirmar pago) el backend, en una sola transacción SQL:

1. **Resuelve la receta**: cruza `product_id` + `option_ids` contra `recipe_components`.
2. **Escala por tamaño**: aplica `size_option_id` (fila explícita del tamaño elegido) y/o el factor
   `size_multiplier` heredado.
3. **Persiste el movimiento** `salida` en `inventory_movements` con la cantidad exacta.
4. **Actualiza `ingredients.current_stock`**.
5. **REGLA DE NO-BLOQUEO EN CAJA**: si el stock es insuficiente, **la venta NUNCA se bloquea**; se genera
   una `InventoryAlert` que aparece como alerta persistente en el Dashboard.

La función de cálculo es `domain/services/inventory.py::consumption_for_detail(recipe, quantity,
selected_option_ids, selected_size_id, selected_size_name)`.

### 5.4 Nota sobre la unidad de almacenamiento

El sistema conserva `base_unit` como unidad real de almacenamiento (compatibilidad con los datos y recetas
existentes, que ya usaban `kg` para frutas y `ml` para líquidos) y expone `consumption_unit` como la unidad
mínima de consumo. Para insumos guardados en `kg`, los botones y el formateador convierten **gramos ⇄ kg**
en el frontend (`convertToBaseUnit`), de modo que la operación diaria se hace siempre en gramos/ml aunque la
columna siga siendo kg. Esto evita una migración destructiva de stock ya existente.

---

## 6. Validación estricta de entradas

Doble validación: **Pydantic v2** en backend y **controles del frontend**.

### 6.1 Texto (nombres)

- Se eliminan espacios duplicados/huérfanos (`strip` + colapso) y se normaliza a minúsculas en catálogo.
- Solo se permiten **letras y espacios** (incluye acentos y `ñ`). Regex `TEXT_ONLY_RE`.
- Microcopy: **"Usa solo letras y espacios para el nombre"**.

### 6.2 Números enteros (unidades físicas / conteo por pieza)

- Si `consumption_unit = 'unidad'`, se **bloquean** `.` y `,` en el frontend (`sanitizeQuantityInput`) y el
  backend rechaza decimales con `is_count_unit` + `is_integer_quantity` (aplicado en recetas, entradas y
  ajustes).
- Microcopy: **"Este insumo solo se cuenta por piezas enteras (sin decimales)"**.

### 6.3 Decimales controlados (líquidos, sólidos, frutas)

- Máximo **3 decimales** (Pydantic `decimal_places=3`, `max_digits=10`).
- El frontend convierte automáticamente la coma `,` en punto `.` antes de enviar (`parseDecimalInput`).
- Microcopy: **"Ingresa un número decimal válido (ej. 1.500)"**.

---

## 7. API REST (endpoints)

Prefijo: `/api/v1`.

### Catálogo — `catalog_router.py`
```
GET    /users
GET    /categories
GET    /products?active=&category_id=
GET    /products/{product_id}
POST   /products                         # crea producto + receta
PUT    /products/{product_id}
PATCH  /products/{product_id}/status?is_active=
GET    /option-groups
GET    /products/{product_id}/option-groups
```

### Órdenes/ventas — `orders_router.py`
```
POST   /orders                           # Idempotency-Key opcional (offline)
GET    /orders?date=&status=&order_type=&search=&limit=&offset=
GET    /orders/{order_id}
POST   /orders/{order_id}/details
PUT    /orders/{order_id}/details/{detail_id}
DELETE /orders/{order_id}/details/{detail_id}
POST   /orders/{order_id}/pay
POST   /orders/{order_id}/cancel
```

### Inventario — `inventory_router.py`
```
GET    /ingredients                      # incluye behavioral_type, increments, state, last_unit_cost…
GET    /ingredients/low-stock
POST   /ingredients
PUT    /ingredients/{ingredient_id}
GET    /inventory/movements?date=&ingredient_id=&movement_type=
POST   /inventory/entries                # quantity, total_cost, unit_count, unit_name
POST   /inventory/adjustments            # new_stock, reason
```

### Dashboard — `dashboard_router.py`
```
GET    /dashboard/summary?period=
GET    /dashboard/sales-series?period=
GET    /dashboard/top-products?period=
GET    /dashboard/payment-breakdown?period=
GET    /dashboard/alerts?period=
GET    /dashboard/overview?period=
```

### Analítica / ML — `ml_router.py`
```
GET    /forecasts
POST   /forecasts/generate
GET    /anomalies
POST   /anomalies/detect
PATCH  /anomalies/{anomaly_id}/reviewed
GET    /purchase-recommendations?status=
POST   /purchase-recommendations/generate
PATCH  /purchase-recommendations/{recommendation_id}/status
POST   /ml/retrain
```

### Reportes — `reports_router.py`
```
GET    /reports/summary?from=&to=
GET    /reports/sales?from=&to=
GET    /reports/payments?from=&to=
GET    /reports/products?from=&to=
GET    /reports/inventory?from=&to=
POST   /reports/pdf                       # devuelve application/pdf
```

### Salud
```
GET    /health                            # {"status": "ok", "database": "ok"}
```

---

## 8. Seed reproducible

`backend/scripts/seed.py` es **idempotente**: puede correrse tantas veces como se quiera.

- **Usuarios**: Olga, Aylin, Angelo, Alejandro.
- **Métodos de pago**: Efectivo, Yape.
- **Categorías**: jugos, empanadas, queques, panes, gelatinas.
- **Grupos de opciones**: tamaño, fruta, base, endulzante, tipo, porción, relleno.
- **Productos demo**: jugo clásico, jugo especial, jugo surtido, empanada, queque, pan, gelatina.
- **Tamaños**: **personal / pareja / familiar** (el seed renombra los antiguos chico/mediano/grande).
- **Insumos** (con modelo de inventario profundo): papaya, fresa, naranja, piña, plátano, leche,
  algarrobina, agua, azúcar, harina, pollo, chorizo, pan, gelatina, huevo, milanesa de pollo.

Ejemplos del seed (unidad / empaque / factor / comportamiento):

| Insumo | base | purchase_unit | factor | behavioral |
|--------|------|---------------|--------|------------|
| agua | ml | Bidón 20L | 20000 | liquidos |
| leche | ml | Caja/Litro | 1000 | liquidos |
| algarrobina | ml | Botella 500ml | 500 | liquidos |
| azúcar | kg | Saco 10kg | 10000 | solidos |
| harina | kg | Saco 5kg | 5000 | solidos |
| pan | unidad | Ciento | 1 | unidades |
| huevo | unidad | Jaba 30u | 30 | unidades |
| chorizo | unidad | Paquete 12u | 12 | unidades |
| milanesa de pollo | unidad | Bandeja 10u | 10 | unidades |
| papaya / fresa | kg | kg | 1000 | frutas_verduras |

`_normalize_existing()` backfilea unidad natural y metadatos de inventario profundo para insumos ya
existentes (el seed es la fuente de verdad de los insumos demo).

---

## 9. Analítica y machine learning

`backend/app/infrastructure/ml/`:

- **Forecast de demanda** (`demand_forecast.py`): predicción de cantidad por producto/fecha + confianza.
- **Detección de anomalías** (`anomaly_detection.py`): desviaciones de venta esperada vs real.
- **Recomendaciones de compra** (`recommendations_engine.py`): sugiere cuánto comprar de cada insumo en
  función del consumo previsto, el stock actual y el mínimo (`recommend_purchase_quantity`, `unit_rounding`).
- Persistencia de modelos con `model_store.py` (joblib) y features en `features.py`.

Los resultados se exponen en el Dashboard (alertas), en la pestaña **Recomendaciones** de Productos y en
Reportes.

---

## 10. Arquitectura del frontend

```
frontend/src/
├── app/                # App, providers (TanStack Query), router, queryClient
├── components/
│   ├── charts/         # SalesBarChart, HorizontalRanking
│   ├── feedback/       # LoadingMessage
│   ├── layout/         # AppLayout (navbar de 5 destinos + barra inferior)
│   └── ui/             # Modal, SegmentedControl, StatusBadge, EmptyState, LiveMessage
├── features/
│   ├── dashboard/      # DashboardPage
│   ├── orders/         # OrdersPage (mesa / delivery / mostrador)
│   ├── products/       # ProductsPage, ProductRecipeEditor, StockModals
│   ├── reports/        # ReportsPage
│   └── sales/          # NewSalePage, ProductAssemblerModal, PaymentModal
├── hooks/              # useOnlineStatus, useSync
├── lib/                # api, currency, dates, ingredients, stock, schemas, offlineQueue, accessibility
├── store/              # cartStore (Zustand)
├── styles/             # tokens.css, globals.css (Tailwind v4)
├── tests/              # vitest
└── types/              # tipos espejo de los contratos del backend
```

### Navegación (5 destinos permanentes, una fila)

1. **Inicio** `/dashboard` — Panel de control.
2. **Registrar venta** `/sales/new` — Ensamblador universal de jugos y productos.
3. **Órdenes** `/orders` — Mesa, Delivery y Mostrador.
4. **Productos** `/products` — CRUD de catálogo + Insumos/Inventario integrado.
5. **Reportes** `/reports` — Ventas, pagos, stock y analítica.

### Capa de datos

- `lib/api.ts`: cliente fetch tipado con `VITE_API_BASE_URL`.
- TanStack Query para caché e invalidación por claves (`["ingredients"]`, `["products"]`, …).
- `store/cartStore.ts` (Zustand): carrito de venta.
- `lib/offlineQueue.ts` + `hooks/useSync.ts` + Service Worker: cola de operaciones offline con
  `Idempotency-Key`.

---

## 11. Interfaz de recetas (ensamblador 65/35)

`features/products/ProductRecipeEditor.tsx` — vista **administrador** para definir qué insumos descuenta
cada producto.

- **Layout 65% catálogo / 35% constructor** en tablet (`.recipe-editor__split`), sin teclado en la operación
  normal.
- **Pestañas de tamaño** (personal / pareja / familiar) como botones (`role="tab"`).
- **"Según lo que elige el cliente"**: un cuadro por opción (fruta, base, endulzante…) que arrastra el insumo
  ligado (`linked_ingredient_id`). Si la opción se elige en la venta, ese insumo se descuenta.
- **"Siempre lleva"** (constructor): buscador + cuadros candidatos; al tocar un insumo se añade y muestra sus
  **botones de incremento del comportamiento** (`+100 ml`, `+200 g`, `+1 u`, …). El marcador acumula la
  cantidad y hay un botón **[Limpiar]**.
- Contadores naturales ±1 (fresas, vasos) además de los saltos del comportamiento; si el insumo no tiene
  `unit_weight` se ofrece un campo en unidad base.
- **Copiar cantidades de otro tamaño** y **resumen en vivo**.
- **Migración automática** de recetas legacy (`size_multiplier`) a filas explícitas por tamaño.

Cada cuadro tiene ARIA explícita (`Agregar una {unidad} de {insumo}`, `Limpiar cantidad de {insumo}`,
`Buscar insumo para agregar a la receta`, etc.).

### Modal de producto (nuevo/editar) y sugerencia de precio

`features/products/ProductFormModal.tsx` es el modal de alta/edición, organizado en **5 pasos numerados**
(tipo, datos, precio, receta, opciones). Valida **en vivo** (nombre solo con letras, precio válido, insumos
contables sin decimales) y muestra en el pie lo que se va a guardar. El campo de precio usa prefijo `S/`.

La **sugerencia de precio base** (`lib/pricing.ts`) se calcula en el cliente para actualizarse mientras se
arma la receta, a partir de dos señales reales:

1. **Costo de la receta** (tamaño más pequeño): suma `cantidad × último costo de compra` de cada insumo.
   Los insumos que elige el cliente (fruta, base) se **promedian por grupo**, porque en cada venta se escoge
   una sola alternativa. El último costo de compra sale de `IngredientDTO.last_unit_cost`, derivado de la
   entrada de inventario más reciente que registró `unit_cost`.
2. **Productos comparables**: mínimo, mediana y máximo de los productos activos de la **misma categoría**
   (excluyendo el que se edita), como contraste de “lo que ya cobras por cosas parecidas”.

El precio sugerido = costo × (1 + margen) y se **redondea hacia arriba a múltiplos de S/ 0.50**; si la receta
aún no tiene costos, se ofrece la **mediana de los productos parecidos** (y si tampoco hay, se pide completar
la receta). El modal
oferta márgenes rápidos (40% / 60% / 80% / 120%), un botón **Usar** que escribe el precio, la ganancia real
del precio escrito, el aviso de insumos **sin costo registrado** y un desplegable con el desglose por insumo.

---

## 12. Traducción visual de stock y semáforo

`lib/stock.ts` implementa `formatStock`, `formatStockView` y `behaviorIncrements`.

**Traducción visual** (sección 8):

| Dato en BD | Texto mostrado |
|------------|----------------|
| `4250` ml | `4 Litros con 250 ml` |
| `12500` g | `12 kg con 500 g` |
| `8` unidad | `8 unidades` |

`formatStockView("Leche Entera", 4250, "ml", "🥛")` → `"🥛 Leche Entera: Quedan 4 Litros con 250 ml"`.

**Semáforo `StatusBadge`** (siempre con texto, sección 8/26.6):

| Estado | Condición | Fondo |
|--------|-----------|-------|
| 🔴 CRÍTICO | `current_stock <= min_stock_alert * 0.5` | rojo suave (`#FCE8E8`, equivalente a `#C92429` al 10%) |
| 🟡 BAJO | `> 0.5 * min` y `<= min` | crema (`#FFF1D6`) |
| 🟢 BIEN | `> min` | verde (`#E7F3E3`) |

---

## 13. Alta de insumos con control de duplicados

`features/products/StockModals.tsx` → `StockEntryModal`:

- El usuario elige un **insumo existente** o **crea uno nuevo** (segmentado táctil).
- Al crear, la categoría se elige con **cuadros** que fijan la unidad por defecto.
- **Detección reactiva de duplicados**: mientras escribe el nombre, si coincide con un insumo existente, el
  formulario se convierte en una pantalla de **REABASTECIMIENTO**:

  > *"¡Este insumo ya existe en tu inventario! Usa los botones de abajo para añadir stock rápidamente."*

  con un botón gigante de suma por empaque de compra (`+ 1 Caja/Litro (1000 ml)`), calculado a partir de
  `purchase_unit` y `conversion_factor`. El botón principal se deshabilita con la etiqueta “Insumo ya existe”.
- Permite registrar cuántas piezas llegaron (`unit_count`) y cómo se cuentan (`unit_name`) para aprender el
  peso por unidad.

---

## 14. Flujos de negocio de extremo a extremo

### 14.1 Registrar una venta
1. `Registrar venta` → se arma el pedido en el ensamblador (grupos single/multiple, multi-fruta en jugos).
2. El backend **recalcula** `unit_price = base + extras` y el total (el frontend nunca envía el total).
3. Si `pay_now`, se exige `payment_method_id` (1 Efectivo / 2 Yape); si no, la orden queda `en_preparacion`.
4. Se descuenta inventario en la misma transacción y se generan alertas de stock insuficiente (sin bloquear).

### 14.2 Órdenes
- Estados: `en_preparacion | pagado | cancelado`. Tipos: `mesa | delivery | mostrador` (mesa exige número).
- Cancelar **revierte** el inventario y no cuenta como venta en reportes.

### 14.3 Inventario
- **Entrada**: suma stock, calcula `unit_cost = total_cost / quantity`, puede aprender `unit_weight`.
- **Ajuste**: lleva el stock al conteo físico registrando la diferencia.
- **Movimientos**: entradas, salidas y ajustes consultables por fecha/insumo/tipo.

### 14.4 Offline
- Cola local (IndexedDB) + Service Worker; al reconectar se sincroniza con `Idempotency-Key`, evitando
  duplicados (`sync_requests`).

### 14.5 Reportes y PDF
- Reportes de ventas, pagos (efectivo/Yape), productos (top/lentos), inventario (stock bajo/compras) y
  exportación a PDF.

---

## 15. Sistema de diseño y accesibilidad

- **Tokens** (`styles/tokens.css`): colores de marca, semánticos (`--danger-bg`, `--warning-bg`,
  `--success-bg`), tipografía, radios, alturas táctiles (`--touch-comfort: 52px`, `--touch-large: 56px`) y
  punto de quiebre de navegación.
- **Tailwind v4** (`globals.css`): `@theme` mapea los tokens a utilidades; `@layer components` define las
  clases semánticas (`.btn`, `.card`, `.badge-*`, `.assembler-*`, `.restock-*`, etc.).
- Tipografía: **Nunito Sans** para operación; **Lora** solo en títulos principales (H1).
- Accesibilidad: `role="tab"`/`aria-pressed`, `aria-live` en acumuladores, `aria-label` descriptivos,
  estados siempre con texto, feedback inmediato (toasts/banners).

---

## 16. Verificación realizada

| Comprobación | Comando | Resultado |
|--------------|---------|-----------|
| Tests backend | `backend/.venv/bin/python -m pytest -q` | **37 passed** |
| Migración | `alembic upgrade head` | aplicada (`d4e5f6a7b8c9` head) |
| Seed | `python scripts/seed.py` | 16 insumos, 8 productos, 28 recetas |
| Tipo frontend | `npx tsc -b` | **exit 0** |
| Tests frontend | `npx vitest run` | **30 passed** (6 archivos) |
| Build frontend | `npm run build` | **exit 0** (PWA generada) |
| E2E API | script contra `:8001` | insumo unidad rechaza `2.5` (422) y acepta `12` (201); venta con receta por tamaño descuenta exactamente `0.06 kg` de fresa |

Pruebas nuevas relevantes:
- Backend: `TestConsumption::test_consumo_por_tamano_explicito`, `test_consumo_legacy_size_multiplier`,
  `TestInventoryEndpoints::test_entrada_aprende_peso_por_unidad`,
  `test_ingredients_incluyen_comportamiento_e_incrementos`, `test_insumo_unidad_rechaza_decimales`.
- Frontend: `tests/stock.test.ts` (formato de stock, conversión, incrementos, saneado de entradas) y el
  tercer caso de `productRecipeEditor.test.tsx` (botones de comportamiento + Limpiar).

---

## 17. Limitaciones conocidas

- **Sin navegador/headless en el entorno**: no fue posible una verificación visual pixel a pixel. La
  interfaz se validó con pruebas de componentes (Testing Library), type-check, build y la API real.
- **`consumption_unit` como espejo de `base_unit`**: por compatibilidad con el inventario y las recetas ya
  existentes, el stock sigue almacenado en `base_unit` (kg/ml/unidad). El frontend convierte gramos ⇄ kg para
  operar en la unidad mínima sin migración destructiva de datos.
- Los métodos de pago están **fijos por negocio**: `1 = Efectivo`, `2 = Yape` (no existe `/payment_methods`).
- El seed es de **demostración**: no debe mezclarse con datos reales de producción.
