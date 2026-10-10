import { describe, expect, it, beforeEach } from "vitest";
import { useCartStore, lineUnitPrice, lineSubtotal, cartTotal } from "../store/cartStore";

function resetCart() {
  useCartStore.setState({ lines: [], orderInfo: { order_type: "mostrador", table_number: null, customer_name: null } });
}

describe("cartStore", () => {
  beforeEach(resetCart);

  it("agrega una línea al carrito", () => {
    useCartStore.getState().addLine({ product_id: 1, product_name: "Jugo Especial", quantity: 1, base_price: 10, options: [], notes: null });
    const lines = useCartStore.getState().lines;
    expect(lines.length).toBe(1);
    expect(lines[0].quantity).toBe(1);
  });

  it("fusiona líneas idénticas sumando cantidad", () => {
    const { addLine } = useCartStore.getState();
    addLine({ product_id: 1, product_name: "Empanada", quantity: 1, base_price: 4, options: [], notes: null });
    addLine({ product_id: 1, product_name: "Empanada", quantity: 2, base_price: 4, options: [], notes: null });
    expect(useCartStore.getState().lines.length).toBe(1);
    expect(useCartStore.getState().lines[0].quantity).toBe(3);
  });

  it("separa líneas con opciones distintas", () => {
    const { addLine } = useCartStore.getState();
    addLine({
      product_id: 2,
      product_name: "Jugo Especial",
      quantity: 1,
      base_price: 10,
      options: [{ id: 3, name: "Grande", extra_cost: 2, group_name: "Tamaño" }],
      notes: null,
    });
    addLine({ product_id: 2, product_name: "Jugo Especial", quantity: 1, base_price: 10, options: [], notes: null });
    expect(useCartStore.getState().lines.length).toBe(2);
  });

  it("updateQuantity a cero elimina la línea", () => {
    const { addLine, updateQuantity } = useCartStore.getState();
    addLine({ product_id: 1, product_name: "Pan", quantity: 1, base_price: 5, options: [], notes: null });
    const key = useCartStore.getState().lines[0].key;
    updateQuantity(key, 0);
    expect(useCartStore.getState().lines.length).toBe(0);
  });
});

describe("reglas de precio (26.1)", () => {
  it("unit_price = base + extras", () => {
    const unit = lineUnitPrice({
      key: "k",
      product_id: 2,
      product_name: "Jugo Especial",
      quantity: 1,
      base_price: 10,
      options: [
        { id: 3, name: "Grande", extra_cost: 2, group_name: "Tamaño" },
        { id: 5, name: "Fresa", extra_cost: 0.5, group_name: "Fruta" },
        { id: 9, name: "Leche", extra_cost: 2, group_name: "Base" },
      ],
      notes: null,
    });
    expect(unit).toBeCloseTo(14.5);
  });

  it("subtotal = unit_price × cantidad", () => {
    const subtotal = lineSubtotal({
      key: "k",
      product_id: 2,
      product_name: "Jugo Especial",
      quantity: 2,
      base_price: 10,
      options: [{ id: 3, name: "Grande", extra_cost: 2, group_name: "Tamaño" }],
      notes: null,
    });
    expect(subtotal).toBeCloseTo(24);
  });

  it("total del carrito = suma de subtotales", () => {
    const lines = [
      { key: "a", product_id: 1, product_name: "Jugo", quantity: 1, base_price: 12.5, options: [], notes: null },
      { key: "b", product_id: 4, product_name: "Empanada", quantity: 3, base_price: 4, options: [], notes: null },
    ];
    expect(cartTotal(lines)).toBeCloseTo(24.5);
  });
});
