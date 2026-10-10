// Estado local del ensamblador/carrito con Zustand (sección 3.1).
// Se mantiene pequeño: el backend es la fuente de verdad de los totales.

import { create } from "zustand";

export interface CartLine {
  key: string;
  product_id: number;
  product_name: string;
  quantity: number;
  base_price: number;
  options: { id: number; name: string; extra_cost: number; group_name: string }[];
  notes: string | null;
}

export interface CartOrderInfo {
  order_type: "mesa" | "delivery" | "mostrador";
  table_number: string | null;
  customer_name: string | null;
}

interface CartState {
  lines: CartLine[];
  orderInfo: CartOrderInfo;
  addLine: (line: Omit<CartLine, "key">) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  setOrderType: (type: CartOrderInfo["order_type"]) => void;
  setTableNumber: (value: string | null) => void;
  setCustomerName: (value: string | null) => void;
  clear: () => void;
}

function computeKey(line: Omit<CartLine, "key">): string {
  const optionIds = line.options
    .map((o) => o.id)
    .sort((a, b) => a - b)
    .join("-");
  return `${line.product_id}:${optionIds}:${line.notes ?? ""}`;
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  orderInfo: { order_type: "mostrador", table_number: null, customer_name: null },

  addLine: (line) =>
    set((state) => {
      const key = computeKey(line);
      const existing = state.lines.find((l) => l.key === key);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.key === key ? { ...l, quantity: Math.min(l.quantity + line.quantity, 99) } : l,
          ),
        };
      }
      return { lines: [...state.lines, { ...line, key }] };
    }),

  updateQuantity: (key, quantity) =>
    set((state) => ({
      lines:
        quantity <= 0
          ? state.lines.filter((l) => l.key !== key)
          : state.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(quantity, 99) } : l)),
    })),

  removeLine: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),

  setOrderType: (order_type) => set((state) => ({ orderInfo: { ...state.orderInfo, order_type } })),
  setTableNumber: (table_number) => set((state) => ({ orderInfo: { ...state.orderInfo, table_number } })),
  setCustomerName: (customer_name) => set((state) => ({ orderInfo: { ...state.orderInfo, customer_name } })),

  clear: () => set({ lines: [], orderInfo: { order_type: "mostrador", table_number: null, customer_name: null } }),
}));

export function lineUnitPrice(line: CartLine): number {
  const extras = line.options.reduce((sum, o) => sum + o.extra_cost, 0);
  return line.base_price + extras;
}

export function lineSubtotal(line: CartLine): number {
  return lineUnitPrice(line) * line.quantity;
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
}
