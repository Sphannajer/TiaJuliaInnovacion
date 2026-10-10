import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import { api } from "../../lib/api";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingMessage } from "../../components/feedback/LoadingMessage";
import { StockAdjustModal, StockEntryModal } from "./StockModals";
import { ProductFormModal } from "./ProductFormModal";
import { formatMoney } from "../../lib/currency";
import { formatDate, formatTime } from "../../lib/dates";
import { formatStock } from "../../lib/stock";
import type { Ingredient, Movement, Paginated, Product, Recommendation } from "../../types";

type SubTab = "productos" | "insumos" | "movimientos" | "recomendaciones";

const SUBTABS: [SubTab, string][] = [
  ["productos", "Productos"],
  ["insumos", "Insumos"],
  ["movimientos", "Movimientos"],
  ["recomendaciones", "Recomendaciones"],
];

/** Pantalla 4 — Productos con subpestañas visibles (sección 17). */
export function ProductsPage() {
  const params = new URLSearchParams(window.location.search);
  const initial = (params.get("tab") as SubTab) || "productos";
  const [tab, setTab] = useState<SubTab>(initial);

  return (
    <div className="flex flex-col gap-4">
      <h1>Productos</h1>

      <div className="report-tabs" role="tablist" aria-label="Secciones de productos">
        {SUBTABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            className="report-tab"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        {tab === "productos" && <ProductsTab />}
        {tab === "insumos" && <IngredientsTab />}
        {tab === "movimientos" && <MovementsTab />}
        {tab === "recomendaciones" && <RecommendationsTab />}
      </div>
    </div>
  );
}

/* ===================== Subpestaña Productos ===================== */

function ProductsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const products = useQuery({
    queryKey: ["products", "all", search],
    queryFn: () => api.get<Product[]>(`/products?active=false`),
  });

  const filtered = (products.data ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="field field--compact field--wide mb-0">
          <label htmlFor="product-search">Buscar producto</label>
          <input
            id="product-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre…"
          />
        </div>
        <button className="btn btn-primary btn-large" onClick={() => setEditing("new")}>
          <PackagePlus size={22} aria-hidden /> Nuevo producto
        </button>
      </div>

      {products.isLoading && <LoadingMessage message="Cargando productos…" />}

      <div className="card table-scroll mt-4">
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Estado</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.id}>
                <td className="td-bold">{product.name}</td>
                <td>{product.category_name ?? "—"}</td>
                <td>{formatMoney(product.base_price)}</td>
                <td>
                  {product.is_active ? (
                    <span className="badge badge-ok">Activo</span>
                  ) : (
                    <span className="badge badge-danger">Inactivo</span>
                  )}
                </td>
                <td>
                  <button className="btn btn-secondary" onClick={() => setEditing(product)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && !products.isLoading && (
          <p className="text-secondary p-4">No encontramos productos con ese nombre.</p>
        )}
      </div>

      {editing && (
        <ProductFormModal
          key={editing === "new" ? "new" : editing.id}
          product={editing === "new" ? null : editing}
          products={products.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ["products"] });
          }}
        />
      )}
    </div>
  );
}

/* ===================== Subpestaña Insumos ===================== */

