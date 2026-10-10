import { describe, expect, it } from "vitest";
import {
  ceilToHalf,
  comparablePrices,
  marginOf,
  priceWithMargin,
  suggestPrice,
} from "../lib/pricing";
import type { Ingredient, Option, OptionGroup, Product, RecipeComponent } from "../types";

const SIZES: Option[] = [
  { id: 1, group_id: 9, name: "personal", extra_cost: "0.00", linked_ingredient_id: null, is_active: true },
  { id: 2, group_id: 9, name: "pareja", extra_cost: "1.00", linked_ingredient_id: null, is_active: true },
  { id: 3, group_id: 9, name: "familiar", extra_cost: "2.00", linked_ingredient_id: null, is_active: true },
];

const OPTION_GROUPS: OptionGroup[] = [
  {
    id: 2,
    name: "fruta",
    options: [
      { id: 10, group_id: 2, name: "fresa", extra_cost: "0.00", linked_ingredient_id: 1, is_active: true },
      { id: 11, group_id: 2, name: "mango", extra_cost: "0.00", linked_ingredient_id: 3, is_active: true },
    ],
  },
  {
    id: 3,
    name: "base",
    options: [
      { id: 20, group_id: 3, name: "agua", extra_cost: "0.00", linked_ingredient_id: 2, is_active: true },
    ],
  },
];

function ingredient(
  id: number,
  name: string,
  baseUnit: string,
  lastUnitCost: string | null,
): Ingredient {
  return {
    id,
    name,
    category: "prueba",
    base_unit: baseUnit,
    last_unit_cost: lastUnitCost,
    unit_name: null,
    unit_weight: null,
    current_stock: "10",
    min_stock_alert: "1",
    updated_at: null,
    state: "BIEN",
  };
}

const INGREDIENTS: Ingredient[] = [
  ingredient(1, "fresa", "kg", "8"),
  ingredient(2, "agua", "ml", "0.002"),
  ingredient(3, "mango", "kg", "12"),
  ingredient(4, "azucar", "g", "0.004"),
];

function component(
  ingredientId: number,
  optionId: number | null,
  quantity: string,
  sizeOptionId: number | null,
): RecipeComponent {
  return {
    ingredient_id: ingredientId,
    option_id: optionId,
    size_option_id: sizeOptionId,
    quantity_per_unit: quantity,
    size_multiplier: null,
  };
}

const RECIPE: RecipeComponent[] = [
  component(1, 10, "0.03", 1), // fresa: 0.03 kg × 8 = 0.24
  component(3, 11, "0.05", 1), // mango: 0.05 kg × 12 = 0.60
  component(2, 20, "150", 1), // agua: 150 ml × 0.002 = 0.30
  component(4, null, "10", 1), // azúcar: 10 g × 0.004 = 0.04 (siempre)
  // Fila de otro tamaño: no debe contar para el precio base.
  component(1, 10, "0.06", 2),
];

describe("suggestPrice", () => {
  it("suma los insumos fijos y promedia las alternativas por grupo", () => {
    const result = suggestPrice({
      components: RECIPE,
      ingredients: INGREDIENTS,
      optionGroups: OPTION_GROUPS,
      sizes: SIZES,
      marginPct: 60,
    });

    // fruta = promedio(0.24, 0.60) = 0.42; base = 0.30; siempre = 0.04
    expect(result.cost).toBeCloseTo(0.76, 3);
    // 0.76 × 1.6 = 1.216 -> sube a 1.50
    expect(result.suggested).toBe(1.5);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
    // No cuenta la fila de "pareja".
    expect(result.lines).toHaveLength(4);
  });

  it("avisa qué insumos no tienen costo registrado", () => {
    const ingredients = INGREDIENTS.map((i) =>
      i.id === 4 ? { ...i, last_unit_cost: null } : i,
    );
    const result = suggestPrice({
      components: RECIPE,
      ingredients,
      optionGroups: OPTION_GROUPS,
      sizes: SIZES,
    });

    expect(result.complete).toBe(false);
    expect(result.missing).toContain("azucar");
  });

  it("sin receta no puede estimar el costo", () => {
    const result = suggestPrice({
      components: [],
      ingredients: INGREDIENTS,
      optionGroups: OPTION_GROUPS,
      sizes: SIZES,
    });
    expect(result.cost).toBe(0);
    expect(result.suggested).toBe(0);
    expect(result.complete).toBe(false);
  });

  it("sin costos de receta sugiere según la mediana de productos parecidos", () => {
    const products = [product(1, "5.00", 1), product(2, "7.00", 1), product(3, "9.00", 1)];
    const result = suggestPrice({
      components: RECIPE,
      ingredients: INGREDIENTS.map((i) => ({ ...i, last_unit_cost: null })),
      optionGroups: OPTION_GROUPS,
      sizes: SIZES,
      products,
      categoryId: 1,
    });

    expect(result.basis).toBe("comparables");
    expect(result.suggested).toBe(7);
  });

  it("respeta el margen elegido", () => {
    const result = suggestPrice({
      components: RECIPE,
      ingredients: INGREDIENTS,
      optionGroups: OPTION_GROUPS,
      sizes: SIZES,
      marginPct: 30,
    });
    // 0.76 × 1.30 = 0.988 -> 1.00
    expect(result.suggested).toBe(1);
  });
});

function product(id: number, price: string, categoryId: number | null, isActive = true): Product {
  return {
    id,
    category_id: categoryId,
    name: `producto ${id}`,
    base_price: price,
    is_active: isActive,
    category_name: null,
    option_group_ids: [],
    has_options: false,
    has_recipe: false,
    recipe_components: [],
  };
}

describe("comparablePrices", () => {
  it("calcula mínimo, mediana y máximo de la misma categoría", () => {
    const products = [
      product(1, "5.00", 1),
      product(2, "7.00", 1),
      product(3, "9.00", 1),
      product(4, "4.00", 2), // otra categoría
      product(5, "100.00", 1, false), // inactivo
    ];
    const result = comparablePrices(products, 1, null);
    expect(result).toEqual({ count: 3, min: 5, max: 9, median: 7 });
  });

  it("excluye el producto que se está editando y devuelve null sin datos", () => {
    const products = [product(1, "5.00", 1), product(2, "7.00", 1)];
    expect(comparablePrices(products, 1, 1)?.count).toBe(1);
    expect(comparablePrices(products, 1, 1)?.median).toBe(7);
    expect(comparablePrices([], 1, null)).toBeNull();
  });
});

describe("redondeo y margen", () => {
  it("sube al siguiente múltiplo de S/ 0.50", () => {
    expect(ceilToHalf(1.216)).toBe(1.5);
    expect(ceilToHalf(4.0)).toBe(4);
    expect(ceilToHalf(0)).toBe(0);
  });

  it("calcula el margen real del precio sobre el costo", () => {
    expect(marginOf(8, 5)).toBe(60);
    expect(marginOf(1, 0)).toBeNull();
  });

  it("priceWithMargin combina margen y redondeo", () => {
    expect(priceWithMargin(5, 60)).toBe(8);
  });
});
