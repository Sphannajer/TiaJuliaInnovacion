import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Modal } from "../../components/ui/Modal";
import { PaymentModal } from "../sales/PaymentModal";
import { ProductAssemblerModal, type AssemblerResult } from "../sales/ProductAssemblerModal";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingMessage } from "../../components/feedback/LoadingMessage";
import { formatMoney } from "../../lib/currency";
import { formatDate, formatTime } from "../../lib/dates";
import type { Category, OptionGroup, Order, Paginated, Product } from "../../types";

type TabStatus = "en_preparacion" | "pagado" | "cancelado";

/** Pantalla 3 — Órdenes (sección 14). */
export function OrdersPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabStatus>("en_preparacion");
  const [typeFilter, setTypeFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [payTarget, setPayTarget] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [detailTarget, setDetailTarget] = useState<Order | null>(null);
  const [addTarget, setAddTarget] = useState<Order | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const ordersQuery = useQuery({
    queryKey: ["orders", today, tab, typeFilter, search],
    queryFn: () => {
      const params = new URLSearchParams({ date: today, status: tab });
      if (typeFilter !== "todos") params.set("order_type", typeFilter);
      if (search.trim()) params.set("search", search.trim());
      return api.get<Paginated<Order>>(`/orders?${params.toString()}`);
    },
  });

  const counts = useQuery({
    queryKey: ["orders-counts", today],
    queryFn: async () => {
      const [prep, paid, cancelled] = await Promise.all([
        api.get<Paginated<Order>>(`/orders?date=${today}&status=en_preparacion&limit=1`),
        api.get<Paginated<Order>>(`/orders?date=${today}&status=pagado&limit=1`),
        api.get<Paginated<Order>>(`/orders?date=${today}&status=cancelado&limit=1`),
      ]);
      return { en_preparacion: prep.total, pagado: paid.total, cancelado: cancelled.total };
    },
    refetchInterval: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: number) => api.post<Order>(`/orders/${orderId}/cancel`),
    onSuccess: () => {
      setCancelTarget(null);
      setMessage("Orden cancelada.");
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["orders-counts"] });
      setTimeout(() => setMessage(null), 2500);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["orders-counts"] });
      setMessage(error instanceof ApiError && error.code === "INVALID_ORDER_STATE"
        ? "La orden fue actualizada."
        : "No se pudo cancelar la orden. Intenta nuevamente.");
      setTimeout(() => setMessage(null), 3000);
    },
  });

  const orders = ordersQuery.data?.items ?? [];

  return (
    <div>
      <h1>Órdenes del día</h1>
      {message && (
        <p className="badge badge-ok mt-4" role="status">
          {message}
        </p>
      )}

      {/* Tabs con contadores (14.1) */}
      <div className="row mt-4 gap-2.5 flex-wrap">
        {(
          [
            ["en_preparacion", "En preparación"],
            ["pagado", "Pagadas"],
            ["cancelado", "Canceladas"],
          ] as const
        ).map(([status, label]) => (
          <button
            key={status}
            className={tab === status ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setTab(status)}
            aria-pressed={tab === status}
          >
            {label} {counts.data?.[status] ?? 0}
          </button>
        ))}
      </div>

      {/* Filtros visibles (14.2) */}
      <div className="card mt-4 filter-bar">
        <div className="field field--compact">
          <label htmlFor="filter-type">Tipo</label>
          <select id="filter-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="mesa">Mesa</option>
            <option value="delivery">Delivery</option>
            <option value="mostrador">Llevar</option>
          </select>
        </div>
        <div className="field field--compact flex-1">
          <label htmlFor="filter-search">Buscar</label>
          <input
            id="filter-search"
            placeholder="Cliente, mesa o número de orden"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4">
        {ordersQuery.isLoading && <LoadingMessage message="Cargando órdenes…" />}
        {!ordersQuery.isLoading && orders.length === 0 && (
          <EmptyState
            title="No hay órdenes en esta pestaña."
            description="Cuando registres ventas aparecerán aquí."
          />
        )}
        <div className="orders-grid">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onPay={() => setPayTarget(order)}
              onCancel={() => setCancelTarget(order)}
              onAdd={() => setAddTarget(order)}
              onDetail={() => setDetailTarget(order)}
            />
          ))}
        </div>
      </div>

      {payTarget && (
        <PaymentModal
          total={parseFloat(payTarget.total_amount)}
          onConfirm={async (methodId) => {
            try {
              const order = await api.post<Order>(`/orders/${payTarget.id}/pay`, { payment_method_id: methodId });
              setMessage("Pago registrado correctamente.");
              void queryClient.invalidateQueries({ queryKey: ["orders"] });
              void queryClient.invalidateQueries({ queryKey: ["orders-counts"] });
              void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
              setTimeout(() => setMessage(null), 2500);
              return order;
            } catch (error) {
              void queryClient.invalidateQueries({ queryKey: ["orders"] });
              void queryClient.invalidateQueries({ queryKey: ["orders-counts"] });
              if (error instanceof ApiError && error.code === "INVALID_ORDER_STATE") {
                setMessage("La orden fue actualizada.");
              }
              throw error;
            }
          }}
          onClose={() => setPayTarget(null)}
        />
      )}

      {cancelTarget && (
        <Modal title={`Cancelar orden #${String(cancelTarget.id).padStart(3, "0")}`} onClose={() => setCancelTarget(null)}>
          <p className="text-important">
            Esta orden dejará de contarse como venta. ¿Deseas continuar?
          </p>
          <div className="row mt-6 justify-end">
            <button className="btn btn-secondary btn-large" onClick={() => setCancelTarget(null)}>
              No, volver
            </button>
            <button
              className="btn btn-danger btn-large"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate(cancelTarget.id)}
            >
              {cancelMutation.isPending ? "Cancelando…" : "Sí, cancelar orden"}
            </button>
          </div>
        </Modal>
      )}

      {detailTarget && (
        <Modal title={`Orden #${String(detailTarget.id).padStart(3, "0")}`} onClose={() => setDetailTarget(null)}>
          <OrderSummary order={detailTarget} />
        </Modal>
      )}

      {addTarget && <AddProductsModal order={addTarget} onClose={() => setAddTarget(null)} />}
    </div>
  );
}

