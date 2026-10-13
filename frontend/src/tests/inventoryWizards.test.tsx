import { describe, expect, it, vi, type Mock } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  StockEntryModal,
  StockAdjustModal,
} from "../features/inventory/StockModals";
import { api } from "../lib/api";
import type { Ingredient } from "../types";

vi.mock("../lib/api", () => ({ api: { post: vi.fn(), put: vi.fn() } }));

const flour: Ingredient = {
  id: 4,
  name: "harina",
  category: "Abarrote",
  base_unit: "kg",
  purchase_unit: "Saco 5 kg",
  consumption_unit: "g",
  conversion_factor: "5000",
  behavioral_type: "solidos",
  unit_name: null,
  unit_weight: null,
  current_stock: "2",
  min_stock_alert: "5",
  updated_at: null,
  state: "BAJO",
};

describe("wizards de inventario", () => {
  it("convierte presentaciones a base_unit antes de registrar una entrada", async () => {
    (api.post as Mock).mockResolvedValue({ id: 4 });
    render(
      <StockEntryModal
        ingredients={[flour]}
        initial={flour}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    fireEvent.change(screen.getByLabelText(/por presentación/i), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    fireEvent.click(screen.getByRole("button", { name: /registrar entrada/i }));
    expect(api.post).toHaveBeenCalledWith(
      "/inventory/entries",
      expect.objectContaining({ ingredient_id: 4, quantity: 10 }),
    );
  });

  it("crea un insumo con metadatos de compra, consumo y comportamiento", async () => {
    vi.clearAllMocks();
    (api.post as Mock)
      .mockResolvedValueOnce({ id: 9 })
      .mockResolvedValueOnce({});
    render(
      <StockEntryModal
        ingredients={[]}
        initial={null}
        startInNewMode
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "papaya" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /fruta \/ verdura/i }));
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    fireEvent.change(screen.getByLabelText("Presentación habitual"), {
      target: { value: "1 kg" },
    });
    fireEvent.change(screen.getByLabelText(/contenido de la presentación/i), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    fireEvent.change(screen.getByLabelText(/cantidad exacta/i), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear insumo/i }));
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/ingredients",
      expect.objectContaining({
        purchase_unit: "1 kg",
        consumption_unit: "g",
        conversion_factor: 1000,
        behavioral_type: "frutas_verduras",
      }),
    );
  });

  it("mantiene el endpoint de ajustes y muestra la diferencia", async () => {
    (api.post as Mock).mockResolvedValue({});
    render(
      <StockAdjustModal
        ingredient={flour}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/nuevo stock/i), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: /revisar ajuste/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Aumentará: 2 kg");
    fireEvent.click(screen.getByRole("button", { name: /guardar ajuste/i }));
    expect(api.post).toHaveBeenCalledWith(
      "/inventory/adjustments",
      expect.objectContaining({ ingredient_id: 4, new_stock: 4 }),
    );
  });
});
