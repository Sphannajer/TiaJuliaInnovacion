/**
 * Sugerencia de precio base (sección 8 del README maestro).
 *
 * La dueña no siempre sabe cuánto cobrar por un producto nuevo. Este módulo
 * estima el precio a partir de dos señales reales, sin inventar nada:
 *
 *  1. Costo de la receta: suma (cantidad × último costo de compra) de cada
 *     insumo. Los insumos que el cliente elige (fruta, base) se promedian por
 *     grupo, porque en cada venta solo se elige una alternativa.
 *  2. Productos comparables: el rango de precios de la misma categoría sirve
 *     como contraste ("lo que ya cobras por cosas parecidas").
 *
 * Todo es cálculo puro para poder probarlo y para que la sugerencia se
 * actualice en vivo mientras se arma la receta.
 */

import type { Ingredient, Option, OptionGroup, Product, RecipeComponent } from "../types";
import { round3, toNumber } from "./stock";

/** Margen por defecto sobre el costo de los insumos. */
export const DEFAULT_MARGIN_PCT = 60;

/** Márgenes rápidos que se ofrecen como botones en el modal. */
export const MARGIN_CHOICES: { value: number; label: string; hint: string }[] = [
  { value: 40, label: "40%", hint: "Ajustado" },
  { value: 60, label: "60%", hint: "Recomendado" },
  { value: 80, label: "80%", hint: "Cómodo" },
  { value: 120, label: "120%", hint: "Alto" },
];

export interface PriceLine {
  ingredientId: number;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  subtotal: number;
  /** "siempre" = va en toda venta; "opcion" = depende de lo que elija el cliente. */
  source: "siempre" | "opcion";
  /** Grupo de opciones al que pertenece (fruta, base…), si aplica. */
  groupName: string | null;
}

export interface PriceComparables {
  count: number;
  min: number;
  max: number;
  median: number;
}

/** De dónde sale la sugerencia: de la receta, de productos parecidos o de nada. */
export type SuggestionBasis = "receta" | "comparables" | "none";

export interface PriceSuggestion {
  /** Costo estimado de los insumos de una venta del tamaño más pequeño. */
  cost: number;
  /** Precio sugerido = costo + margen, redondeado hacia arriba a S/ 0.50. */
  suggested: number;
  basis: SuggestionBasis;
  marginPct: number;
  /** true cuando todos los insumos de la receta tienen costo registrado. */
  complete: boolean;
  /** Insumos de la receta sin costo de compra conocido. */
  missing: string[];
  lines: PriceLine[];
  comparables: PriceComparables | null;
}

export interface SuggestPriceInput {
  components: RecipeComponent[];
  ingredients: Ingredient[];
  optionGroups: OptionGroup[];
  /** Tamaños del producto, en orden (personal, pareja, familiar…). */
  sizes?: Option[];
  /** Catálogo para calcular comparables. */
  products?: Product[];
  categoryId?: number | null;
  /** Producto que se está editando, para no compararlo consigo mismo. */
  excludeProductId?: number | null;
  marginPct?: number;
}

/** Redondea a múltiplos de S/ 0.50 (los precios típicos de una juguería). */
export function roundToHalf(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 2) / 2;
}

/** Sube al siguiente múltiplo de S/ 0.50 para no cobrar por debajo del margen. */
export function ceilToHalf(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value * 2) / 2;
}

/** Descuenta un porcentaje de descuento comercial y redondea a S/ 0.50. */
export function priceWithMargin(cost: number, marginPct: number): number {
  return ceilToHalf(cost * (1 + marginPct / 100));
}

/** Margen real (%) que deja un precio respecto al costo. */
export function marginOf(price: number, cost: number): number | null {
  if (cost <= 0) return null;
  return round3(((price - cost) / cost) * 100);
}

