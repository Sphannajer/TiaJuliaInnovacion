# TÍA JULIA — README MAESTRO DE DISEÑO, ARQUITECTURA E IMPLEMENTACIÓN

> **Este documento es también el PROMPT MASTER de construcción.** La IA/agente de desarrollo debe tratarlo como especificación funcional, visual y técnica obligatoria. No debe limitarse a crear mockups: debe entregar un sistema ejecutable, conectado a PostgreSQL, con frontend React, backend FastAPI, API REST, analítica, modelos de ML, exportación PDF, modo offline y seed reproducible.

---

## 0. INSTRUCCIÓN MAESTRA PARA LA IA

Construye de extremo a extremo el sistema web **Tía Julia — Ventas, Órdenes, Inventario y Analítica** para una juguería familiar. El público principal es una propietaria de más de 60 años con baja familiaridad tecnológica; por tanto, la solución debe priorizar **claridad, legibilidad, botones grandes, navegación predecible, lenguaje cotidiano y mínima carga cognitiva** por encima de efectos visuales, densidad de información o patrones “modernos” innecesarios.

Antes de implementar cualquier pantalla, aplicar estas reglas UX/UI transversales:

- El recorrido visual debe seguir **izquierda → derecha y arriba → abajo**.
- La interfaz debe usar activamente la paleta Tía Julia (`#C92429`, `#E99015`, `#4F9C3A`, `#F2D4A2`, `#F6F3E6`) sin sacrificar contraste.
- El navbar y los grupos de acciones no pueden romperse en varias filas en 1024×768.
- No usar `...` para ocultar títulos de navegación o acciones principales.
- Alertas, advertencias, errores y éxitos deben tener componentes visuales semánticos diferenciados.
- Tarjetas, gráficos, filas y métricas con información secundaria deben permitir exploración por clic/toque mediante tooltip accesible, modal o drawer.
- Toda interacción debe producir feedback visual inmediato.
- La simplificación para adultos mayores se logra reduciendo carga cognitiva, **no eliminando color, respuesta visual ni interactividad**.

La aplicación debe estar completamente funcional, no simulada. Implementa:

1. **Dashboard / Panel de control** con ventas diarias, semanales y mensuales, separación Yape/Efectivo, productos más vendidos, alertas de stock, anomalías, predicción de demanda y recomendaciones de compra.
2. **Registrar venta** con ensamblador universal, especialmente optimizado para jugos: tamaño + una o varias frutas + base + opciones adicionales.
3. **Órdenes** de Mesa, Delivery y Llevar/Mostrador; crear, modificar, agregar productos, marcar pagado, diferenciar Yape/Efectivo y cancelar.
4. **Productos e inventario**: CRUD de productos, categorías, opciones, insumos, entradas/salidas/ajustes de stock y recomendaciones de compra.
5. **Reportes**: día, semana, mes y rango personalizado; ventas, pagos, productos, inventario, anomalías, predicciones y exportación PDF.
6. **ML** con Python/scikit-learn: Regresión Lineal para predicción de demanda e Isolation Forest para anomalías.
7. **Modo offline** con cola local y sincronización automática al recuperar internet.
8. **Diseño responsivo**, con prioridad máxima para **tablet horizontal 1024×768**, luego escritorio y móvil.
9. **Accesibilidad**: tipografía mínima 18 px, targets táctiles ≥48 px, contraste WCAG AA, nunca depender solo de colores o iconos.
10. **Seed reproducible** para levantar el sistema con datos demostrativos útiles desde el primer `docker compose up` o desde la ejecución local.

No uses lorem ipsum, datos genéricos sin relación con la juguería, paneles vacíos, tarjetas repetitivas tipo plantilla, glassmorphism, gradientes artificiales, ilustraciones de IA, iconos sin texto ni microcopy ambiguo. El resultado debe parecer diseñado por un equipo humano que observó cómo trabaja la dueña del negocio.

---

# 1. CONTEXTO DEL PROYECTO

La juguería Tía Julia necesita reemplazar el registro manual en cuadernos y reducir la carga del cierre de ventas, especialmente la conciliación entre Yape y efectivo. El sistema debe traducir datos a decisiones simples, por ejemplo:

- “Hoy vendiste S/ 1,250”.
- “S/ 780 fueron en efectivo y S/ 470 por Yape”.
- “La papaya está por agotarse: quedan 3.2 kg”.
- “Para este fin de semana conviene comprar 5 kg de papaya”.
- “Las ventas del domingo fueron 25% menores de lo esperado”.

## 1.1 Objetivos de negocio que guían el diseño

- Reducir el tiempo de consolidación de ventas de más de 2 horas diarias a aproximadamente 30 minutos.
- Reducir errores de conciliación Yape/Efectivo.
- Reducir compras de emergencia.
- Incrementar decisiones de compra basadas en datos.
- Permitir registrar una venta de jugo en ≤1 minuto.
- Permitir crear/cerrar una orden completa en ≤2 minutos.
- Evitar que una caída de internet impida registrar ventas.

## 1.2 Usuario primario

**Sra. Olga / propietaria**

Características de diseño asumidas:

- Más de 60 años.
- Conocimiento profundo del negocio, pero baja familiaridad con software complejo.
- Trabaja con atención simultánea al cliente y preparación de productos.
- Necesita leer rápido y pulsar controles sin precisión fina.
- Usa tablet horizontal fija en mostrador como dispositivo prioritario.
- Debe poder completar acciones sin memorizar flujos ocultos.

## 1.3 Principio rector

> **Una pantalla = una decisión principal.**

Cada vista debe dejar claro qué puede hacer la usuaria, qué ocurrió y cuál es el siguiente paso.

---

# 2. ALCANCE FUNCIONAL

## 2.1 Módulos principales visibles en navegación

La navegación principal debe tener exactamente cinco destinos permanentes:

1. **Inicio** (`/dashboard`) — Panel de control.
2. **Registrar venta** (`/sales/new`).
3. **Órdenes** (`/orders`).
4. **Productos** (`/products`) — Incluye subpestañas de inventario.
5. **Reportes** (`/reports`).

No usar menú hamburguesa en tablet horizontal ni escritorio.

En móvil, usar una **barra inferior fija con icono + texto**, siempre visible, con los mismos cinco destinos. No esconder las funciones principales detrás de un botón “Más”.

## 2.2 Funciones secundarias

- Selección del usuario activo que está atendiendo.
- Estado de internet/sincronización.
- Gestión de insumos.
- Movimientos de inventario.
- Predicciones.
- Anomalías.
- Recomendaciones de compra.
- Exportación PDF.
- Configuración mínima de catálogo desde Productos.

---

# 3. STACK TECNOLÓGICO OBLIGATORIO

## 3.1 Frontend

- React + TypeScript.
- Vite.
- React Router.
- TanStack Query para estado de servidor/cache.
- Zustand para estado local del ensamblador/carrito si se necesita; mantenerlo pequeño.
- React Hook Form + Zod para formularios y validación.
- Chart.js como librería principal de gráficos.
- D3.js solo si un gráfico realmente requiere una interacción que Chart.js no resuelva; **no agregar D3 por obligación ni duplicar librerías sin necesidad**.
- Lucide React para iconografía consistente.
- IndexedDB mediante `idb` o Dexie para cola offline.
- PWA / Service Worker para resiliencia offline.
- **Tailwind CSS es obligatorio como sistema principal de estilos del frontend.** No usar Bootstrap ni otros frameworks CSS basados en componentes visuales predefinidos.
- Construir la interfaz con utilidades de Tailwind y componentes React propios, reutilizables y accesibles, para mantener el máximo control sobre tamaños, espaciado, estados, responsive, colores y comportamiento táctil.
- Todos los colores, tipografías, radios, sombras, espaciados y breakpoints definidos por Tía Julia deben centralizarse como **design tokens** y exponerse a Tailwind para evitar valores arbitrarios repetidos.
- Se permite CSS personalizado únicamente cuando Tailwind no resuelva de forma clara una necesidad específica (por ejemplo, alguna regla avanzada, integración de librerías o comportamiento muy particular). Mantenerlo mínimo y documentado.
- **No instalar ni utilizar Bootstrap, React-Bootstrap, Bootstrap Icons ni plantillas/temas Bootstrap.** Tampoco usar un tema de terceros que imponga una estética genérica o limite la personalización de la marca Tía Julia.
- Los componentes visuales deben diseñarse específicamente para este sistema; no copiar el aspecto por defecto de librerías de UI. Tailwind debe facilitar una interfaz altamente personalizable sin sacrificar accesibilidad, consistencia ni mantenibilidad.

## 3.2 Backend

- Python 3.12+.
- FastAPI.
- Pydantic v2.
- SQLAlchemy 2.x.
- Alembic para migraciones.
- PostgreSQL.
- psycopg 3.
- pandas.
- scikit-learn.
- joblib para persistencia de modelos.
- ReportLab o WeasyPrint para PDF; preferir ReportLab si se quiere minimizar dependencias del sistema operativo.
- Pytest para pruebas.

## 3.3 Base de datos

- PostgreSQL.
- Timezone de negocio: `America/Lima`.
- Moneda: PEN / Sol peruano.
- Formato de fecha mostrado: `dd/mm/yyyy`.
- Formato monetario mostrado: `S/ 1,250.00`.

## 3.4 Comunicación

Frontend y backend deben comunicarse **únicamente mediante API REST por HTTP/HTTPS**.

Base path:

```text
/api/v1
```

Respuestas JSON consistentes. No acoplar componentes React directamente a SQL o a librerías Python.

---

# 4. ESTRUCTURA DEL REPOSITORIO

Usar monorepo simple con dos carpetas principales obligatorias:

```text
tia-julia/
├── README.md
├── .gitignore
├── docker-compose.yml
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── .env.example
│   ├── public/
│   │   ├── logo-tia-julia.png
│   │   ├── icons/
│   │   └── manifest.webmanifest
│   └── src/
│       ├── app/
│       │   ├── App.tsx
│       │   ├── router.tsx
│       │   ├── queryClient.ts
│       │   └── providers.tsx
│       ├── assets/
│       ├── components/
│       │   ├── ui/
│       │   ├── layout/
│       │   ├── feedback/
│       │   └── charts/
│       ├── features/
│       │   ├── dashboard/
│       │   ├── sales/
│       │   ├── orders/
│       │   ├── products/
│       │   ├── inventory/
│       │   ├── reports/
│       │   ├── forecasts/
│       │   ├── anomalies/
│       │   ├── recommendations/
│       │   └── users/
│       ├── hooks/
│       ├── lib/
│       │   ├── api.ts
│       │   ├── currency.ts
│       │   ├── dates.ts
│       │   ├── offlineQueue.ts
│       │   └── accessibility.ts
│       ├── store/
│       ├── styles/
│       │   ├── tokens.css
│       │   ├── globals.css
│       │   └── responsive.css
│       ├── types/
│       └── tests/
│
└── backend/
    ├── pyproject.toml
    ├── alembic.ini
    ├── .env.example
    ├── app/
    │   ├── main.py
    │   ├── core/
    │   │   ├── config.py
    │   │   ├── database.py
    │   │   ├── logging.py
    │   │   ├── exceptions.py
    │   │   └── timezone.py
    │   ├── domain/
    │   │   ├── entities/
    │   │   ├── enums/
    │   │   ├── services/
    │   │   └── ports/
    │   ├── application/
    │   │   ├── use_cases/
    │   │   ├── dto/
    │   │   └── services/
    │   ├── infrastructure/
    │   │   ├── db/
    │   │   │   ├── models/
    │   │   │   ├── repositories/
    │   │   │   └── migrations/
    │   │   ├── ml/
    │   │   │   ├── demand_forecast.py
    │   │   │   ├── anomaly_detection.py
    │   │   │   ├── features.py
    │   │   │   └── model_store.py
    │   │   ├── pdf/
    │   │   └── sync/
    │   ├── presentation/
    │   │   └── api/
    │   │       └── v1/
    │   │           ├── routers/
    │   │           ├── schemas/
    │   │           └── dependencies/
    │   └── tests/
    │       ├── unit/
    │       ├── integration/
    │       └── api/
    ├── scripts/
    │   ├── seed.py
    │   ├── generate_demo_sales.py
    │   └── train_models.py
    └── models/
        └── .gitkeep
```

