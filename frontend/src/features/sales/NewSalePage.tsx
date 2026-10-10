import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, uuid } from "../../lib/api";
import { useCartStore, lineSubtotal, cartTotal, type CartLine } from "../../store/cartStore";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { ProductAssemblerModal } from "./ProductAssemblerModal";
import { PaymentModal } from "./PaymentModal";
import { LiveMessage } from "../../components/ui/LiveMessage";
import { formatMoney } from "../../lib/currency";
import type { Category, OptionGroup, OrderResponse, Product } from "../../types";

/**
 * Pantalla 2 — Registrar venta (sección 11).
 * Objetivo: registrar una venta de jugo en ≤1 minuto.
 */
export function NewSalePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cart = useCartStore();
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [assembler, setAssembler] = useState<{ product: Product; groups: OptionGroup[] } | null>(null);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCustomerName, setShowCustomerName] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  });

  const products = useQuery({
    queryKey: ["products", activeCategory],
    queryFn: () => api.get<Product[]>(`/products?active=true${activeCategory ? `&category_id=${activeCategory}` : ""}`),
  });

  const categoryOf = useMemo(
    () => (product: Product) => categories.data?.find((c) => c.id === product.category_id),
    [categories.data],
  );

  const openAssembler = async (product: Product) => {
    if (!product.has_options) {
      cart.addLine({
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        base_price: parseFloat(product.base_price),
        options: [],
        notes: null,
      });
      setMessage(`${product.name} agregada al pedido.`);
      setTimeout(() => setMessage(null), 2200);
      return;
    }
    const groups = await api.get<OptionGroup[]>(`/products/${product.id}/option-groups`);
    setAssembler({ product, groups });
  };

  const addToCart = (result: { product: Product; quantity: number; option_ids: number[]; options: { id: number; name: string; extra_cost: number; group_name: string }[] }) => {
    cart.addLine({
      product_id: result.product.id,
      product_name: result.product.name,
      quantity: result.quantity,
      base_price: parseFloat(result.product.base_price),
      options: result.options,
      notes: null,
    });
    setAssembler(null);
    setMessage(`${result.product.name} agregada al pedido.`);
    setTimeout(() => setMessage(null), 2200);
  };

  const validateOrderInfo = (): string | null => {
    if (cart.orderInfo.order_type === "mesa" && !(cart.orderInfo.table_number ?? "").trim()) {
      return "Escribe el número o nombre de la mesa.";
    }
    if (cart.lines.length === 0) {
      return "Agrega al menos un producto al pedido.";
    }
    return null;
  };

  const buildPayload = () => {
    const activeUserId = Number(localStorage.getItem("active_user_id") ?? 0);
    return {
      user_id: JSON.parse(localStorage.getItem("active_user") ?? '{"id":1}').id,
      order_type: cart.orderInfo.order_type,
      customer_name:
        cart.orderInfo.order_type === "delivery" || showCustomerName
          ? cart.orderInfo.customer_name
          : null,
      table_number: cart.orderInfo.order_type === "mesa" ? cart.orderInfo.table_number : null,
      pay_now: false,
      items: cart.lines.map((line) => ({
        product_id: line.product_id,
        quantity: line.quantity,
        option_ids: line.options.map((o) => o.id),
        notes: line.notes,
      })),
    };
  };

  const saveOrder = async () => {
    const validation = validateOrderInfo();
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = { ...buildPayload(), pay_now: false };
      await api.post<OrderResponse>("/orders", payload, uuid());
      cart.clear();
      setMessage("Orden guardada.");
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      setTimeout(() => setMessage(null), 2200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const payNow = async (paymentMethodId: number) => {
    const validation = validateOrderInfo();
    if (validation) {
      setError(validation);
      return null;
    }
    const payload = { ...buildPayload(), pay_now: true, payment_method_id: paymentMethodId };
    const response = await api.post<OrderResponse>("/orders", payload, uuid());
    cart.clear();
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    return response.order;
  };

  const total = cartTotal(cart.lines);

  return (
    <div>
      <div className="row-between gap-4 flex-wrap">
        <h1>Registrar venta</h1>
        <SegmentedControl
          ariaLabel="Tipo de orden"
          options={[
            { value: "mesa", label: "Mesa" },
            { value: "delivery", label: "Delivery" },
            { value: "mostrador", label: "Llevar" },
          ]}
          value={cart.orderInfo.order_type}
          onChange={(value) => cart.setOrderType(value as typeof cart.orderInfo.order_type)}
          size="large"
        />
      </div>

      {error && (
        <p className="field-error mt-4" role="alert">
          {error}
        </p>
      )}

      <div className="sales-layout mt-4">
        {/* Catálogo 62-64% */}
        <section aria-label="Catálogo de productos">
          {cart.orderInfo.order_type === "mesa" && (
            <div className="field field--wide">
              <label htmlFor="table-number">Número o nombre de mesa</label>
              <input
                id="table-number"
                placeholder="Mesa 4"
                value={cart.orderInfo.table_number ?? ""}
                onChange={(e) => cart.setTableNumber(e.target.value)}
              />
            </div>
          )}
          {cart.orderInfo.order_type === "delivery" && (
            <div className="field field--wide">
              <label htmlFor="customer-name">Nombre del cliente</label>
              <input
                id="customer-name"
                placeholder="María López"
                value={cart.orderInfo.customer_name ?? ""}
                onChange={(e) => cart.setCustomerName(e.target.value)}
              />
            </div>
          )}
          {cart.orderInfo.order_type === "mostrador" && (
            <div className="field field--wide">
              {!showCustomerName ? (
                <button className="btn btn-secondary" onClick={() => setShowCustomerName(true)}>
                  + Agregar nombre del cliente
                </button>
              ) : (
                <>
                  <label htmlFor="customer-name-opt">Nombre del cliente (opcional)</label>
                  <input
                    id="customer-name-opt"
                    value={cart.orderInfo.customer_name ?? ""}
                    onChange={(e) => cart.setCustomerName(e.target.value)}
                  />
                </>
              )}
            </div>
          )}

          {/* Categorías: botones grandes con texto (11.3) */}
          <div className="category-bar">
            <button
              className={activeCategory === null ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => setActiveCategory(null)}
            >
              Todos
            </button>
            {(categories.data ?? []).map((category) => (
              <button
                key={category.id}
                className={activeCategory === category.id ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => setActiveCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>

          {products.isLoading && <p className="text-secondary">Cargando productos…</p>}

          <div className="products-tiles">
            {(products.data ?? []).map((product) => (
              <ProductTile key={product.id} product={product} onAdd={() => void openAssembler(product)} />
            ))}
          </div>
        </section>

        {/* Resumen del pedido 36-38% */}
        <aside aria-label="Pedido actual" className="card order-summary">
          <h2>Pedido actual</h2>
          <p className="text-secondary text-aux">
            Tipo: {cart.orderInfo.order_type === "mostrador" ? "Llevar" : cart.orderInfo.order_type === "mesa" ? `Mesa ${cart.orderInfo.table_number ?? ""}` : "Delivery"}
          </p>

          {cart.lines.length === 0 ? (
            <p className="text-secondary mt-4">
              Toca un producto para agregarlo al pedido.
            </p>
          ) : (
            <ul className="cart-lines">
              {cart.lines.map((line, index) => (
                <CartLineRow
                  key={line.key}
                  line={line}
                  index={index}
                  onUpdateQuantity={(qty) => cart.updateQuantity(line.key, qty)}
                  onRemove={() => cart.removeLine(line.key)}
                />
              ))}
            </ul>
          )}

          <div className="row-between mt-4 border-t-2 border-line pt-4 text-important-bold">
            <span>Total</span>
            <span aria-live="polite">{formatMoney(total)}</span>
          </div>

          <div className="stack mt-4 gap-2.5">
            <button className="btn btn-secondary btn-large btn-block" disabled={saving || cart.lines.length === 0} onClick={() => void saveOrder()}>
              Guardar orden
            </button>
            <button className="btn btn-primary btn-large btn-block" disabled={cart.lines.length === 0} onClick={() => setPayModalOpen(true)}>
              {saving ? "Guardando venta…" : `Cobrar ${formatMoney(total)}`}
            </button>
          </div>
        </aside>
      </div>

      {assembler && (
        <ProductAssemblerModal
          product={assembler.product}
          groups={assembler.groups}
          allowsMultipleIngredients={
            categoryOf(assembler.product)?.allows_multiple_ingredients ?? false
          }
          onAdd={addToCart}
          onClose={() => setAssembler(null)}
        />
      )}

      {payModalOpen && (
        <PaymentModal
          total={total}
          onConfirm={payNow}
          onClose={() => setPayModalOpen(false)}
          onRegisterAnother={() => navigate("/sales/new")}
          onWatchOrder={(orderId) => navigate("/orders")}
        />
      )}

      <LiveMessage message={message} />
    </div>
  );
}

function ProductTile({ product, onAdd }: { product: Product; onAdd: () => void }) {
  return (
    <div className="card card-tile border-2 transition-colors hover:-translate-y-0.5 hover:border-brand-orange">
      <h3 className="text-important">{product.name}</h3>
      <p className="text-secondary">
        Desde <strong className="text-brand-red">{formatMoney(product.base_price)}</strong>
      </p>
      <button className="btn btn-primary mt-auto" onClick={onAdd}>
        Agregar
      </button>
    </div>
  );
}

function CartLineRow({
  line,
  index,
  onUpdateQuantity,
  onRemove,
}: {
  line: CartLine;
  index: number;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const configLabel = line.options.map((o) => o.name).join(" + ");
  return (
    <li className="list-divider">
      <div className="row-between">
        <strong>
          {index + 1}. {line.product_name}
        </strong>
        <strong>{formatMoney(lineSubtotal(line))}</strong>
      </div>
      {configLabel && (
        <p className="text-secondary text-aux">{line.options.map((o) => o.name).join(" · ")}</p>
      )}
      <div className="row gap-2 mt-2">
        <button className="btn btn-secondary qty-btn" aria-label={`Quitar un ${line.product_name}`} onClick={() => onUpdateQuantity(line.quantity - 1)}>
          −
        </button>
        <span className="font-extrabold min-w-[28px] text-center" aria-live="polite">{line.quantity}</span>
        <button className="btn btn-secondary qty-btn" aria-label={`Agregar un ${line.product_name}`} onClick={() => onUpdateQuantity(line.quantity + 1)}>
          +
        </button>
        <button className="btn btn-secondary ml-auto touch-lg" onClick={onRemove}>
          Quitar
        </button>
      </div>
    </li>
  );
}