function OrderCard({
  order,
  onPay,
  onCancel,
  onAdd,
  onDetail,
}: {
  order: Order;
  onPay: () => void;
  onCancel: () => void;
  onAdd: () => void;
  onDetail: () => void;
}) {
  const isPaid = order.status === "pagado";
  const accent = isPaid
    ? "border-l-4 border-l-brand-green"
    : order.status === "cancelado"
      ? "border-l-4 border-l-brand-red"
      : "border-l-4 border-l-brand-orange";
  return (
    <article className={`card ${accent}`}>
      <button
        type="button"
        onClick={onDetail}
        className="card-link"
        aria-label={`Ver detalle de la orden ${order.id}`}
      >
        <div className="row-between">
          <strong className="text-important">#{String(order.id).padStart(3, "0")}</strong>
          <span className="text-secondary text-aux">{formatTime(order.created_at)}</span>
          <span className="badge badge-neutral">
            {order.order_type === "mesa" ? `MESA ${order.table_number ?? ""}` : order.order_type === "delivery" ? "DELIVERY" : "LLEVAR"}
          </span>
        </div>
        {order.customer_name && <p>{order.customer_name}</p>}
      </button>

      <ul className="clean-list--spaced">
        {order.details.map((detail) => (
          <li key={detail.id} className="text-aux">
            {detail.quantity} × {detail.product_name}
            {detail.config_label ? ` — ${detail.config_label}` : ""}
          </li>
        ))}
      </ul>

      <p className="kpi-label">Total a cobrar</p>
      <p className="kpi-value">
        {formatMoney(order.total_amount)}
      </p>

      {isPaid ? (
        <p className="badge badge-ok mt-4">PAGADO · {order.payment_method_name}</p>
      ) : order.status === "cancelado" ? (
        <p className="badge badge-danger mt-4">CANCELADA</p>
      ) : (
        <div className="stack mt-4 gap-2.5">
          <div className="row gap-2">
            <button className="btn btn-secondary flex-1" onClick={onAdd}>
              Agregar producto
            </button>
            <button className="btn btn-green flex-1" onClick={onPay}>
              Marcar como pagado
            </button>
          </div>
          <button className="btn btn-danger btn-block" onClick={onCancel}>
            Cancelar orden
          </button>
        </div>
      )}
    </article>
  );
}

function OrderSummary({ order }: { order: Order }) {
  return (
    <div>
      <p className="text-secondary text-aux">
        {formatDate(order.created_at)} · {formatTime(order.created_at)} · Atendió: {order.user_name ?? "—"}
      </p>
      <ul className="clean-list">
        {order.details.map((detail) => (
          <li key={detail.id} className="row-between list-divider">
            <span>
              {detail.quantity} × {detail.product_name}
              {detail.config_label ? ` — ${detail.config_label}` : ""}
            </span>
            <strong>{formatMoney(detail.subtotal)}</strong>
          </li>
        ))}
      </ul>
      <div className="row-between mt-4 text-important-bold">
        <span>Total</span>
        <span>{formatMoney(order.total_amount)}</span>
      </div>
      {order.payment_method_name && (
        <p className="badge badge-ok mt-4">
          PAGADO · {order.payment_method_name}
        </p>
      )}
    </div>
  );
}

