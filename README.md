# TÍA JULIA — Ventas, Órdenes, Inventario y Analítica

Sistema web completo para la juguería familiar **Tía Julia**: reemplaza el registro manual en cuadernos, reduce el cierre de ventas a ~30 minutos y traduce los datos a decisiones simples ("La papaya está por agotarse: quedan 3.2 kg").

Diseñado con prioridad para **Sra. Olga (60+)**: tablet horizontal 1024×768, tipografía ≥18 px, targets táctiles ≥48 px, lenguaje cotidiano y una decisión principal por pantalla.

---

## 1. Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite, **Tailwind CSS v4**, React Router, TanStack Query, Zustand, Chart.js, Lucide, PWA (vite-plugin-pwa) |
| Backend | FastAPI + Pydantic v2, SQLAlchemy 2.x, Alembic, PostgreSQL (psycopg 3) |
| ML | scikit-learn (Regresión Lineal + Isolation Forest), pandas, joblib |
| PDF | ReportLab (+ matplotlib para gráficos rasterizados) |
| Offline | IndexedDB (`idb`) + Service Worker + cola FIFO con Idempotency-Key |

Comunicación **solo por API REST** en `/api/v1`. El backend es fuente de verdad de precios, totales y estados.

### Estilos — Tailwind CSS (sección 3.1)

Tailwind v4 es el sistema principal de estilos del frontend (integrado vía `@tailwindcss/vite`, sin Bootstrap ni frameworks de componentes visuales).

- **Design tokens expuestos:** la paleta Tía Julia, tipografías, tamaños, radios, sombras y breakpoints se declaran en el bloque `@theme` de `frontend/src/styles/globals.css`, que referencia las variables centralizadas de `frontend/src/styles/tokens.css` (fuente única de verdad). Se usan como utilidades (`bg-brand-red`, `text-h1`, `font-ui`, `shadow-modal`, `tablet:`, `desktop:`…).
- **Componentes:** botones, formularios, tarjetas, badges, KPIs y tablas se declaran con `@apply` en la capa `components`, conservando los nombres de clase existentes.
- **CSS personalizado mínimo y documentado:** `layout.css`/`responsive.css` cubren solo composición de layout, la curva orgánica del header y las restricciones del canvas de Chart.js que Tailwind no expresa de forma clara.

## 2. Estructura

```
tiajulia/
├── docker-compose.yml
├── frontend/                  # React + TS (arquitectura por features)
│   └── src/
│       ├── app/               # router, providers, query client
│       ├── components/        # ui, layout, charts, feedback
│       ├── features/          # dashboard, sales, orders, products, reports
│       ├── lib/               # api, currency, dates, offlineQueue, accessibility
│       ├── store/             # carrito Zustand
│       ├── styles/            # tailwind (@theme + capas en globals.css), tokens.css, responsive.css
│       └── tests/             # vitest
└── backend/                   # FastAPI (arquitectura hexagonal)
    ├── app/
    │   ├── core/              # config, database, logging, exceptions, timezone
    │   ├── domain/            # reglas puras: pricing, assembly, inventory, recommendations
    │   ├── application/       # use_cases, dto
    │   ├── infrastructure/    # db (models+repositories), ml, pdf, sync
    │   ├── presentation/      # routers FastAPI /api/v1
    │   └── tests/             # pytest unit + integración
    ├── scripts/               # seed.py, generate_demo_sales.py, train_models.py
    ├── models/                # modelos ML entrenados (joblib)
    └── app/infrastructure/db/migrations/  # migraciones Alembic
```

## 3. Inicio rápido

### Opción A — Docker (todo incluido)

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Swagger: http://localhost:8000/docs
- La primera vez ejecuta migraciones + seed + 12 semanas de ventas demo + entrenamiento ML.

### Opción B — Local

**Backend** (PostgreSQL 16+ corriendo):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env            # ajusta credenciales
alembic upgrade head
python scripts/seed.py          # catálogo demo idempotente
python scripts/generate_demo_sales.py   # 12 semanas, seed(42)
python scripts/train_models.py  # Regresión + Isolation Forest
uvicorn app.main:app --reload --port 8000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## 4. Tests

```bash
# backend (crea tiajulia_test automáticamente)
cd backend && pytest

# frontend
cd frontend && npm run test
```

Cobertura: cálculo de precio con extras, multi-fruta, total de orden, transiciones de estado, descuento de inventario por receta con multiplicador de tamaño, idempotencia offline, entrada/ajuste de stock, dashboard, PDF y formato de errores.

## 5. Funcionalidad por pantalla

