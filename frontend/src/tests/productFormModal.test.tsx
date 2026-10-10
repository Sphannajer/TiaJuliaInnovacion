import { describe, expect, it, vi, type Mock } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductFormModal } from "../features/products/ProductFormModal";
import { api } from "../lib/api";
import type { Category, Ingredient, OptionGroup, Product } from "../types";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const CATEGORIES: Category[] = [{ id: 1, name: "jugos", allows_multiple_ingredients: true }];

const GROUPS: OptionGroup[] = [
  {
    id: 1,
    name: "tamaño",
    options: [
      { id: 1, group_id: 1, name: "personal", extra_cost: "0.00", linked_ingredient_id: null, is_active: true },
      { id: 2, group_id: 1, name: "pareja", extra_cost: "1.00", linked_ingredient_id: null, is_active: true },
    ],
  },
  {
    id: 2,
    name: "fruta",
    options: [
      { id: 10, group_id: 2, name: "fresa", extra_cost: "0.00", linked_ingredient_id: 1, is_active: true },
    ],
  },
];

const INGREDIENTS: Ingredient[] = [
  {
    id: 1,
    name: "fresa",
    category: "fruta",
    base_unit: "kg",
    last_unit_cost: "8",
    unit_name: "fresa",
    unit_weight: "0.015",
    current_stock: "5",
    min_stock_alert: "1",
    updated_at: null,
    state: "BIEN",
  },
];

const PRODUCT: Product = {
  id: 5,
  category_id: 1,
  name: "jugo de fresa",
  base_price: "5.00",
  is_active: true,
  category_name: "jugos",
  option_group_ids: [1, 2],
  has_options: true,
  has_recipe: true,
  recipe_components: [
    {
      ingredient_id: 1,
      option_id: 10,
      size_option_id: 1,
      quantity_per_unit: "0.03",
      size_multiplier: null,
    },
  ],
};

function renderModal(product: Product | null, ingredients: Ingredient[] = INGREDIENTS) {
  (api.get as Mock).mockImplementation((path: string) => {
    if (path === "/categories") return Promise.resolve(CATEGORIES);
    if (path === "/option-groups") return Promise.resolve(GROUPS);
    if (path === "/ingredients") return Promise.resolve(ingredients);
    return Promise.resolve([]);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductFormModal product={product} products={[product ?? PRODUCT]} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("ProductFormModal", () => {
  it("muestra los pasos y la sugerencia de precio desde la receta", async () => {
    renderModal(PRODUCT);

    expect(await screen.findByText("¿Qué vas a crear?")).toBeInTheDocument();
    expect(screen.getByText("Precio base")).toBeInTheDocument();
    expect(screen.getByText("Receta: qué insumos se descuentan")).toBeInTheDocument();

    // 0.03 kg × S/ 8 = S/ 0.24 -> +60% = 0.384 -> sube a S/ 0.50.
    expect(await screen.findByText("S/ 0.50")).toBeInTheDocument();
    expect(screen.getByText(/Costo de insumos S\/ 0.24/)).toBeInTheDocument();
  });

  it("el botón Usar escribe la sugerencia en el precio base", async () => {
    renderModal(PRODUCT);

    // Espera a que carguen los insumos y se habilite la sugerencia.
    await screen.findByText("S/ 0.50");
    const apply = screen.getByRole("button", { name: /^usar$/i });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    const priceInput = screen.getByLabelText("¿Cuánto vas a cobrar?") as HTMLInputElement;
    expect(priceInput.value).toBe("0.50");
  });

  it("avisa cuando un insumo no tiene costo registrado", async () => {
    renderModal(PRODUCT, [{ ...INGREDIENTS[0], last_unit_cost: null }]);

    expect(await screen.findByText(/Sin costo registrado: fresa/i)).toBeInTheDocument();
  });
});