## 4.1 Criterio arquitectónico

Backend con arquitectura hexagonal/modular:

- `domain`: reglas de negocio puras, sin FastAPI ni SQLAlchemy.
- `application`: casos de uso.
- `infrastructure`: PostgreSQL, ML, PDF, sincronización.
- `presentation`: routers FastAPI y contratos HTTP.

Frontend con arquitectura por `features`, no por tipo genérico de archivo solamente. Cada feature puede incluir componentes, hooks, servicios y tests propios.

---

# 5. CONFIGURACIÓN DE ENTORNO

## 5.1 Backend `.env`

Para desarrollo local, crear `backend/.env`:

```env
APP_NAME="Tia Julia API"
APP_ENV="development"
API_V1_PREFIX="/api/v1"
DATABASE_URL="postgresql://postgres:privva12345@localhost:5432/tiajulia?schema=public"
TIMEZONE="America/Lima"
CORS_ORIGINS="http://localhost:5173"
ML_MODEL_DIR="./models"
REPORT_OUTPUT_DIR="./generated_reports"
LOG_LEVEL="INFO"
```

**Regla de seguridad:** este `.env` real no se versiona. `.env.example` debe llevar un valor placeholder o una contraseña local de ejemplo, nunca una credencial de producción.

## 5.2 Frontend `.env`

```env
VITE_API_BASE_URL="http://localhost:8000/api/v1"
VITE_APP_NAME="Tía Julia"
VITE_TIMEZONE="America/Lima"
```

---

# 6. IDENTIDAD VISUAL Y DESIGN TOKENS

La interfaz debe sentirse inequívocamente **Tía Julia**: cálida, fresca, familiar y con energía. La accesibilidad no debe convertirla en una interfaz gris, plana o genérica. Los colores de marca deben tener presencia real y controlada en navegación, encabezados, estados seleccionados, gráficos, tarjetas accionables y llamados a la acción.

## 6.1 Paleta obligatoria de marca

| Token | Color | Significado de marca | Uso UI principal |
|---|---:|---|---|
| `--brand-red` | `#C92429` | **Rojo Intenso.** Fuerza y dinamismo del nombre “Julia”. | CTA principal, indicador activo, acentos de alto énfasis y encabezados puntuales. |
| `--brand-orange` | `#E99015` | **Naranja Base.** Calidez, energía y referencia directa a los cítricos. | Navegación secundaria, destacados, gráficos, fondos cálidos y elementos de apoyo. |
| `--brand-green` | `#4F9C3A` | **Verde Fruta.** Frescura, naturaleza y salud. | Estados positivos, stock correcto, confirmaciones y acciones secundarias positivas. |
| `--brand-beige` | `#F2D4A2` | **Beige / Crema Claro.** Base visual del vaso y frutas del logotipo. | Fondos de bloques informativos, filtros suaves, superficies seleccionadas y contenedores de baja prioridad. |
| `--brand-bone` | `#F6F3E6` | **Blanco / Hueso.** Contraste y legibilidad del logotipo. | Fondo general, zonas de descanso visual y texto sobre fondos oscuros cuando corresponda. |

### Neutros y colores semánticos

| Token | Color | Uso |
|---|---:|---|
| `--text-main` | `#1B1B1B` | Texto principal |
| `--text-secondary` | `#3D3D3D` | Texto secundario; nunca gris muy claro |
| `--surface` | `#FFFFFF` | Tarjetas, formularios y modales |
| `--border` | `#D7D2C8` | Bordes visibles |
| `--focus` | `#1B5EAA` | Focus ring accesible |
| `--danger-bg` | `#FCE8E8` | Fondo de error o acción destructiva |
| `--warning-bg` | `#FFF1D6` | Fondo de advertencia |
| `--success-bg` | `#E7F3E3` | Fondo de estado correcto |
| `--info-bg` | `#EEF5FC` | Información neutra o ayuda contextual |

**Regla semántica importante:** el rojo de marca no significa automáticamente “error”. Una alerta destructiva debe reconocerse por **icono + título + texto + tratamiento semántico**, nunca únicamente porque algo sea rojo. El sistema debe poder usar `#C92429` como color de marca sin confundirlo con una falla.

## 6.2 Reglas de contraste y distribución del color

- **Rojo `#C92429` + blanco:** usar en botones grandes y elementos de alta jerarquía cuando el contraste sea validado.
- **Naranja `#E99015`:** acompañar con texto oscuro; no usar blanco en texto pequeño.
- **Verde `#4F9C3A`:** reservar principalmente para estados positivos, frescura e indicadores de inventario saludable.
- Beige y hueso siempre con texto oscuro.
- No usar texto gris claro sobre blanco.
- No pintar pantallas completas de rojo, naranja o verde. Aplicar el color para crear **ritmo visual, jerarquía y reconocimiento de marca**.
- En cada pantalla debe existir al menos un elemento de identidad visible —estado activo, encabezado, CTA, gráfico o acento— sin competir con el contenido.
- Los gráficos deben usar primero la paleta Tía Julia y luego variaciones accesibles; no recurrir por defecto al azul SaaS genérico.
- Evitar más de 3 colores fuertes simultáneos dentro de una misma zona visual.

## 6.3 Tipografía

Usar Google Fonts:

- **UI y cuerpo:** `Nunito Sans`.
- **Encabezados de marca o títulos muy puntuales:** `Lora`, máximo en H1/H2 cuando aporte identidad tradicional. No usar Lora en tablas, botones ni formularios.

Jerarquía:

```text
H1 página: 32 px / 38 px, 800
H2 sección: 26 px / 32 px, 800
H3 tarjeta: 22 px / 28 px, 700
Texto base: 18 px / 27 px, 500
Texto importante: 20 px / 28 px, 700
Dato KPI principal: 36–44 px / 1.1, 800
Botón: 18–20 px / 24 px, 800
Etiqueta de formulario: 18 px / 24 px, 700
Texto auxiliar mínimo: 16 px / 22 px únicamente en metadatos no críticos
```

**Nunca** usar texto funcional menor de 16 px. Para la mayor parte de la interfaz, mínimo real 18 px.

## 6.4 Bordes, radios y sombras

Evitar estética “IA/SaaS genérico”.

- Radio estándar: 10 px.
- Radio de modal: 14 px.
- Nada de tarjetas con radio 24–32 px repetidas por toda la pantalla.
- Sombra muy discreta solo para modales y barra fija.
- Tarjetas normales: borde de 1 px + fondo, sin sombra fuerte.
- No usar glassmorphism.
- No usar gradientes.

## 6.5 Formas orgánicas

La identidad tradicional/frutal puede aparecer en:

- Una curva naranja/beige sutil en el extremo del header.
- Separadores curvos en paneles informativos.
- Un pequeño semicírculo decorativo inspirado en cítricos.

No convertir cada tarjeta en una forma irregular. La utilidad sigue siendo prioritaria.

## 6.6 Iconos

Usar Lucide con tamaño 20–24 px.

Regla: **el icono refuerza el texto, nunca lo reemplaza**.

Correcto:

```text
[icono tarjeta] Registrar venta
[icono billetera] Marcar como pagado
[icono archivo] Exportar PDF
```

Incorrecto:

```text
[solo icono]
```

Los únicos iconos sin texto permitidos son controles universalmente reconocibles y con `aria-label`, por ejemplo cerrar modal `X`, pero aun así deben tener target mínimo 48×48 px.

---

# 7. REGLAS DE UX/UI — CLARIDAD PARA 50–60+ SIN PERDER INTERACTIVIDAD

La interfaz está diseñada para una persona mayor, pero **no debe sentirse infantil, estática ni simplificada en exceso**. Debe tener respuesta visual, exploración progresiva de información y una identidad viva. La regla es: **simple a primera vista, rica al interactuar**.

## 7.1 Orden de lectura y jerarquía espacial

El idioma principal es español, por lo que el recorrido natural de lectura es **izquierda → derecha y arriba → abajo**. Todas las pantallas deben respetar este patrón.

1. La información más importante aparece en el cuadrante superior izquierdo.
2. La acción principal aparece antes que acciones secundarias dentro del recorrido visual.
3. Los bloques deben seguir una secuencia lógica: **contexto → dato → decisión → acción**.
4. No colocar acciones relacionadas en extremos opuestos de la pantalla sin necesidad.
5. Mantener alineaciones consistentes; evitar tarjetas con alturas arbitrarias y elementos “flotando”.
6. Una fila no debe contener más información de la que puede leerse sin esfuerzo a 1024×768.
7. Usar espacio en blanco para separar grupos; no aumentar densidad reduciendo tipografía.
8. Cada pantalla debe tener un H1 claro, un breve contexto y una acción principal identificable en menos de 3 segundos.

## 7.2 Controles táctiles y botones

1. Targets táctiles mínimos 48×48 px; preferir 52–56 px de alto.
2. Separación entre botones: mínimo 8 px; ideal 12 px.
3. Botones con verbos claros: “Guardar orden”, “Cobrar S/ 37.00”, “Marcar como pagado”, “Registrar entrada de stock”.
4. Evitar “Aceptar” cuando puede decirse exactamente qué ocurrirá.
5. Máximo **un CTA primario por región funcional**.
6. El botón primario usa rojo de marca; acciones positivas secundarias pueden usar verde; acciones neutrales usan superficie clara con borde.
7. Un grupo de botones de acción **no puede saltar a una segunda fila** en el breakpoint objetivo de 1024×768.
8. No truncar acciones principales con `...`. Si falta espacio, reducir padding horizontal dentro del rango permitido, convertir acciones secundarias a un menú explícito `Más acciones`, o cambiar la composición; **nunca esconder la acción principal**.
9. Los botones deben tener estados `default`, `hover`, `pressed`, `focus-visible`, `disabled` y `loading`.
10. Nunca depender de hover para revelar una acción necesaria.

## 7.3 Navbar y navegación