function IngredientsTab() {
  const queryClient = useQueryClient();
  const [entryTarget, setEntryTarget] = useState<Ingredient | "new" | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);
  const [detail, setDetail] = useState<Ingredient | null>(null);

  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => api.get<Ingredient[]>("/ingredients"),
    refetchInterval: 60_000,
  });

  const list = ingredients.data ?? [];

  const summary = useMemo(
    () => ({
      total: list.length,
      alerts: list.filter((i) => i.state !== "BIEN").length,
      critical: list.filter((i) => i.state === "CRITICO").length,
    }),
    [list],
  );

  const openEntry = (ingredient: Ingredient | null) => {
    if (ingredient) setEntryTarget(ingredient);
    else setEntryTarget(list.length > 0 ? list[0] : "new");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2>Insumos e inventario</h2>
        <div className="flex flex-wrap gap-2.5">
          <button className="btn btn-secondary btn-large" onClick={() => setEntryTarget("new")}>
            <PackagePlus size={22} aria-hidden /> Nuevo insumo
          </button>
          <button className="btn btn-primary btn-large" onClick={() => openEntry(null)}>
            Registrar entrada
          </button>
        </div>
      </div>

      {/* Resumen rápido del inventario */}
      <div className="dashboard-grid mt-4">
        <div className="kpi-card kpi-card--white">
          <p className="kpi-label">Insumos registrados</p>
          <p className="kpi-value">{summary.total}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">Por revisar</p>
          <p className="kpi-value">{summary.alerts}</p>
        </div>
        <div className="kpi-card kpi-card--white">
          <p className="kpi-label">En estado crítico</p>
          <p className="kpi-value">{summary.critical}</p>
        </div>
      </div>

      {ingredients.isLoading && <LoadingMessage message="Cargando insumos…" />}

      <div className="card table-scroll mt-4">
        <table className="table">
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Categoría</th>
              <th>Stock actual</th>
              <th>Mínimo</th>
              <th>Estado</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {list.map((ingredient) => (
              <tr key={ingredient.id}>
                <td className="td-bold">{ingredient.name}</td>
                <td>{ingredient.category}</td>
                <td>
                  Quedan {formatStock(parseFloat(ingredient.current_stock), ingredient.base_unit)}
                </td>
                <td>{formatStock(parseFloat(ingredient.min_stock_alert), ingredient.base_unit)}</td>
                <td>
                  <StatusBadge state={ingredient.state} />
                </td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-secondary" onClick={() => setEntryTarget(ingredient)}>
                      Entrada
                    </button>
                    <button className="btn btn-secondary" onClick={() => setAdjustTarget(ingredient)}>
                      Ajustar
                    </button>
                    <button className="btn btn-secondary" onClick={() => setDetail(ingredient)}>
                      Ver
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && !ingredients.isLoading && (
          <EmptyState
            title="Todavía no hay insumos registrados."
            description="Crea el primero para empezar a controlar tu inventario."
            actionLabel="Crear nuevo insumo"
            onAction={() => setEntryTarget("new")}
          />
        )}
      </div>

      {entryTarget && (
        <StockEntryModal
          ingredients={list}
          initial={entryTarget === "new" ? null : entryTarget}
          startInNewMode={entryTarget === "new"}
          onClose={() => setEntryTarget(null)}
          onSaved={() => {
            setEntryTarget(null);
            void queryClient.invalidateQueries({ queryKey: ["ingredients"] });
            void queryClient.invalidateQueries({ queryKey: ["movements"] });
          }}
        />
      )}
      {adjustTarget && (
        <StockAdjustModal
          ingredient={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onSaved={() => {
            setAdjustTarget(null);
            void queryClient.invalidateQueries({ queryKey: ["ingredients"] });
            void queryClient.invalidateQueries({ queryKey: ["movements"] });
          }}
        />
      )}
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <p className="text-important-bold">
            Quedan {formatStock(parseFloat(detail.current_stock), detail.base_unit)} de {detail.name}.
          </p>
          <p className="mt-2">
            Mínimo deseado: {formatStock(parseFloat(detail.min_stock_alert), detail.base_unit)}.
          </p>
          <p className="mt-2">
            Estado actual: <StatusBadge state={detail.state} />
          </p>
        </Modal>
      )}
    </div>
  );
}

/* ===================== Subpestaña Movimientos ===================== */