| Ruta | Qué resuelve |
|---|---|
| `/dashboard` | Ventas hoy/semana/mes, Yape vs Efectivo, stock por revisar, compra recomendada, gráfico semanal con importes visibles, top productos, alertas |
| `/sales/new` | Registrar venta ≤1 min: Mesa/Delivery/Llevar, ensamblador universal (tamaño + frutas múltiples + base + endulzante), carrito con steppers, Guardar orden / Cobrar |
| `/orders` | Órdenes del día por estado con contadores, filtros visibles, agregar producto, marcar pagado (modal Efectivo/Yape), cancelar con confirmación |
| `/products` | Subpestañas: Productos (CRUD + grupos de opciones), Insumos (entradas con costo unitario, ajustes), Movimientos (filtros), Recomendaciones (motivo en lenguaje natural) |
| `/reports` | Hoy/semana/mes/personalizado, 6 subpestañas (Resumen, Ventas, Pagos, Productos, Stock y compras, Predicciones), anomalías revisables, exportación PDF por secciones |

### Modo offline

- Banda persistente: "Sin internet. Puedes seguir registrando ventas; se sincronizarán después."
- Cola FIFO en IndexedDB con `Idempotency-Key` (UUID) → el backend devuelve la misma orden sin duplicar (`sync_requests`).
- Errores de validación → estado `needs_attention` con banner "1 venta necesita revisión"; nunca se pierden datos.
- Cache de catálogo vía Service Worker (NetworkFirst).

### ML

- **Predicción de demanda** (Regresión Lineal por producto): features `day_of_week, is_friday, is_weekend, week_of_year, lag_7, rolling_mean_7, rolling_mean_28`; validación temporal (sin shuffle); métricas MAE/RMSE/R²; `confidence_score = clamp(R²·100, 0, 100)` documentado como heurística. Con <4 semanas: estado `insufficient_data`, nunca inventa resultados.
- **Anomalías** (Isolation Forest n=200, contamination=0.05, seed 42): traduce a `pico_venta`/`caida_venta` con descripción humana ("Ventas 25% menores de lo esperado para un domingo"), persiste esperado/real.
- **Recomendaciones de compra**: `recomendado = max(0, consumo_previsto + reserva_mínima − stock_actual)` redondeado por unidad (kg→0.5, ml→500, unid→entero), motivo en lenguaje natural.

## 6. Modelo de datos

14 tablas de negocio (sección 23 del README maestro) + 2 tablas técnicas explícitas:

- `recipe_components` (24.1): cantidad de insumo por producto/opción con multiplicador de tamaño → descuento automático real de inventario. Salida registrada en `inventory_movements` por cada venta; si el stock no alcanza, la venta **no se bloquea** y se devuelve alerta (26.5).
- `sync_requests` (24.2): idempotencia del modo offline.

Constraints CHECK, índices y orden de creación según spec (FK `options → ingredients` respetada).

## 7. API

Swagger completo en `http://localhost:8000/docs`. Formato de error consistente:

```json
{"error": {"code": "ORDER_NOT_FOUND", "message": "No encontramos esa orden.", "details": null}}
```

Principales grupos: `users`, `categories`, `products`, `option-groups`, `orders` (+pay/cancel/details), `ingredients`, `inventory` (entries/adjustments/movements), `dashboard` (summary/sales-series/top-products/alerts/overview), `forecasts`, `anomalies`, `purchase-recommendations`, `ml/retrain`, `reports` (+ `POST /reports/pdf` → `application/pdf`).

## 8. Privacidad y cumplimiento (35)

- Minimización: solo `customer_name` opcional; sin teléfonos ni direcciones.
- Sin nombres de clientes en PDF ni reportes agregados.
- Logs sin payloads personales; errores de producción sin stack traces.
- Trazabilidad por `user_id` en cada orden.
- Considera Ley 29733 (datos personales) y contexto MiPYME Ley 28015 como requisitos de diseño.

## 9. Decisiones documentadas

| Tema | Decisión |
|---|---|
| Total del pedido | Siempre recalculado en backend desde BD (nunca se acepta el del frontend) |
| Selección múltiple | Solo grupo "Fruta" y solo si `category.allows_multiple_ingredients`; validado en backend, no solo en UI |
| Descuento de inventario | Exigía tabla técnica `recipe_components` (migración explícita, no lógica escondida) |
| Idempotencia | Tabla `sync_requests` + header `Idempotency-Key` |
| Cancelación | Borrado lógico (`status='cancelado'`); pagadas requieren flujo administrativo futuro |
| Pago en efectivo | Vuelto solo visual; no se persiste (el esquema no lo contempla) |
| Verificación Yape | Checkbox obligatorio en el modal; sin campo de operación (no existe en BD) |
