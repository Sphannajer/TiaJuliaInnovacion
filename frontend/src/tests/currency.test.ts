import { describe, expect, it } from "vitest";
import { formatMoney } from "../lib/currency";

describe("formatMoney", () => {
  it("formatea montos enteros con separador de miles", () => {
    expect(formatMoney(1250)).toBe("S/ 1,250.00");
  });

  it("formatea montos decimales", () => {
    expect(formatMoney(18.5)).toBe("S/ 18.50");
    expect(formatMoney(12.5)).toBe("S/ 12.50");
  });

  it("maneja cero y strings", () => {
    expect(formatMoney(0)).toBe("S/ 0.00");
    expect(formatMoney("37")).toBe("S/ 37.00");
  });

  it("maneja valores inválidos", () => {
    expect(formatMoney("abc")).toBe("S/ 0.00");
  });
});