1. Navegación principal lineal y permanente.
2. En tablet horizontal y escritorio, el navbar debe permanecer en **una sola fila**.
3. Sus cinco destinos deben entrar completos: `Inicio`, `Registrar venta`, `Órdenes`, `Productos`, `Reportes`.
4. Está prohibido mostrar destinos como `Registrar...`, `Produ...` o crear una segunda línea por falta de espacio.
5. El área de marca, navegación, sincronización y usuario debe tener ancho controlado mediante `flex`, `gap`, `min-width: 0` solo donde corresponda y prioridades explícitas de compresión.
6. Si el ancho cae por debajo del necesario, cambiar al patrón móvil definido; no deformar el navbar intermedio.
7. Estado activo: **color + forma** (subrayado, fondo o indicador), nunca solo color.
8. Al tocar usuario o sincronización se abre un popover legible con información adicional; no usar iconos ambiguos.

## 7.4 Interactividad y divulgación progresiva

No todo debe estar escrito simultáneamente en pantalla. Los detalles secundarios deben aparecer cuando la usuaria los solicita.

- **Tarjetas KPI clicables:** al tocar “Ventas de hoy”, abrir modal/drawer con desglose por hora, Yape/Efectivo y comparación.
- **Gráficos interactivos:** tocar una barra, punto o segmento abre tooltip grande y accesible; una segunda acción `Ver detalle` puede abrir modal.
- **Filas y columnas relevantes de tablas:** si representan una entidad o dato explorable, deben responder al toque/clic y abrir un detalle contextual.
- **Stock bajo:** tocar el insumo abre modal con stock actual, mínimo, últimos movimientos y recomendación.
- **Producto más vendido:** tocarlo muestra unidades, facturación y evolución del periodo.
- **Anomalía:** tocarla muestra qué ocurrió, por qué merece revisión y qué acción tomar.
- Todo elemento clicable debe parecer clicable mediante cursor, borde/fondo/estado pressed y focus visible; **no convertir texto normal en interacción invisible**.
- No abrir modal por cualquier celda decorativa. Solo los datos que tengan un detalle útil asociado deben ser interactivos.

## 7.5 Modales, drawers y detalle contextual

1. Usar modal cuando el detalle necesita atención sin perder el contexto de la pantalla.
2. Usar drawer cuando conviene comparar el detalle con una lista o tabla que debe permanecer visible.
3. Título del modal específico: `Detalle de ventas de hoy`, no `Información`.
4. Mostrar primero el resumen y después detalles secundarios.
5. Pie del modal estable: acción secundaria a la izquierda y primaria a la derecha.
6. Ningún modal debe tener más de una acción primaria.
7. Evitar modales dentro de modales. Si se requiere una operación compleja, navegar a una pantalla o reemplazar el contenido del modal.
8. Deben tener focus trap, cierre accesible, restauración de foco y scroll interno solo cuando sea necesario.

## 7.6 Alertas que realmente parezcan alertas

Crear un componente único `AlertBanner` / `AlertCard` con variantes `info`, `success`, `warning` y `danger`.

Toda alerta importante debe contener:

```text
[icono semántico] Título breve
Explicación de 1–2 líneas.
[Acción concreta opcional]
```

Reglas:

- `danger`: borde y fondo rojo suave, icono de alerta, título explícito.
- `warning`: fondo naranja/crema, icono de advertencia, texto oscuro.
- `success`: fondo verde suave, icono de confirmación.
- `info`: fondo neutro/azul claro solo como semántica de sistema, sin competir con la marca.
- La severidad nunca se comunica únicamente por color.
- No usar una tarjeta KPI normal para una alerta crítica.
- Las alertas persistentes de stock u offline deben conservarse hasta que cambie su estado o la usuaria las atienda.
- Los toasts se reservan para confirmaciones breves; no deben ser el único lugar donde se informe un error que requiere acción.

## 7.7 Reglas generales para adultos 50–60+

1. Nunca depender de hover.
2. No usar toasts como única confirmación: una acción importante debe dejar estado visible.
3. Errores al lado del campo y en lenguaje común.
4. No borrar datos sin modal de confirmación.
5. Botón primario siempre en posición consistente: abajo a la derecha en modales; ancho completo en móvil.
6. No usar scroll infinito. Usar paginación o `Ver más`.
7. Filtros visibles en tablet/escritorio.
8. Los gráficos muestran valores importantes directamente y permiten explorar detalles sin depender exclusivamente del tooltip.
9. No usar jerga de ML en la vista principal. Decir “Predicción de ventas”.
10. Si una acción tarda más de 500 ms, mostrar progreso legible: “Guardando venta…”.
11. Si no hay internet, mostrar banda persistente: “Sin internet. Puedes seguir vendiendo; se sincronizará después.”
12. Nunca bloquear ventas porque falle una predicción, un gráfico o un informe.
13. Animaciones cortas y funcionales (150–200 ms): entrada de modal, cambio de estado, press y expansión. No usar rebotes, parallax ni animaciones ornamentales.
14. La interfaz debe sentirse receptiva: cada toque debe producir feedback visual inmediato.

---

# 8. RESPONSIVE Y LAYOUT

## 8.1 Breakpoints de referencia

```text
Móvil:        360–767 px
Tablet:       768–1199 px
Escritorio:   1200 px+
```

El caso de prueba obligatorio es **1024×768 en horizontal**.

## 8.2 Tablet horizontal 1024×768 — prioridad máxima

- Header fijo de 72–80 px.
- Navegación principal horizontal.
- Contenido con padding 20–24 px.
- Grid dashboard: 3 columnas en la franja superior.
- Registrar venta: panel catálogo 62–64% + resumen de orden 36–38%.
- Productos: 3 columnas de tiles como máximo si el texto conserva 18 px.
- Órdenes: 2 tarjetas por fila.
- Modales: ancho máx. 840 px, alto máx. 90vh y contenido interno scrollable solo si es inevitable.
- Sin scroll horizontal.

## 8.3 Escritorio

- Max width de contenido: 1440 px.
- No estirar tarjetas indefinidamente.
- Registrar venta puede usar 68/32.
- Dashboard puede mantener 3 columnas superiores y 2 columnas inferiores.

## 8.4 Móvil

- Barra inferior fija con 5 destinos.
- Las vistas se convierten a una sola columna.
- En Registrar venta, el carrito/resumen se abre como pantalla completa o drawer inferior grande al pulsar “Ver pedido (3)”.
- Modales complejos se vuelven full-screen sheet.
- No reducir tipografía para “hacer entrar” contenido.

---

# 9. NAVEGACIÓN PRINCIPAL

Header tablet/escritorio, siempre en una sola línea visual:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo]  Inicio  Registrar venta  Órdenes  Productos  Reportes   [● Sincronizado] [Olga ▾]│
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Características obligatorias:

- Orden de izquierda a derecha: **marca → navegación → estado del sistema → usuario**.
- `Inicio` debe ser el primer destino y `Reportes` el último destino funcional.
- `Registrar venta` puede tener mayor énfasis visual por frecuencia de uso, pero sin alterar el orden.
- Item activo: fondo o subrayado rojo de alta visibilidad + texto en negrita.
- No usar solo cambio de color para indicar selección.
- **No permitir `flex-wrap` en el navbar.**
- **No permitir ellipsis en los cinco destinos principales.**
- No reducir texto por debajo de 18 px para hacer entrar la navegación.
- El logo puede compactarse dentro de límites definidos antes de sacrificar legibilidad de los destinos.
- Estado de sincronización con texto explícito: `Sincronizado`, `3 ventas pendientes`, `Sin internet`.
- Al tocar el estado de sincronización, abrir popover/modal pequeño con última sincronización y ventas pendientes.
- Usuario activo a la derecha; al tocarlo, abrir selector simple.
- El breakpoint debe cambiar al patrón móvil **antes** de que los elementos se monten, salten de línea o aparezcan cortados.

### Prioridades de espacio del header

```text
1. Navegación principal: nunca truncar.
2. CTA / destino Registrar venta: nunca ocultar.
3. Usuario: conservar nombre corto; detalle completo en popover.
4. Sincronización: puede pasar de “Sincronizado hace 1 min” a “Sincronizado”.
5. Logotipo: puede usar versión compacta definida por diseño.
```

---

# 10. PANTALLA 1 — DASHBOARD / INICIO

Ruta: `/dashboard`

Título visible:

```text
Panel de control
Hoy, domingo 4 de octubre
```

Debajo, filtro temporal simple:

```text
[Hoy] [Esta semana] [Este mes]
```

No mostrar un selector de fechas complejo por defecto; dejar “Personalizado” para Reportes.

## 10.1 Fila superior — 3 bloques accionables

### A. Ventas de hoy

Contenido:

```text
Ventas de hoy
S/ 1,250.00

Efectivo  S/ 780.00
Yape      S/ 470.00

[Ver cierre del día]
```

- Dato principal 40–44 px.
- Efectivo y Yape como dos filas grandes, no como donut pequeño.
- Botón descriptivo.

### B. Stock que necesita atención

Mostrar máximo 3 insumos críticos:

```text
Stock por revisar
Papaya     Quedan 3.2 kg    BAJO
Harina     Quedan 2.0 kg    BAJO
Chorizo    Quedan 4 unid.   BAJO

[Ver todos los insumos]
```

- Estado “BAJO” con color + texto.
- No usar solo punto rojo.

### C. Compra recomendada

```text
Compra recomendada
Para viernes–domingo

Papaya     Comprar 5 kg
Naranja    Comprar 8 kg
Leche      Comprar 6 L

[Ver recomendación completa]
```

Si aún no hay datos suficientes:

```text
Todavía no hay suficientes ventas para calcular una recomendación confiable.
Necesitamos al menos 4 semanas de datos.
```

Nunca inventar predicciones.

## 10.2 Gráfico principal — Ventas de esta semana

Chart.js, barras verticales.

- 7 barras: Lunes–Domingo.
- Mostrar importe encima de cada barra.
- Eje Y con importes simples.
- Labels mínimo 16–18 px.
- No usar leyenda si hay una sola serie.
- El día actual debe llevar texto `(Hoy)` además de un acento visual.
- Al tocar una barra, mostrar panel inferior sencillo:

```text
Sábado 03/10
Ventas: S/ 1,680.00
Órdenes: 94
Yape: S/ 640.00
Efectivo: S/ 1,040.00
```

## 10.3 Fila inferior

### Productos más vendidos

Gráfico de barras horizontal, top 5.

Ejemplo:

```text
1. Jugo Especial       84
2. Jugo de Papaya      71
3. Empanada de Pollo   52
4. Queque               34
5. Pan con Pollo        28
```

Mostrar cantidad directamente al final de cada barra.

### Alertas recientes

Lista, no tarjetas clónicas.

Ejemplo:

```text
[!] Ventas del domingo fueron 25% menores de lo esperado.   [Revisar]
[!] Papaya llegó al stock mínimo.                            [Ver stock]
[i] Predicción del fin de semana actualizada.                [Ver]
```

Máximo 4 alertas en dashboard; el resto va a Reportes.

## 10.4 Estados vacíos

No usar ilustraciones genéricas.

Ejemplo:

```text
Aún no hay ventas registradas hoy.
Cuando registres la primera venta, aquí aparecerá el total del día.

[Registrar primera venta]
```

---

# 11. PANTALLA 2 — REGISTRAR VENTA

Ruta: `/sales/new`

Objetivo: que una venta de jugo pueda registrarse en ≤1 minuto.

## 11.1 Estructura tablet/escritorio

```text
┌───────────────────────────────────────┬──────────────────────────────┐
│ Registrar venta                       │ Pedido actual                 │
│ [Mesa] [Delivery] [Llevar]            │ Tipo: Llevar                 │
│                                       │                              │
│ Categorías                            │ 1 Jugo Especial        S/ 10 │
│ [Jugos] [Empanadas] [Queques] [...]   │   Grande · Papaya/Fresa      │
│                                       │   Leche · Sin azúcar         │
│ Productos                             │ [Editar] [Quitar]             │
│ [tile] [tile] [tile]                  │                              │
│ [tile] [tile] [tile]                  │ 2 Empanadas           S/ 8  │
│                                       │                              │
│                                       │ Total                S/ 18  │
│                                       │                              │
│                                       │ [Guardar orden]              │
│                                       │ [Cobrar S/ 18.00]            │
└───────────────────────────────────────┴──────────────────────────────┘
```

## 11.2 Tipo de orden

Segmented control grande:

- Mesa
- Delivery
- Llevar

Valores DB:

```text
Mesa      -> mesa
Delivery  -> delivery
Llevar    -> mostrador
```

### Si es Mesa

Mostrar campo grande:

```text
Número o nombre de mesa
[ Mesa 4________________ ]
```

`table_number` requerido para Mesa.

### Si es Delivery

Mostrar:

```text
Nombre del cliente
[ María López____________ ]
```

No recolectar teléfono/dirección porque el esquema actual no los contempla y el principio de privacidad exige minimización.

### Si es Llevar

Nombre de cliente opcional, oculto por defecto con enlace explícito:

`+ Agregar nombre del cliente`

## 11.3 Categorías

Botones horizontales grandes, con texto:

```text
[Jugos] [Empanadas] [Queques] [Panes] [Gelatinas]
```

- Alto mínimo 52 px.
- Activo con borde + fondo, no solo color.
- En tablet, permitir wrap a dos filas si es necesario.

## 11.4 Tarjeta de producto

Cada tile debe mostrar:

```text
Jugo Especial
Desde S/ 10.00
[Agregar]
```

Opcionalmente foto real si existe y es consistente; si no hay fotos reales, **no usar imágenes generadas**. Es mejor un tile tipográfico limpio.

## 11.5 Comportamiento por producto

### Producto con opciones

Abrir modal **Configurar producto**.

### Producto sin opciones

Añadir inmediatamente al pedido y mostrar confirmación visible dentro del panel:

```text
Empanada agregada al pedido.
```

No depender únicamente de toast.

## 11.6 Resumen del pedido

Cada línea:

- Cantidad grande con `−` y `+`.
- Nombre.
- Configuración legible.
- Precio de línea.
- Botones textuales “Editar” y “Quitar”.

Al final:

```text
Subtotal    S/ 18.00
Total       S/ 18.00
```

No hay impuestos/descuentos en el esquema actual; no mostrar campos ficticios.

## 11.7 CTA final

- `Guardar orden` crea `en_preparacion` sin pago.
- `Cobrar S/ XX.XX` abre modal de pago y, al confirmar, guarda orden con `status='pagado'`.

Para una venta directa de mostrador, `Cobrar` debe ser visualmente primario.

---

# 12. MODAL PRINCIPAL — CONFIGURAR / ENSAMBLAR PRODUCTO

Modal clave para Jugos.

Ancho tablet: 760–840 px.

Título:

```text
Preparar Jugo Especial
```

Subtexto:

```text
Elige tamaño, frutas y base.
```

## 12.1 Diseño de opciones

No usar selects pequeños.

### Tamaño — selección única

```text
Tamaño
[Chico] [Mediano] [Grande +S/ 2]
```

### Fruta — selección múltiple solo cuando la categoría lo permite

```text
Frutas
Puedes elegir más de una.
[Papaya] [Fresa +S/ 0.50] [Naranja] [Piña] [Plátano]
```

Cada selección debe mostrar check visible y fondo/borde activo.

### Base — selección única

```text
Base
[Agua] [Leche +S/ 2]
```

### Endulzante — si el producto lo tiene

```text
Endulzante
[Sin azúcar] [Azúcar]
```

## 12.2 Resumen fijo en el modal

```text
Tu jugo
Grande
Papaya + Fresa
Leche
Sin azúcar

Precio: S/ 12.50
```

## 12.3 Cantidad

```text
Cantidad
[ − ]   1   [ + ]
```

Targets ≥52 px.

## 12.4 Botones

```text
[Cancelar]                 [Agregar al pedido · S/ 12.50]
```

Si falta una selección requerida, no cerrar modal y mostrar el mensaje junto al grupo:

`Elige una base para continuar.`

---

# 13. MODAL DE PAGO

Título:

```text
Cobrar pedido
```

Dato principal:

```text
Total a cobrar
S/ 37.00
```

Pregunta:

```text
¿Cómo pagó el cliente?
```

Dos botones grandes:

```text
[Efectivo]
[Yape]
```

Ambos con texto + icono complementario.

## 13.1 Si elige Efectivo

Mostrar opcionalmente:

```text
Monto recibido
[ S/ 50.00 ]

Vuelto
S/ 13.00
```

El “monto recibido” y “vuelto” son de apoyo visual y no necesitan persistirse en las tablas actuales.

Botón final:

`Confirmar pago en efectivo`

## 13.2 Si elige Yape

Mostrar texto simple:

```text
Confirma que el pago ya aparece en el Yape del negocio.
```

Checkbox/toggle grande:

`[ ] Sí, ya verifiqué el pago`

El botón `Confirmar pago por Yape` se habilita solo después de la confirmación.

Esto reduce errores sin introducir un campo de operación que la base actual no almacena.

## 13.3 Resultado

Tras guardar:

```text
Pago registrado correctamente
Orden #046 · S/ 37.00 · Yape

[Registrar otra venta] [Ver orden]
```

---

# 14. PANTALLA 3 — ÓRDENES

Ruta: `/orders`

Título:

```text
Órdenes del día
```

## 14.1 Pestañas principales

```text
[En preparación 8] [Pagadas 18] [Canceladas 2]
```

Mapeo:

```text
en_preparacion
pagado
cancelado
```

## 14.2 Filtros visibles

```text
Fecha: [Hoy ▾]
Tipo:  [Todos] [Mesa] [Delivery] [Llevar]
Buscar: [Cliente, mesa o número de orden________]
```

No ocultarlos detrás de un botón de filtro en tablet/escritorio.

## 14.3 Tarjeta de orden

Ejemplo:

```text
#046        10:41 a. m.         MESA 4
María López

2 × Jugo Especial — Grande, Papaya, Leche
1 × Empanada de Pollo

Total a cobrar
S/ 37.00

[Agregar producto] [Marcar como pagado]
[Cancelar orden]
```

- 2 cards por fila en tablet.
- Acción primaria clara.
- Cancelar como acción secundaria/destructiva, visualmente separada.

## 14.4 Orden pagada

Mostrar:

```text
PAGADO · Yape
```

No ofrecer cambios destructivos por defecto.

## 14.5 Acciones

- `Agregar producto` → modal selector de producto.
- `Marcar como pagado` → modal de pago.
- `Cancelar orden` → modal de confirmación.
- Tocar cabecera → detalle de orden en drawer/modal legible.

---

# 15. MODAL — AGREGAR PRODUCTOS A ORDEN

Reutiliza el mismo catálogo de Registrar venta.

- Categorías grandes.
- Tiles de producto.
- Si producto tiene opciones, abre ensamblador.
- Parte inferior persistente:

```text
Se agregarán 2 productos · S/ 14.00
[Cancelar] [Agregar a la orden]
```

Al confirmar, recalcular `total_amount` en backend dentro de la misma transacción.

---

# 16. MODAL — CANCELAR ORDEN

Nunca cancelar con un clic accidental.

```text
Cancelar orden #046

Esta orden dejará de contarse como venta.
¿Deseas continuar?

[No, volver] [Sí, cancelar orden]
```

No eliminar físicamente la orden. Cambiar `status='cancelado'`.

---

# 17. PANTALLA 4 — PRODUCTOS

Ruta: `/products`

No crear módulos ocultos separados. Dentro de Productos usar subpestañas visibles:

```text
[Productos] [Insumos] [Movimientos] [Recomendaciones]
```

## 17.1 Subpestaña Productos

Header:

```text
Productos
[+ Nuevo producto]
```

Filtros:

```text
Buscar producto [____________________]
Categoría [Todas ▾]
Estado [Activos ▾]
```

Tabla/lista táctil:

```text
Jugo Especial   Jugos       S/ 10.00   Activo   [Editar]
Empanada        Empanadas   S/ 4.00    Activo   [Editar]
Queque          Queques     S/ 4.50    Activo   [Editar]
```

Evitar iconos minúsculos de lápiz como única acción.

## 17.2 Modal Nuevo/Editar producto

Campos:

```text
Nombre del producto
Categoría
Precio base
Estado activo/inactivo
Grupos de opciones aplicables
```

Ejemplo de grupos:

- Tamaño
- Fruta
- Base
- Endulzante
- Tipo
- Porción
- Relleno

La selección de grupos debe mostrarse con checkboxes grandes y texto.

Botones:

```text
[Cancelar] [Guardar producto]
```

## 17.3 Subpestaña Insumos

Título:

```text
Insumos e inventario
[+ Registrar entrada]
```

Tabla/lista:

```text
Papaya    Fruta     3.200 kg    Mínimo 5.000 kg    BAJO    [Ver]
Leche     Lácteo    8,000 ml    Mínimo 3,000 ml    BIEN    [Ver]
Harina    Abarrote  2.000 kg    Mínimo 5.000 kg    BAJO    [Ver]
```

Los valores críticos deben estar en lenguaje humano:

`Quedan 3.2 kg` mejor que `current_stock = 3.200`.

## 17.4 Modal Registrar entrada de stock

```text
Registrar entrada de mercadería

Insumo         [Papaya ▾]
Cantidad       [5.500] [kg]
Costo total    [S/ 25.00]

Costo por kg
S/ 4.545  (calculado automáticamente)

[Cancelar] [Registrar entrada]
```

Backend calcula:

```text
unit_cost = total_cost / quantity
```

Dentro de transacción:

1. insertar `inventory_movements` tipo `entrada`;
2. sumar `quantity` a `ingredients.current_stock`;
3. actualizar `updated_at`.

## 17.5 Modal Ajustar stock

```text
Ajustar stock de Papaya
Stock actual: 3.2 kg

Nuevo stock: [4.0] kg
Motivo: [Conteo físico________________]

[Cancelar] [Guardar ajuste]
```

Como la tabla no tiene campo `reason`, el MVP puede registrar el movimiento `ajuste` y dejar la observación en logs de aplicación. Si se exige auditoría persistente, agregar una migración posterior con `notes` en `inventory_movements`.

