import { describe, expect, it } from "vitest";
import { formatDate, formatTime } from "../lib/dates";

describe("formatDate", () => {
  it("usa el formato dd/mm/yyyy (sección 3.3)", () => {
    expect(formatDate("2026-10-04T12:30:00-05:00")).toBe("04/10/2026");
    expect(formatDate("2026-01-15")).toBe("15/01/2026");
  });

  it("devuelve — para valores vacíos", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("formatTime", () => {
  it("formatea la hora en formato local", () => {
    const result = formatTime("2026-10-04T10:41:00-05:00");
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});