/** Modal 15 — Agregar productos a una orden existente. */
function AddProductsModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<
    { product: Product; quantity: number; option_ids: number[]; unit_price: number }[]
  >([]);
  const [category, setCategory] = useState<number | null>(null);
  const [assembling, setAssembling] = useState<Product | null>(null);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });
  const products = useQuery({
    queryKey: ["products", category, "add"],
    queryFn: () => api.get<Product[]>(`/products?active=true${category ? `&category_id=${category}` : ""}`),
  });

  const estimatedTotal = useMemo(() => lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0), [lines]);

  const openAssembler = async (product: Product) => {
    if (!product.has_options) {
      setLines((prev) => [...prev, { product, quantity: 1, option_ids: [], unit_price: parseFloat(product.base_price) }]);
      setMessage(`${product.name} agregada.`);
      setTimeout(() => setMessage(null), 1800);
      return;
    }
    const productGroups = await api.get<OptionGroup[]>(`/products/${product.id}/option-groups`);
    setGroups(productGroups);
    setAssembling(product);
  };

  const submit = async () => {
    if (lines.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/orders/${order.id}/details/batch`, {
        items: lines.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          option_ids: line.option_ids,
        })),
      });
      setMessage("Productos agregados a la orden.");
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      setTimeout(() => onClose(), 800);
    } catch (requestError) {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      setError(requestError instanceof ApiError && requestError.code === "INVALID_ORDER_STATE"
        ? "La orden fue actualizada."
        : "No se pudieron agregar los productos. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <Modal title={`Agregar productos a la orden #${String(order.id).padStart(3, "0")}`} onClose={onClose} wide>
      <div className="row gap-2.5 flex-wrap mb-5">
        {(categories.data ?? []).map((c) => (
          <button
            key={c.id}
            className={category === c.id ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setCategory(category === c.id ? null : c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="products-tiles">
        {(products.data ?? []).map((product) => (
          <div key={product.id} className="card card-tile">
            <h3 className="text-important">{product.name}</h3>
            <p className="text-secondary">Desde {formatMoney(product.base_price)}</p>
            <button className="btn btn-primary mt-auto" onClick={() => void openAssembler(product)}>
              Agregar
            </button>
          </div>
        ))}
      </div>

      {lines.length > 0 && (
        <div className="card mt-4">
          <h3 className="text-important">Nuevos productos</h3>
          <ul className="clean-list mt-2">
            {lines.map((line, index) => (
              <li key={`${line.product.id}-${index}`} className="row-between list-divider">
                <span>{line.product.name} x{line.quantity}</span>
                <strong>{formatMoney(line.unit_price * line.quantity)}</strong>
              </li>
            ))}
          </ul>
          <div className="row-between mt-3 text-important-bold">
            <span>Se agregarán</span>
            <span>{formatMoney(estimatedTotal)}</span>
          </div>
        </div>
      )}

      {error && <p className="field-error mt-4" role="alert">{error}</p>}

      {message && (
        <p className="badge badge-ok mt-4" role="status">
          {message}
        </p>
      )}

      <div
        className="row-between mt-4 modal-actions border-t-2 border-line pt-4"
      >
        <span className="font-extrabold">
          Se agregarán {itemCount} producto{itemCount === 1 ? "" : "s"}
        </span>
        <div className="row gap-2.5">
          <button className="btn btn-secondary btn-large" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary btn-large" disabled={lines.length === 0 || saving} onClick={() => void submit()}>
            {saving ? "Agregando…" : "Agregar a la orden"}
          </button>
        </div>
      </div>

      {assembling && (
        <ProductAssemblerModal
          product={assembling}
          groups={groups}
          allowsMultipleIngredients={
            categories.data?.find((category) => category.id === assembling.category_id)?.allows_multiple_ingredients ?? false
          }
          onAdd={(result: AssemblerResult) => {
            const unitPrice = parseFloat(result.product.base_price) + result.options.reduce((sum, option) => sum + option.extra_cost, 0);
            setLines((prev) => [...prev, {
              product: result.product,
              quantity: result.quantity,
              option_ids: result.option_ids,
              unit_price: unitPrice,
            }]);
            setAssembling(null);
            setMessage(`${result.product.name} agregada.`);
            setTimeout(() => setMessage(null), 1800);
          }}
          onClose={() => setAssembling(null)}
        />
      )}
    </Modal>
  );
}