## 17.6 Subpestaña Movimientos

Filtros:

- Hoy / Semana / Mes / Personalizado.
- Insumo.
- Tipo: Entrada / Salida / Ajuste.

Columnas:

```text
Fecha · Insumo · Movimiento · Cantidad · Costo · Referencia
```

## 17.7 Subpestaña Recomendaciones

Lista simple:

```text
Papaya
Comprar 5 kg
Motivo: La demanda esperada del fin de semana supera el stock actual.
[Marcar como realizada]

Naranja
Comprar 8 kg
Motivo: Stock actual + consumo esperado dejarían menos del mínimo.
[Marcar como realizada]
```

Mapear `purchase_recommendations.status` a:

```text
pendiente
realizada
descartada
```

Si se quiere mantener exactamente el valor inicial `pendiente`, los otros estados son convenciones de aplicación válidas para `VARCHAR(20)`.

---

# 18. MODAL — DETALLE DE RECOMENDACIÓN DE COMPRA

```text
Recomendación para Papaya

Stock actual        3.2 kg
Consumo esperado    6.1 kg
Stock mínimo        5.0 kg

Recomendación
Comprar 8 kg

¿Por qué?
Las ventas previstas para viernes, sábado y domingo son mayores al promedio y el stock actual no alcanza el mínimo deseado.

[Descartar] [Marcar como realizada]
```

Nunca mostrar ecuaciones ni coeficientes de regresión a la usuaria principal.

---

# 19. PANTALLA 5 — REPORTES

Ruta: `/reports`

Título:

```text
Reportes
```

## 19.1 Selector temporal principal

```text
[Hoy] [Esta semana] [Este mes] [Personalizado]
```

Si elige Personalizado:

```text
Desde [04/09/2026]  Hasta [04/10/2026]  [Aplicar]
```

A la derecha:

`[Exportar PDF]`

## 19.2 Subpestañas de reportes

```text
[Resumen] [Ventas] [Pagos] [Productos] [Stock y compras] [Predicciones]
```

En móvil, usar scroll horizontal controlado de tabs, no menú oculto.

## 19.3 Resumen

KPI grandes:

```text
Ventas totales      S/ 8,420.00
Órdenes pagadas     417
Ticket promedio     S/ 20.19
Día más fuerte      Sábado
```

Luego gráfico de ventas por día.

Después:

```text
Efectivo: S/ 5,220.00
Yape:     S/ 3,200.00
```

## 19.4 Ventas

- Barras por día/semana/mes según rango.
- Tabla debajo con valores exactos.
- Filtrar por tipo de orden.
- No mostrar líneas demasiado densas.

## 19.5 Pagos

Preferir comparación directa en barras o dos bloques numéricos sobre un donut.

```text
Efectivo 62% · S/ 5,220
Yape     38% · S/ 3,200
```

## 19.6 Productos

Dos rankings:

- Más vendidos.
- Menor movimiento.

Usar barras horizontales y tabla.

## 19.7 Stock y compras

- Insumos bajo mínimo.
- Entradas compradas en periodo.
- Recomendaciones pendientes/realizadas.
- Historial de costos unitarios si existen movimientos con costo.

## 19.8 Predicciones

Mostrar lenguaje de negocio:

```text
Próximo sábado
Se esperan 92–108 ventas de Jugo Especial.
Tendencia: mayor que el promedio reciente.
Confianza del modelo: 78/100.
```

Si `confidence_score` es bajo (<50), decir:

`Predicción de baja confianza. Úsala solo como referencia.`

## 19.9 Anomalías

Lista cronológica:

```text
03/10/2026 · Caída de ventas
Se vendió 25% menos de lo esperado.
Esperado: S/ 1,600 · Real: S/ 1,200
[Marcar como revisada]
```

Diferenciar tipo mediante texto + icono, no solo color.

---

# 20. MODAL — EXPORTAR PDF

```text
Exportar reporte en PDF

Periodo
[Hoy] [Esta semana] [Este mes] [Personalizado]

Incluir:
[x] Resumen de ventas
[x] Yape vs Efectivo
[x] Productos más vendidos
[x] Stock bajo
[x] Recomendaciones de compra
[x] Predicciones y anomalías

[Cancelar] [Generar PDF]
```

Al generar:

- mostrar `Generando reporte…`;
- backend devuelve `application/pdf`;
- nombre de archivo:

```text
reporte_tia_julia_2026-10-04.pdf
```

Contenido PDF:

1. Logo y título Tía Julia.
2. Periodo.
3. Fecha/hora de generación.
4. Resumen.
5. Ventas.
6. Pagos.
7. Productos.
8. Stock/compras.
9. Predicciones/anomalías.
10. Pie “Datos generados por el sistema Tía Julia”.

No incluir nombres de clientes por defecto.

---

# 21. MODAL — DETALLE DE ANOMALÍA

```text
Venta inusual detectada

Domingo 04/10/2026
Tipo: Caída de ventas

Esperado: S/ 1,600
Real:     S/ 1,200
Diferencia: -25%

Qué significa
Las ventas fueron bastante menores a lo normal para un domingo.

[Volver] [Marcar como revisada]
```

Al confirmar, `sales_anomalies.is_reviewed = TRUE`.

---

# 22. SELECCIÓN DE USUARIO ACTIVO

La tabla `users` no tiene contraseñas, así que no implementar autenticación falsa.

En primer ingreso del dispositivo, mostrar modal:

```text
¿Quién está atendiendo hoy?

[Olga]
[Aylin]
[Angelo]
[Alejandro]

[Continuar]
```

Guardar el `user_id` seleccionado en almacenamiento local y enviarlo en cada orden.

En header, permitir cambiar usuario:

`Atendiendo: Olga ▾`

No confundir este selector con un sistema de seguridad. Si en el futuro se necesita autenticación, será otra capa.

---

# 23. MODELO DE DATOS BASE

Crear las tablas de negocio indicadas por el proyecto. **Importante:** para ejecutar las migraciones sin errores de FK, `ingredients` debe crearse antes de `options`, porque `options.linked_ingredient_id` referencia `ingredients(id)`.

## 23.1 Orden recomendado de migración

1. `users`
2. `payment_methods`
3. `categories`
4. `ingredients`
5. `products`
6. `option_groups`
7. `options`
8. `product_option_groups`
9. `orders`
10. `order_details`
11. `inventory_movements`
12. `demand_forecasts`
13. `sales_anomalies`
14. `purchase_recommendations`

## 23.2 SQL base de negocio

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    allows_multiple_ingredients BOOLEAN DEFAULT FALSE
);

CREATE TABLE ingredients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    base_unit VARCHAR(20) NOT NULL,
    current_stock DECIMAL(10, 3) DEFAULT 0.000,
    min_stock_alert DECIMAL(10, 3) DEFAULT 5.000,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES categories(id),
    name VARCHAR(150) NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE option_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);