function MovementsTab() {
  const [day, setDay] = useState<string>(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<string>("todos");
  const [ingredientId, setIngredientId] = useState<string>("todos");

  const ingredients = useQuery({ queryKey: ["ingredients"], queryFn: () => api.get<Ingredient[]>("/ingredients") });
  const movements = useQuery({
    queryKey: ["movements", day, type, ingredientId],
    queryFn: () => {
      const params = new URLSearchParams({ date: day });
      if (type !== "todos") params.set("movement_type", type);
      if (ingredientId !== "todos") params.set("ingredient_id", ingredientId);
      return api.get<Paginated<Movement>>(`/inventory/movements?${params.toString()}`);
    },
  });

  const typeLabels: Record<string, string> = { entrada: "Entrada", salida: "Salida", ajuste: "Ajuste" };

  return (
    <div>
      <h2>Movimientos de inventario</h2>
      <div className="card filter-bar mt-4">
        <div className="field field--compact">
          <label htmlFor="mov-date">Fecha</label>
          <input id="mov-date" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="field field--compact">
          <label htmlFor="mov-type">Movimiento</label>
          <select id="mov-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
            <option value="ajuste">Ajuste</option>
          </select>
        </div>
        <div className="field field--compact">
          <label htmlFor="mov-ingredient">Insumo</label>
          <select id="mov-ingredient" value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
            <option value="todos">Todos</option>
            {(ingredients.data ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {movements.isLoading && <LoadingMessage message="Cargando movimientos…" />}

      <div className="card table-scroll mt-4">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Insumo</th>
              <th>Movimiento</th>
              <th>Cantidad</th>
              <th>Costo</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            {(movements.data?.items ?? []).map((movement) => (
              <tr key={movement.id}>
                <td>
                  {formatDate(movement.created_at)} {formatTime(movement.created_at)}
                </td>
                <td>{movement.ingredient_name ?? "—"}</td>
                <td>
                  <span className="badge badge-neutral">{typeLabels[movement.movement_type] ?? movement.movement_type}</span>
                </td>
                <td>{parseFloat(movement.quantity).toLocaleString("es-PE")}</td>
                <td>{movement.total_cost != null ? formatMoney(movement.total_cost) : "—"}</td>
                <td className="text-aux">
                  {movement.notes ?? (movement.reference_id ? `Orden #${movement.reference_id}` : "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(movements.data?.items ?? []).length === 0 && !movements.isLoading && (
          <p className="text-secondary p-4">No hay movimientos para este filtro.</p>
        )}
      </div>
    </div>
  );
}

/* ===================== Subpestaña Recomendaciones ===================== */

function RecommendationsTab() {
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<Recommendation | null>(null);

  const recommendations = useQuery({
    queryKey: ["recommendations", "pendiente"],
    queryFn: () => api.get<{ items: Recommendation[] }>("/purchase-recommendations?status=pendiente"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/purchase-recommendations/${id}/status`, { status }),
    onSuccess: () => {
      setDetail(null);
      void queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });

  const generate = useMutation({
    mutationFn: () => api.post("/purchase-recommendations/generate"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });

  const items = recommendations.data?.items ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2>Recomendaciones de compra</h2>
        <button className="btn btn-secondary" disabled={generate.isPending} onClick={() => generate.mutate()}>
          {generate.isPending ? "Actualizando predicción…" : "Actualizar recomendaciones"}
        </button>
      </div>

      {recommendations.isLoading && <LoadingMessage message="Cargando recomendaciones…" />}

      {!recommendations.isLoading && items.length === 0 && (
        <EmptyState
          title="No hay recomendaciones pendientes."
          description="Cuando el sistema detecte que un insumo no alcanzará para la demanda prevista, aparecerá aquí."
        />
      )}

      <div className="stack mt-4">
        {items.map((rec) => (
          <div key={rec.id} className="card">
            <h3>{rec.ingredient_name}</h3>
            <p className="text-important-bold">
              Comprar {rec.recommended_quantity.toLocaleString("es-PE")} {rec.base_unit}
            </p>
            <p className="text-secondary text-aux">{rec.reason}</p>
            <div className="flex flex-wrap gap-2.5">
              <button className="btn btn-secondary" onClick={() => setDetail(rec)}>
                Ver detalle
              </button>
              <button
                className="btn btn-green"
                onClick={() => statusMutation.mutate({ id: rec.id, status: "realizada" })}
              >
                Marcar como realizada
              </button>
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <Modal
          title={`Recomendación para ${detail.ingredient_name}`}
          onClose={() => setDetail(null)}
          footer={
            <>
              <button
                className="btn btn-secondary btn-large"
                onClick={() => statusMutation.mutate({ id: detail.id, status: "descartada" })}
              >
                Descartar
              </button>
              <button
                className="btn btn-primary btn-large"
                onClick={() => statusMutation.mutate({ id: detail.id, status: "realizada" })}
              >
                Marcar como realizada
              </button>
            </>
          }
        >
          <div className="stack">
            <p className="text-important-bold">
              Comprar {detail.recommended_quantity.toLocaleString("es-PE")} {detail.base_unit}
            </p>
            <p className="text-secondary">¿Por qué?</p>
            <p>{detail.reason}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