/** Precios de productos activos de la misma categoría (excluyendo uno mismo). */
export function comparablePrices(
  products: Product[],
  categoryId: number | null | undefined,
  excludeProductId: number | null | undefined,
): PriceComparables | null {
  const prices = products
    .filter((product) => product.is_active !== false)
    .filter((product) => (categoryId == null ? true : product.category_id === categoryId))
    .filter((product) => (excludeProductId == null ? true : product.id !== excludeProductId))
    .map((product) => toNumber(product.base_price))
    .filter((price) => price > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) return null;

  const middle = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0 ? (prices[middle - 1] + prices[middle]) / 2 : prices[middle];

  return {
    count: prices.length,
    min: prices[0],
    max: prices[prices.length - 1],
    median: round3(median),
  };
}

/**
 * Estima el precio base de un producto a partir de su receta del tamaño más
 * pequeño y de los productos comparables de la misma categoría.
 */
export function suggestPrice({
  components,
  ingredients,
  optionGroups,
  sizes = [],
  products = [],
  categoryId = null,
  excludeProductId = null,
  marginPct = DEFAULT_MARGIN_PCT,
}: SuggestPriceInput): PriceSuggestion {
  // El precio base es el del tamaño más pequeño (personal).
  const baseSizeId = sizes.length > 0 ? sizes[0].id : null;
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

  const groupNameByOption = new Map<number, string>();
  for (const group of optionGroups) {
    for (const option of group.options) groupNameByOption.set(option.id, group.name);
  }

  const lines: PriceLine[] = [];
  const missing = new Set<string>();
  let alwaysTotal = 0;
  // Los insumos que dependen de una elección se promedian por grupo, porque en
  // cada venta el cliente escoge una sola alternativa (una fruta, una base…).
  const optionAccumulator = new Map<string, { sum: number; count: number }>();

  for (const component of components) {
    if (component.is_active === false) continue;
    const sizeId = component.size_option_id ?? null;
    if (sizeId !== baseSizeId) continue;

    const quantity = toNumber(component.quantity_per_unit);
    if (quantity <= 0) continue;

    const ingredient = ingredientById.get(component.ingredient_id);
    const rawCost = ingredient?.last_unit_cost;
    const unitCost =
      rawCost == null || rawCost === "" ? null : toNumber(rawCost);
    const subtotal = unitCost != null ? round3(quantity * unitCost) : 0;
    if (unitCost == null) {
      missing.add(ingredient?.name ?? `Insumo #${component.ingredient_id}`);
    }

    const source: PriceLine["source"] = component.option_id == null ? "siempre" : "opcion";
    const groupName =
      component.option_id != null
        ? groupNameByOption.get(component.option_id) ?? null
        : null;

    lines.push({
      ingredientId: component.ingredient_id,
      name: ingredient?.name ?? `Insumo #${component.ingredient_id}`,
      quantity: round3(quantity),
      unit: ingredient?.base_unit ?? "",
      unitCost,
      subtotal,
      source,
      groupName,
    });

    if (source === "siempre") {
      alwaysTotal += subtotal;
    } else {
      const key = groupName ?? `option:${component.option_id}`;
      const acc = optionAccumulator.get(key) ?? { sum: 0, count: 0 };
      acc.sum += subtotal;
      acc.count += 1;
      optionAccumulator.set(key, acc);
    }
  }

  let optionsTotal = 0;
  for (const acc of optionAccumulator.values()) {
    if (acc.count > 0) optionsTotal += acc.sum / acc.count;
  }

  const cost = round3(alwaysTotal + optionsTotal);
  const comparables = comparablePrices(products, categoryId, excludeProductId);

  // Si la receta ya tiene costos, se calcula costo + margen. Si no, se usa la
  // mediana de los productos parecidos como referencia para no dejar al usuario
  // sin ninguna pista.
  let basis: SuggestionBasis;
  let suggested: number;
  if (cost > 0) {
    basis = "receta";
    suggested = priceWithMargin(cost, marginPct);
  } else if (comparables) {
    basis = "comparables";
    suggested = roundToHalf(comparables.median);
  } else {
    basis = "none";
    suggested = 0;
  }

  return {
    cost,
    suggested,
    basis,
    marginPct,
    complete: lines.length > 0 && missing.size === 0 && cost > 0,
    missing: [...missing],
    lines,
    comparables,
  };
}
