import { describe, expect, it } from "vitest";
import {
  behaviorIncrements,
  convertToBaseUnit,
  formatStock,
  isCountUnit,
  sanitizeQuantityInput,
} from "../lib/stock";

describe("formatStock (sección 8)", () => {
  it("traduce mililitros a Litros con ml", () => {
    expect(formatStock(4250, "ml")).toBe("4 Litros con 250 ml");
    expect(formatStock(500, "ml")).toBe("500 ml");
  });

  it("traduce gramos a kg con g", () => {
    expect(formatStock(12500, "g")).toBe("12 kg con 500 g");
    expect(formatStock(3.2, "kg")).toBe("3 kg con 200 g");
    expect(formatStock(500, "g")).toBe("500 g");
  });

  it("muestra unidades contables en plural", () => {
    expect(formatStock(8, "unidad")).toBe("8 unidades");
    expect(formatStock(1, "unidad")).toBe("1 unidad");
  });
});

describe("convertToBaseUnit", () => {
  it("convierte etiquetas a la unidad base", () => {
    expect(convertToBaseUnit(200, "g", "kg")).toBeCloseTo(0.2, 6);
    expect(convertToBaseUnit(1, "kg", "g")).toBe(1000);
    expect(convertToBaseUnit(100, "ml", "ml")).toBe(100);
    expect(convertToBaseUnit(1, "L", "ml")).toBe(1000);
    expect(convertToBaseUnit(5, "u", "unidad")).toBe(5);
  });
});

describe("behaviorIncrements (sección 6)", () => {
  it("usa los botones del comportamiento líquidos (ml)", () => {
    const buttons = behaviorIncrements("liquidos", "ml", undefined);
    expect(buttons.map((b) => b.label)).toEqual(["+ 10 ml", "+ 50 ml", "+ 100 ml", "+ 250 ml"]);
    expect(buttons[2].amountInBase).toBe(100);
  });

  it("usa los botones de frutas y verduras y convierte a kg", () => {
    const buttons = behaviorIncrements("frutas_verduras", "kg", undefined);
    expect(buttons.map((b) => b.label)).toEqual(["+ 10 g", "+ 50 g", "+ 200 g", "+ 1 kg"]);
    expect(buttons[3].amountInBase).toBe(1);
    expect(buttons[2].amountInBase).toBeCloseTo(0.2, 6);
  });

  it("prefiere los incrementos que envía el backend", () => {
    const buttons = behaviorIncrements("unidades", "unidad", [
      { label: "+ 2 u", unit: "u", amount: "2" },
    ]);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].amountInBase).toBe(2);
  });
});

describe("validación de entradas (sección 5)", () => {
  it("detecta unidades contables", () => {
    expect(isCountUnit("unidad")).toBe(true);
    expect(isCountUnit("kg")).toBe(false);
  });

  it("bloquea decimales en insumos contables y acepta coma decimal", () => {
    expect(sanitizeQuantityInput("2.5", true)).toBe("25");
    expect(sanitizeQuantityInput("1,500", false)).toBe("1.500");
  });
});
