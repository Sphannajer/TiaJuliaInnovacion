import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductRecipeEditor } from "../features/products/ProductRecipeEditor";
import type { Ingredient, Option, OptionGroup, RecipeComponent } from "../types";

const SIZES: Option[] = [
  { id: 1, group_id: 1, name: "personal", extra_cost: "0.00", linked_ingredient_id: null, is_active: true },
  { id: 2, group_id: 1, name: "pareja", extra_cost: "1.00", linked_ingredient_id: null, is_active: true },
  { id: 3, group_id: 1, name: "familiar", extra_cost: "2.00", linked_ingredient_id: null, is_active: true },
];

const INGREDIENTS: Ingredient[] = [
  {
    id: 1,
    name: "fresa",
    category: "fruta",
    base_unit: "kg",
    unit_name: "fresa",
    unit_weight: "0.015",
    current_stock: "5",
    min_stock_alert: "1",
    updated_at: null,
    state: "BIEN",
  },
  {
    id: 2,
    name: "agua",
    category: "abarrote",
    base_unit: "ml",
    unit_name: "vaso",
    unit_weight: "50",
    current_stock: "5000",
    min_stock_alert: "1",
    updated_at: null,
    state: "BIEN",
  },
];

const OPTION_GROUPS: OptionGroup[] = [
  {
    id: 2,
    name: "fruta",
    options: [
      { id: 10, group_id: 2, name: "fresa", extra_cost: "0.50", linked_ingredient_id: 1, is_active: true },
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

function Harness() {
  const [components, setComponents] = useState<RecipeComponent[]>([]);
  return (
    <>
      <ProductRecipeEditor
        sizeOptions={SIZES}
        optionGroups={OPTION_GROUPS}
        ingredients={INGREDIENTS}
        components={components}
        onChange={setComponents}
      />
      <pre data-testid="state">{JSON.stringify(components)}</pre>
    </>
  );
}

function readState(): RecipeComponent[] {
  return JSON.parse(screen.getByTestId("state").textContent ?? "[]");
}

describe("ProductRecipeEditor", () => {
  it("muestra un cuadro por opción y cuenta unidades naturales (3 vasos = 150 ml)", () => {
    render(<Harness />);

    // Pestañas de tamaño como botones (no listas desplegables).
    expect(screen.getByRole("tab", { name: "personal" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "pareja" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "familiar" })).toBeInTheDocument();

    // El insumo base tiene 1 vaso = 50 ml.
    expect(screen.getAllByText(/1 vaso = 50 ml/).length).toBeGreaterThan(0);

    // Presiona 3 veces agua -> 150 ml para el tamaño activo (personal = id 1).
    const addWater = screen.getByRole("button", { name: /agregar una vaso de agua/i });
    fireEvent.click(addWater);
    fireEvent.click(addWater);
    fireEvent.click(addWater);

    const saved = readState();
    expect(saved).toHaveLength(1);
    expect(saved[0].ingredient_id).toBe(2);
    expect(saved[0].option_id).toBe(20);
    expect(saved[0].size_option_id).toBe(1);
    expect(parseFloat(saved[0].quantity_per_unit)).toBeCloseTo(150, 3);
    // La unidad se muestra en el resumen.
    expect(screen.getAllByText(/150 ml/).length).toBeGreaterThan(0);
  });

  it("suma con los botones de incremento del comportamiento (100 ml + 50 ml)", () => {
    render(<Harness />);

    // El agua (ml) muestra los botones del comportamiento líquidos.
    fireEvent.click(screen.getByRole("button", { name: /agregar 100 ml a agua/i }));
    fireEvent.click(screen.getByRole("button", { name: /agregar 50 ml a agua/i }));

    const saved = readState();
    expect(saved).toHaveLength(1);
    expect(parseFloat(saved[0].quantity_per_unit)).toBeCloseTo(150, 3);

    // El botón Limpiar regresa la cantidad a cero.
    fireEvent.click(screen.getByRole("button", { name: /limpiar cantidad de agua/i }));
    expect(readState()).toHaveLength(0);
  });

  it("guarda la cantidad por separado para cada tamaño y permite copiarla", () => {
    render(<Harness />);

    // Personal: 2 fresas.
    const addStrawberry = screen.getByRole("button", { name: /agregar una fresa de fresa/i });
    fireEvent.click(addStrawberry);
    fireEvent.click(addStrawberry);
    expect(parseFloat(readState()[0].quantity_per_unit)).toBeCloseTo(0.03, 3);

    // Cambia a familiar y copia las cantidades de personal.
    fireEvent.click(screen.getByRole("tab", { name: "familiar" }));
    fireEvent.change(screen.getByLabelText(/copiar cantidades/i), { target: { value: "1" } });

    const saved = readState();
    const familiarRow = saved.find((c) => c.size_option_id === 3);
    expect(familiarRow).toBeDefined();
    expect(familiarRow?.option_id).toBe(10);
    expect(parseFloat(familiarRow?.quantity_per_unit ?? "0")).toBeCloseTo(0.03, 3);
    // La fila de personal no se pierde.
    expect(saved.some((c) => c.size_option_id === 1)).toBe(true);
  });
});