CREATE TABLE options (
    id SERIAL PRIMARY KEY,
    group_id INT REFERENCES option_groups(id),
    name VARCHAR(100) NOT NULL,
    extra_cost DECIMAL(10, 2) DEFAULT 0.00,
    linked_ingredient_id INT NULL REFERENCES ingredients(id),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE product_option_groups (
    product_id INT REFERENCES products(id),
    group_id INT REFERENCES option_groups(id),
    PRIMARY KEY (product_id, group_id)
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    order_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'en_preparacion',
    customer_name VARCHAR(100),
    table_number VARCHAR(10),
    total_amount DECIMAL(10, 2) DEFAULT 0.00,
    payment_method_id INT REFERENCES payment_methods(id),
    sync_status VARCHAR(20) DEFAULT 'synced',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_details (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id),
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    assembly_config JSONB,
    notes VARCHAR(255)
);

CREATE TABLE inventory_movements (
    id SERIAL PRIMARY KEY,
    ingredient_id INT REFERENCES ingredients(id),
    movement_type VARCHAR(20) NOT NULL,
    quantity DECIMAL(10, 3) NOT NULL,
    total_cost DECIMAL(10, 2) NULL,
    unit_cost DECIMAL(10, 3) NULL,
    reference_id INT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE demand_forecasts (
    id SERIAL PRIMARY KEY,
    forecast_date DATE NOT NULL,
    product_id INT REFERENCES products(id),
    predicted_quantity DECIMAL(10, 2) NOT NULL,
    confidence_score DECIMAL(5, 2),
    model_version VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sales_anomalies (
    id SERIAL PRIMARY KEY,
    detected_date DATE NOT NULL,
    anomaly_type VARCHAR(50),
    description TEXT,
    expected_value DECIMAL(10, 2),
    actual_value DECIMAL(10, 2),
    is_reviewed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE purchase_recommendations (
    id SERIAL PRIMARY KEY,
    ingredient_id INT REFERENCES ingredients(id),
    recommended_quantity DECIMAL(10, 2) NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pendiente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## 23.3 Constraints recomendados

Agregar mediante Alembic:

```sql
ALTER TABLE orders
ADD CONSTRAINT ck_orders_order_type
CHECK (order_type IN ('mesa', 'delivery', 'mostrador'));

ALTER TABLE orders
ADD CONSTRAINT ck_orders_status
CHECK (status IN ('en_preparacion', 'pagado', 'cancelado'));

ALTER TABLE orders
ADD CONSTRAINT ck_orders_sync_status
CHECK (sync_status IN ('pending', 'synced'));

ALTER TABLE inventory_movements
ADD CONSTRAINT ck_inventory_movement_type
CHECK (movement_type IN ('entrada', 'salida', 'ajuste'));

ALTER TABLE order_details
ADD CONSTRAINT ck_order_details_quantity_positive
CHECK (quantity > 0);
```

Índices:

```sql
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_status_created_at ON orders(status, created_at);
CREATE INDEX idx_orders_payment_method ON orders(payment_method_id);
CREATE INDEX idx_order_details_order_id ON order_details(order_id);
CREATE INDEX idx_order_details_product_id ON order_details(product_id);
CREATE INDEX idx_inventory_movements_ingredient_date ON inventory_movements(ingredient_id, created_at);
CREATE INDEX idx_forecasts_product_date ON demand_forecasts(product_id, forecast_date);
CREATE INDEX idx_anomalies_date ON sales_anomalies(detected_date);
CREATE INDEX idx_purchase_recommendations_status ON purchase_recommendations(status);
```

---

# 24. DOS BRECHAS DEL ESQUEMA QUE LA IA NO DEBE IGNORAR

## 24.1 Descuento automático exacto de inventario

El esquema base sabe **qué opción está vinculada a un insumo**, pero no sabe **cuánta cantidad del insumo consume cada venta**. Por ejemplo, saber que “Papaya” se vincula a `ingredients.id=1` no define si un jugo grande consume 0.15 kg, 0.25 kg o 0.30 kg.

Por tanto, si se quiere inventario automático real y recomendaciones de compra cuantitativas, agregar una migración técnica:

```sql
CREATE TABLE recipe_components (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    option_id INT NULL REFERENCES options(id) ON DELETE CASCADE,
    ingredient_id INT NOT NULL REFERENCES ingredients(id),
    quantity_per_unit DECIMAL(10, 3) NOT NULL,
    size_multiplier JSONB NULL,
    is_active BOOLEAN DEFAULT TRUE
);
```

Ejemplo conceptual:

```json
{
  "product": "Jugo Especial",
  "option": "Papaya",
  "ingredient": "Papaya",
  "quantity_per_unit": 0.20,
  "size_multiplier": {
    "Chico": 0.8,
    "Mediano": 1.0,
    "Grande": 1.25
  }
}
```

Si el profesor exige **estrictamente** solo las tablas originales, dejar el descuento automático de ingredientes como una regla de backend/configuración y documentar la limitación. No falsificar exactitud.

## 24.2 Idempotencia para modo offline

Para evitar ventas duplicadas al resincronizar una cola local, se recomienda agregar tabla técnica:

```sql
CREATE TABLE sync_requests (
    id SERIAL PRIMARY KEY,
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id INT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

El frontend envía header:

```text
Idempotency-Key: <uuid>
```

Si ya fue procesado, backend devuelve el mismo recurso sin duplicar la orden.

---

# 25. SEED OBLIGATORIO

Crear `backend/scripts/seed.py` idempotente: si los registros ya existen, no duplicarlos.

## 25.1 Usuarios

```text
Olga
Aylin
Angelo
Alejandro
```

Todos activos.

## 25.2 Métodos de pago

Exactamente:

```text
Efectivo
Yape
```

## 25.3 Categorías

```text
Jugos       allows_multiple_ingredients = true
Empanadas   false
Queques     false
Panes       false
Gelatinas   false
```

## 25.4 Insumos iniciales de demostración

> Estos valores son demo y deben ser claramente identificados como seed, no como inventario real.

```text
Papaya      Fruta     kg       stock 3.200   mínimo 5.000
Fresa       Fruta     kg       stock 6.000   mínimo 3.000
Naranja     Fruta     kg       stock 12.000  mínimo 5.000
Piña        Fruta     kg       stock 5.500   mínimo 3.000
Plátano     Fruta     kg       stock 7.000   mínimo 3.000
Leche       Lácteo    ml       stock 8000    mínimo 3000
Agua        Abarrote  ml       stock 20000   mínimo 5000
Azúcar      Abarrote  kg       stock 4.000   mínimo 2.000
Harina      Abarrote  kg       stock 2.000   mínimo 5.000
Pollo       Abarrote  kg       stock 6.000   mínimo 3.000
Chorizo     Abarrote  unidad   stock 4       mínimo 6
Pan         Abarrote  unidad   stock 30      mínimo 15
Gelatina    Abarrote  unidad   stock 25      mínimo 10
```

## 25.5 Grupos de opciones

```text
Tamaño
Fruta
Base
Endulzante
Tipo
Porción
Relleno
```

## 25.6 Opciones

### Tamaño

```text
Chico      +0.00
Mediano    +1.00
Grande     +2.00
```

### Fruta

```text
Papaya     +0.00 -> Papaya
Fresa      +0.50 -> Fresa
Naranja    +0.00 -> Naranja
Piña       +0.50 -> Piña
Plátano    +0.00 -> Plátano
```

### Base

```text
Agua       +0.00 -> Agua
Leche      +2.00 -> Leche
```

### Endulzante

```text
Sin azúcar +0.00 -> NULL
Azúcar     +0.00 -> Azúcar
```

### Tipo

```text
Pollo      +0.00 -> Pollo
Chorizo    +1.00 -> Chorizo
```

### Porción

```text
Regular    +0.00
Grande     +2.00
```

### Relleno

```text
Sin relleno +0.00
Manjar      +1.00
```

## 25.7 Productos demo

```text
Jugo Clásico        Jugos       S/ 8.00
Jugo Especial       Jugos       S/ 10.00
Jugo Surtido        Jugos       S/ 11.00
Empanada            Empanadas   S/ 4.00
Queque               Queques     S/ 4.50
Pan                  Panes       S/ 5.00
Gelatina             Gelatinas   S/ 3.50
```

## 25.8 Relación producto–grupos

```text
Jugo Clásico  -> Tamaño, Fruta, Base, Endulzante
Jugo Especial -> Tamaño, Fruta, Base, Endulzante
Jugo Surtido  -> Tamaño, Fruta, Base, Endulzante
Empanada      -> Tipo
Queque         -> Porción, Relleno
Pan            -> Tipo
Gelatina       -> Porción
```

## 25.9 Ventas históricas demo para ML

Crear `generate_demo_sales.py` que genere **12 semanas** reproducibles con `random.seed(42)`.

Patrón de datos de demostración:

- Lunes y martes: demanda baja.
- Miércoles: media.
- Jueves: sube.
- Viernes, sábado y domingo: demanda alta.
- Pico habitual entre 10:00 y 13:00.
- Mezcla de pagos aproximada, sin fijarla como regla real.
- Insertar 2–3 anomalías controladas para poder probar Isolation Forest.

Los datos demo deben marcarse en logs de desarrollo y nunca mezclarse con producción.

---

# 26. REGLAS DE NEGOCIO

## 26.1 Precio de un detalle

```text
unit_price = product.base_price + suma(extra_cost de opciones seleccionadas)
subtotal = unit_price * quantity
order.total_amount = suma(subtotal de todos los detalles)
```

**Nunca aceptar el total calculado por frontend como verdad.** Backend recalcula con datos de BD.

## 26.2 Ensamblador universal

`assembly_config` debe almacenar nombres e IDs relevantes para mantener trazabilidad histórica.

Ejemplo:

```json
{
  "groups": {
    "Tamaño": {
      "mode": "single",
      "options": [{"id": 2, "name": "Grande", "extra_cost": 2.0}]
    },
    "Fruta": {
      "mode": "multiple",
      "options": [
        {"id": 4, "name": "Papaya", "extra_cost": 0.0},
        {"id": 5, "name": "Fresa", "extra_cost": 0.5}
      ]
    },
    "Base": {
      "mode": "single",
      "options": [{"id": 9, "name": "Leche", "extra_cost": 2.0}]
    }
  }
}
```

No guardar solo un string plano si se puede mantener JSON estructurado.

## 26.3 Selección múltiple

Regla MVP:

- Si `category.allows_multiple_ingredients = true` y el grupo es `Fruta`, permitir múltiples frutas.
- El resto de grupos son single-select.

Documentar esta regla en backend y frontend. No depender únicamente del nombre visible en el frontend para validar; backend también valida.

## 26.4 Órdenes

- Toda orden nueva inicia `en_preparacion` si no se paga en el momento.
- Al pagar, `status='pagado'` y `payment_method_id` obligatorio.
- Orden `cancelado` no cuenta en reportes de ventas.
- Orden pagada no puede cancelarse desde la interfaz normal sin flujo administrativo futuro.

## 26.5 Inventario

- Entrada: suma stock.
- Salida: resta stock.
- Ajuste: lleva el stock al conteo físico mediante diferencia registrada.
- Nunca permitir stock negativo silenciosamente. Si una salida automática supera stock disponible, guardar la venta pero mostrar alerta de inventario y registrar el evento; **el POS no debe bloquear una venta real por un dato de stock desactualizado**.

## 26.6 Alertas de stock

```text
current_stock <= min_stock_alert -> BAJO
current_stock > min_stock_alert  -> BIEN
```

Puede agregarse un estado “CRÍTICO” si:

```text
current_stock <= min_stock_alert * 0.5
```

pero siempre con texto, no solo color.

---

# 27. API REST — CONTRATO MÍNIMO

Base: `/api/v1`

Formato de error:

```json
{
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "No encontramos esa orden.",
    "details": null
  }
}
```

## 27.1 Health

```text
GET /health
```

Respuesta:

```json
{"status":"ok","database":"ok"}
```

## 27.2 Users

```text
GET /users?active=true
```

## 27.3 Catálogo

```text
GET  /categories
GET  /products?active=true&category_id=1
GET  /products/{id}
POST /products
PUT  /products/{id}
PATCH /products/{id}/status
GET  /option-groups
GET  /products/{id}/option-groups
```

## 27.4 Ventas / órdenes

```text
POST /orders
GET  /orders?date=2026-10-04&status=en_preparacion&order_type=mesa
GET  /orders/{id}
POST /orders/{id}/details
PUT  /orders/{id}/details/{detail_id}
DELETE /orders/{id}/details/{detail_id}
POST /orders/{id}/pay
POST /orders/{id}/cancel
```

### POST `/orders`

Request:

```json
{
  "user_id": 1,
  "order_type": "mostrador",
  "customer_name": null,
  "table_number": null,
  "pay_now": true,
  "payment_method_id": 2,
  "items": [
    {
      "product_id": 2,
      "quantity": 1,
      "option_ids": [3,4,5,9,10],
      "notes": null
    }
  ]
}
```

Backend:

1. valida producto/opciones;
2. recalcula precio;
3. crea orden;
4. crea detalles;
5. recalcula total;
6. registra pago si corresponde;
7. registra salidas de inventario si existe receta;
8. commit único.

## 27.5 Inventario

```text
GET  /ingredients
GET  /ingredients/low-stock
POST /ingredients
PUT  /ingredients/{id}
GET  /inventory/movements
POST /inventory/entries
POST /inventory/adjustments
```

## 27.6 Dashboard

```text
GET /dashboard/summary?period=today
GET /dashboard/sales-series?period=week
GET /dashboard/top-products?period=month&limit=5
GET /dashboard/payment-breakdown?period=today
GET /dashboard/alerts
```

Respuesta de summary ejemplo:

```json
{
  "period": "today",
  "sales_total": 1250.00,
  "orders_paid": 64,
  "average_ticket": 19.53,
  "payments": {
    "cash": 780.00,
    "yape": 470.00
  }
}
```

## 27.7 ML

```text
GET  /forecasts?from=2026-10-05&to=2026-10-11
GET  /anomalies?from=2026-10-01&to=2026-10-31
PATCH /anomalies/{id}/reviewed
GET  /purchase-recommendations?status=pendiente
PATCH /purchase-recommendations/{id}/status
POST /ml/retrain            # restringido a entorno admin/interno
```

## 27.8 Reportes

```text
GET /reports/summary?from=...&to=...
GET /reports/sales?from=...&to=...
GET /reports/payments?from=...&to=...
GET /reports/products?from=...&to=...
GET /reports/inventory?from=...&to=...
POST /reports/pdf
```

---

# 28. TRANSACCIONES Y CONSISTENCIA

Toda operación de orden debe ser atómica.

Ejemplo al pagar:

1. bloquear/leer orden;
2. verificar que no esté pagada o cancelada;
3. validar método de pago;
4. actualizar `status='pagado'`;
5. asignar `payment_method_id`;
6. actualizar `updated_at`;
7. registrar movimientos de inventario necesarios;
8. commit.

Si falla inventario técnico después de guardar la orden, no dejar una orden a medio estado. Manejar toda la operación dentro de transacción o usar una estrategia de compensación bien documentada.

---

# 29. ANALÍTICA Y GRÁFICOS

## 29.1 Regla general

Cada gráfico debe responder una pregunta concreta.

No crear visualizaciones decorativas.

## 29.2 Ventas por día

Pregunta:

`¿Qué días vendo más y cuánto vendí?`

Gráfico:

- barras verticales;
- monto arriba;
- días abajo;
- máximo 31 barras para vista mensual; si hay más rango, agregar por semana.

## 29.3 Yape vs Efectivo

Pregunta:

`¿Cuánto entró por cada medio de pago?`

Visual principal:

- dos bloques numéricos o barras comparativas;
- porcentaje y monto juntos.

No usar pie chart como única representación.

## 29.4 Productos top

Pregunta:

`¿Qué producto se vende más?`

Gráfico:

- barras horizontales;
- cantidad exacta.

## 29.5 Tendencia / predicción

Pregunta:

`¿El próximo fin de semana venderé más o menos?`

Mostrar:

- histórico 4–8 semanas;
- predicción siguiente periodo;
- zona futura claramente diferenciada por texto `Pronóstico`.

No usar líneas punteadas sin explicación.

---

# 30. MODELO DE PREDICCIÓN DE DEMANDA — REGRESIÓN LINEAL

Archivo:

```text
backend/app/infrastructure/ml/demand_forecast.py
```

## 30.1 Dataset

Fuente:

- `orders` pagadas.
- `order_details`.
- Agregación por `product_id` + fecha.

Target:

```text
quantity_sold
```

Features mínimas:

```text
day_of_week
is_friday
is_weekend
week_of_year
lag_7
rolling_mean_7
rolling_mean_28
```

Si falta historial suficiente, no entrenar un modelo engañoso; devolver estado:

```text
insufficient_data
```

Umbral recomendado para MVP: mínimo 4 semanas; objetivo académico: 12 semanas.

## 30.2 Validación

Usar separación temporal, nunca shuffle aleatorio para datos de tiempo.

Métricas internas:

- MAE.
- RMSE.
- R².

`confidence_score` debe documentarse como una **puntuación heurística de confiabilidad**, no como probabilidad estadística. Ejemplo:

```text
confidence_score = clamp(R² * 100, 0, 100)
```

Si R² es negativo, 0.

## 30.3 Persistencia

Guardar por producto y fecha:

```text
forecast_date
product_id
predicted_quantity
confidence_score
model_version
```

Versionado:

```text
lr-demand-v1-2026-10-04
```

## 30.4 Retraining

- En producción: una vez al día fuera de horas pico, o al cierre.
- En desarrollo: comando manual.
- Si falla el entrenamiento, mantener el último modelo válido y registrar log.

---

# 31. DETECCIÓN DE ANOMALÍAS — ISOLATION FOREST

Archivo:

```text
backend/app/infrastructure/ml/anomaly_detection.py
```

Datos:

- ventas diarias totales;
- opcionalmente órdenes pagadas por día;
- comparación contra patrón semanal.

Features sugeridas:

```text
sales_total
orders_count
average_ticket
day_of_week
rolling_mean_7
relative_deviation
```

Modelo:

```text
IsolationForest(
    n_estimators=200,
    contamination=0.05,
    random_state=42
)
```

No mostrar al usuario el score bruto.

Traducir resultado a:

```text
pico_venta
caida_venta
```

Descripción:

```text
"Ventas 25% menores de lo esperado para un domingo."
```

Persistir `expected_value` y `actual_value`.

---

# 32. RECOMENDACIONES DE COMPRA

El motor debe usar:

1. stock actual;
2. stock mínimo;
3. demanda prevista;
4. consumo estimado de insumos por producto/receta;
5. margen de seguridad sencillo.

Fórmula conceptual:

```text
necesidad = consumo_previsto + stock_seguridad - stock_actual
recomendado = max(0, necesidad)
```

Redondear según unidad:

- kg: 0.5 kg.
- ml: 500 ml o 1 L según presentación.
- unidades: entero.

Nunca recomendar cantidades negativas.

Reason en lenguaje natural:

```text
"El stock actual es 3.2 kg y se estima un consumo de 6.1 kg para el fin de semana. Para mantener 5 kg de reserva, se recomienda comprar 8 kg."
```

---

# 33. MODO OFFLINE Y SINCRONIZACIÓN

## 33.1 Objetivo

La usuaria debe poder seguir registrando ventas si se cae internet.

## 33.2 Frontend

IndexedDB guarda:

```text
pending_actions
catalog_snapshot
active_user
last_sync_at
```

Cada acción offline:

```json
{
  "id": "uuid",
  "type": "CREATE_ORDER",
  "payload": {},
  "created_at": "2026-10-04T12:30:00-05:00",
  "attempts": 0
}
```

## 33.3 UI offline

Banda persistente:

```text
Sin internet. Puedes seguir registrando ventas.
3 ventas pendientes de sincronizar.
```

Cuando vuelve internet:

```text
Sincronizando 3 ventas…
```

Luego:

```text
Todo sincronizado.
```

## 33.4 Reglas

- Mantener orden FIFO.
- Usar Idempotency-Key.
- Reintentar con backoff.
- No eliminar acción local hasta confirmación 2xx.
- Si hay error de validación, marcarla como `needs_attention` y mostrar:

```text
1 venta necesita revisión antes de sincronizar.
[Revisar]
```

No perder datos silenciosamente.

---

# 34. EXPORTACIÓN PDF

Generar PDF en backend para resultados reproducibles.

Endpoint:

```text
POST /api/v1/reports/pdf
```

Request:

```json
{
  "from": "2026-10-01",
  "to": "2026-10-31",
  "sections": [
    "summary",
    "payments",
    "products",
    "inventory",
    "forecasts",
    "anomalies"
  ]
}
```

- Formato A4.
- Márgenes 18–20 mm.
- Tipografía de PDF legible, 10–12 pt mínimo.
- Títulos con colores de marca.
- Evitar fondos de color oscuro en páginas completas.
- Tablas con zebra sutil beige/hueso.
- Gráficos rasterizados a buena resolución.

---

# 35. CUMPLIMIENTO Y PRIVACIDAD

El proyecto debe considerar la **Ley N.° 29733 de Protección de Datos Personales** y el contexto de una MiPYME bajo la **Ley N.° 28015** como requisitos de diseño del proyecto.

Principios prácticos para la implementación:

- Minimizar datos personales: en `orders` solo usar `customer_name` cuando sea necesario.
- No almacenar información sensible innecesaria.
- No incluir nombres de clientes en reportes agregados/PDF por defecto.
- Separar backups de desarrollo y producción.
- No registrar payloads completos con nombres de clientes en logs de error si no es necesario.
- Usar HTTPS en producción.
- Configurar CORS de forma restrictiva.
- Proteger credenciales en variables de entorno.
- Mantener trazabilidad de quién registró cada orden mediante `user_id`.

Este README define criterios técnicos; la validación jurídica formal debe revisarse con asesoría legal si el sistema entra en operación comercial real.

---

# 36. KPI DEL PROYECTO

Medir y reportar en documentación de proyecto:

1. Tiempo de consolidación de ventas.
2. Errores de control Yape/Efectivo.
3. Compras de emergencia.
4. Porcentaje de decisiones de compra basadas en datos.
5. Tiempo promedio para registrar una venta.
6. Tareas completadas sin asistencia por la usuaria.

**Importante:** las tablas actuales no permiten inferir automáticamente con precisión “horas de consolidación” ni “% de decisiones basadas en datos”. No inventar esos indicadores.

Para evaluación académica, medirlos mediante:

- sesión de test cronometrada;
- checklist de tareas;
- registro de compras/recomendaciones utilizadas;
- comparación antes/después.

Si se quiere medirlos dentro del sistema en una fase posterior, crear una tabla explícita de `kpi_measurements` o `decision_logs`.

---

# 37. ACCESIBILIDAD

Checklist obligatorio:

- Navegación por teclado completa.
- Focus visible de 3 px con contraste suficiente.
- `aria-label` donde aplique.
- `aria-live` para confirmaciones de guardado/sincronización.
- No depender solo de color, posición o iconografía.
- Labels asociados a inputs.
- Modales con focus trap y retorno de foco al cerrar.
- Escape cierra modal no destructivo.
- Contraste WCAG AA.
- Targets ≥48 px.
- Zoom del navegador a 200% sin romper el flujo principal.
- Respetar `prefers-reduced-motion`.
- Animaciones máximas 150–200 ms y solo funcionales.
- Elementos interactivos de tablas y gráficos accesibles también por teclado.
- Una fila clicable debe tener nombre accesible y acción equivalente mediante teclado.
- Tooltips de gráficos no pueden contener información exclusiva; debe existir valor visible, tabla resumida o detalle accesible.
- No usar placeholder como sustituto de label.
- Estados `disabled` deben conservar legibilidad y, cuando sea relevante, explicar por qué la acción no está disponible.

---

# 38. MENSAJES Y MICROCOPY

Usar español de Perú, claro y cotidiano.

## 38.1 Éxito

```text
Venta registrada correctamente.
Pago registrado correctamente.
Orden guardada.
Entrada de stock registrada.
Reporte generado.
```

## 38.2 Error

Incorrecto:

```text
Error 500. Constraint violation.
```

Correcto:

```text
No pudimos guardar la venta.
Tus datos siguen aquí. Intenta nuevamente.
```

Si hay un detalle útil:

```text
No se pudo conectar con el servidor.
Puedes seguir trabajando sin internet y sincronizar después.
```

## 38.3 Confirmación destructiva

```text
¿Cancelar la orden #046?
Esta acción la retirará del total de ventas.
```

---

# 39. ESTADOS DE CARGA

No usar skeletons excesivos en una interfaz para adultos mayores.

Preferir mensajes:

```text
Cargando ventas…
Guardando orden…
Generando reporte…
Actualizando predicción…
```

Para tabla o dashboard, skeleton simple es aceptable si dura poco, pero acompañado por semántica accesible.

---

# 40. ERRORES Y RESILIENCIA

Frontend debe implementar Error Boundary para fallos inesperados:

```text
Algo salió mal en esta pantalla.
La venta que estabas preparando no se borró.
[Intentar nuevamente]
```

Nunca borrar el carrito por un error de API.

Backend:

- errores de dominio tipados;
- logs estructurados;
- transacciones;
- rollback automático;
- health check de DB;
- no exponer stack traces en producción.

---

# 41. TESTS OBLIGATORIOS

## 41.1 Backend unitarios

- cálculo de precio con extras;
- multi-fruta;
- total de orden;
- transición de estado;
- pago requerido para `pagado`;
- exclusión de canceladas en reportes;
- cálculo de unit_cost;
- low-stock;
- recomendación no negativa;
- serialización de assembly_config.

## 41.2 Backend integración

- crear orden completa;
- agregar detalle;
- pagar;
- cancelar;
- registrar entrada de stock;
- dashboard summary;
- report PDF;
- forecast persistence;
- anomaly persistence.

## 41.3 Frontend

- navegación principal.
- ensamblador de jugo.
- selección múltiple de frutas.
- carrito.
- modal de pago.
- órdenes.
- filtros.
- exportación.
- estados offline.

## 41.4 E2E — Playwright recomendado

### Caso 1

Registrar Jugo Especial, Grande, Papaya + Fresa, Leche, pagar en Efectivo.

### Caso 2

Crear orden Mesa 4, guardar en preparación, agregar empanada, marcar pagado con Yape.

### Caso 3

Simular offline, registrar venta, recuperar internet y verificar una sola orden sincronizada.

### Caso 4

Detectar stock bajo y abrir recomendación.

### Caso 5

Exportar reporte mensual en PDF.

---

# 42. CRITERIOS DE ACEPTACIÓN DE USABILIDAD Y CALIDAD UX/UI

Prueba presencial de 30 minutos con usuaria principal y revisión visual obligatoria a 1024×768.

Debe completar:

1. Registrar un jugo con efectivo en ≤1 min.
2. Registrar empanadas con Yape y distinguir correctamente el medio de pago.
3. Consultar venta total del día sin ayuda.
4. Identificar cuánto fue Yape y cuánto efectivo.
5. Tocar un KPI o elemento de gráfico y comprender el detalle mostrado.
6. Reconocer una anomalía y explicar que requiere revisión.
7. Identificar un insumo bajo, abrir su detalle y proponer una acción.
8. Entender una recomendación de compra.

Meta funcional y visual:

- al menos 6 de 8 tareas sin asistencia;
- controles táctiles ≥48 px;
- interfaz funcional a 1024×768 sin scroll horizontal;
- navbar completo en una sola fila, sin `...`, sin texto cortado y sin segunda línea;
- ningún grupo de acciones principales debe romperse en dos filas;
- toda alerta crítica debe identificarse como alerta antes de leer su contenido completo;
- cada pantalla debe revelar su acción principal en menos de 3 segundos;
- el recorrido visual debe ser coherente de izquierda a derecha y de arriba abajo;
- tarjetas, filas y gráficos definidos como interactivos deben responder a clic, toque y teclado;
- la paleta Tía Julia debe ser reconocible sin comprometer contraste;
- no debe existir solapamiento de textos, botones, badges o controles en los breakpoints soportados;
- no debe existir texto funcional menor de 16 px y el texto de operación normal debe mantenerse en 18 px o más.

### Rechazo automático de una entrega visual

La implementación se considera **no aceptable** si ocurre cualquiera de estos casos:

- navbar en dos filas;
- navegación truncada con `...`;
- botones principales cortados o apilados por falta de espacio;
- alertas visualmente indistinguibles de tarjetas normales;
- colores de marca prácticamente ausentes;
- uso excesivo de gris que haga perder identidad;
- tablas o gráficos que aparentan ser clicables pero no responden;
- elementos clicables sin estado hover/pressed/focus;
- texto superpuesto, recortado o fuera del contenedor;
- modales que exceden la pantalla sin scroll interno controlado;
- acciones destructivas sin confirmación clara;
- información relevante disponible solo por color o tooltip.

---

# 43. COMANDOS DE DESARROLLO

## 43.1 Base de datos local

Crear DB:

```bash
createdb tiajulia
```

O usar Docker Compose.

## 43.2 Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Linux/macOS
# .venv\Scripts\activate    # Windows
pip install -e .
alembic upgrade head
python scripts/seed.py
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Swagger:

```text
http://localhost:8000/docs
```

## 43.3 Frontend

```bash
cd frontend
npm install
npm run dev
```

App:

```text
http://localhost:5173
```

## 43.4 Tests

```bash
# backend
pytest

# frontend
npm run test
npm run test:e2e
```

---

# 44. DOCKER COMPOSE RECOMENDADO

Servicios:

```text
postgres
backend
frontend
```

Desarrollo:

- PostgreSQL 16+.
- Backend en 8000.
- Frontend en 5173.

Persistir volumen PostgreSQL.

No meter secretos reales en `docker-compose.yml`; leerlos desde `.env`.

---

# 45. DESPLIEGUE

Arquitectura objetivo académica:

- Frontend: Vercel.
- Backend: Render.
- PostgreSQL: servicio administrado compatible.

Antes de producción:

- HTTPS.
- `APP_ENV=production`.
- CORS solo al dominio frontend.
- Migraciones ejecutadas.
- Seed demo deshabilitado.
- Variables de entorno reales configuradas.
- Backups.
- Logging sin datos personales innecesarios.

---

# 46. Definition of Done

Una funcionalidad no está terminada solo porque “se ve bien”. Debe cumplir:

- UI aprobada en 1024×768.
- Tipografía/targets accesibles.
- Conexión real a API.
- Persistencia PostgreSQL real.
- Validación frontend y backend.
- Manejo de loading, empty, error y offline.
- Tests mínimos.
- Sin warnings críticos en consola.
- Sin datos mock hardcodeados en producción.
- Actualización de README/API si cambia contrato.

---

# 47. ORDEN DE IMPLEMENTACIÓN PARA LA IA

La IA debe trabajar por etapas y dejar cada etapa ejecutable.

## Fase 1 — Base del proyecto y Tailwind

1. Crear carpetas `frontend` y `backend`.
2. Inicializar React/TS/Vite.
3. Instalar y configurar **Tailwind CSS** como sistema principal y obligatorio de estilos.
4. Conectar los design tokens de Tía Julia con Tailwind y preparar estilos globales mínimos.
5. Crear componentes UI base propios: botones, campos, tarjetas, alertas, tabs, modal/drawer y estados interactivos; **sin Bootstrap**.
6. Inicializar FastAPI/SQLAlchemy/Alembic.
7. Configurar PostgreSQL y `.env`.
8. Health check.
9. Construir layout principal responsive priorizando 1024×768.

## Fase 2 — Base de datos y seed

1. Migraciones.
2. Índices/constraints.
3. Seed catálogo.
4. Seed 12 semanas demo opcional.

## Fase 3 — Registrar venta

1. Catálogo.
2. Ensamblador.
3. Carrito.
4. Orden.
5. Pago.
6. Validaciones.

## Fase 4 — Órdenes

1. Lista/tabs.
2. Agregar producto.
3. Marcar pago.
4. Cancelar.
5. Búsqueda/filtros.

## Fase 5 — Productos e inventario

1. CRUD producto.
2. CRUD mínimo de insumos.
3. Entradas.
4. Ajustes.
5. Stock bajo.
6. Recomendaciones.

## Fase 6 — Dashboard y reportes

1. Agregaciones SQL.
2. Gráficos.
3. filtros.
4. exportación PDF.

## Fase 7 — ML

1. features.
2. Linear Regression.
3. Isolation Forest.
4. persistencia de pronósticos/anomalías.
5. recomendaciones.

## Fase 8 — Offline

1. PWA.
2. cache catálogo.
3. cola IndexedDB.
4. idempotencia.
5. resincronización.

## Fase 9 — QA

1. Tests.
2. Usabilidad 1024×768.
3. Lighthouse/accesibilidad.
4. Flujos E2E.
5. documentación final.

---

# 48. CHECKLIST VISUAL FINAL — “NO PARECER IA”

Antes de dar por terminada cualquier pantalla, revisar:

- ¿Hay demasiadas tarjetas idénticas? Reducirlas.
- ¿Hay degradados? Quitarlos.
- ¿Hay sombras brillantes? Quitarlas.
- ¿Hay títulos con “Insights inteligentes”, “AI powered” o frases artificiales? Reemplazarlas por lenguaje del negocio.
- ¿Los iconos aparecen sin texto? Añadir texto.
- ¿La información crítica solo aparece al pasar el mouse? Corregir.
- ¿Los colores se usan de forma decorativa sin función? Simplificar.
- ¿Los gráficos tienen textos demasiado pequeños? Aumentar.
- ¿Hay más de una acción primaria compitiendo? Elegir una.
- ¿La pantalla puede entenderse en 5 segundos? Si no, simplificar.
- ¿Un adulto mayor puede tocar el control sin precisión? Si no, agrandar.
- ¿La UI parece un template de SaaS genérico? Replantear composición, microcopy y jerarquía usando el flujo real de la juguería.

---

# 49. WIREFRAME TEXTUAL RESUMIDO DE TODO EL SISTEMA

## Inicio

```text
HEADER
Logo | Inicio | Registrar venta | Órdenes | Productos | Reportes | Sync | Usuario

TÍTULO: Panel de control
FILTRO: Hoy / Semana / Mes

[VENTAS DE HOY] [STOCK POR REVISAR] [COMPRA RECOMENDADA]

VENTAS DE ESTA SEMANA — barras grandes con valores

[PRODUCTOS MÁS VENDIDOS] [ALERTAS RECIENTES]
```

## Registrar venta

```text
HEADER

TÍTULO: Registrar venta
TIPO: Mesa / Delivery / Llevar

CATÁLOGO 65%                        PEDIDO 35%
Categorías                          Items
Productos                           Cantidad
                                    Total
                                    Guardar orden
                                    Cobrar
```

## Órdenes

```text
HEADER
TÍTULO: Órdenes del día
TABS: En preparación / Pagadas / Canceladas
FILTROS visibles

[ORDEN #046] [ORDEN #047]
[ORDEN #048] [ORDEN #049]
```

## Productos

```text
HEADER
TÍTULO: Productos
SUBTABS: Productos / Insumos / Movimientos / Recomendaciones
CONTENIDO según subtab
```

## Reportes

```text
HEADER
TÍTULO: Reportes                         [Exportar PDF]
RANGO: Hoy / Semana / Mes / Personalizado
SUBTABS: Resumen / Ventas / Pagos / Productos / Stock y compras / Predicciones

KPIs
GRÁFICO
TABLA
ALERTAS/RECOMENDACIONES
```

---

# 50. ENTREGA FINAL QUE DEBE PRODUCIR LA IA

La tarea se considera completa cuando el repositorio incluye, como mínimo:

```text
/frontend funcional
/backend funcional
/migraciones Alembic
/seed reproducible
/modelos ML o script de entrenamiento
/exportación PDF
/modo offline
/tests
README.md
.env.example frontend/backend
docker-compose.yml
```

Además:

- Todas las pantallas descritas implementadas.
- Todos los modales descritos implementados.
- API documentada en Swagger.
- Base PostgreSQL operativa.
- Sin dependencias a mocks para flujos principales.
- Diseño validado a 1024×768.
- Datos y acciones legibles para una persona mayor.

---

# 51. REGLA FINAL PARA EL AGENTE DE DESARROLLO

**No detengas la implementación en una propuesta visual. No devuelvas únicamente componentes aislados, pseudocódigo o un “ejemplo”. Construye un sistema integrado y ejecutable.**

Si aparece una contradicción entre estética y usabilidad, gana la usabilidad.

Si aparece una contradicción entre frontend y backend, el backend es la fuente de verdad para precios, totales, estados e integridad.

Si aparece una limitación del modelo de datos, documéntala y resuélvela con una migración explícita; no la escondas en lógica frágil.

Si un modelo ML no tiene datos suficientes, muestra “datos insuficientes”; no inventes resultados.

El objetivo final no es “verse tecnológico”. El objetivo es que la propietaria pueda **vender, cobrar, revisar, decidir y comprar mejor sin depender de otra persona**.


