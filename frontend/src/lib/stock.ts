/**
 * Traducción visual de stock (sección 8) y utilidades de unidades.
 *
 * El backend guarda el stock siempre en la unidad mínima (ml, g, u) o en la
 * unidad base del insumo. Estas funciones lo convierten a lenguaje cotidiano
 * para que la dueña entienda "Quedan 4 Litros con 250 ml" sin leer 4250.
 */

export type BehavioralType = "liquidos" | "solidos" | "unidades" | "frutas_verduras";

export function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Redondea a 3 decimales evitando colas de coma flotante. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Convierte un texto de entrada a número, aceptando coma como decimal. */
export function parseDecimalInput(value: string): number {
  return toNumber(value.replace(",", "."));
}

/** Para insumos contables solo se aceptan dígitos enteros (sección 5.B). */
export function sanitizeQuantityInput(value: string, integerOnly: boolean): string {
  if (integerOnly) return value.replace(/[^\d]/g, "");
  // Convierte la primera coma en punto y descarta caracteres no numéricos.
  return value
    .replace(",", ".")
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1");
}

export function isCountUnit(unit: string | null | undefined): boolean {
  const value = (unit ?? "").toLowerCase();
  return ["unidad", "unidades", "u", "docena", "docenas"].includes(value);
}

/** Convierte una cantidad expresada en `fromUnit` a la unidad base del insumo. */
export function convertToBaseUnit(amount: number, fromUnit: string, baseUnit: string): number {
  const from = (fromUnit ?? "").toLowerCase();
  const base = (baseUnit ?? "").toLowerCase();
  // Masa
  if (from === "g" && base === "kg") return amount / 1000;
  if ((from === "kg" || from === "kilogramo" || from === "kilogramos") && base === "g") {
    return amount * 1000;
  }
  // Volumen
  if (from === "ml" && (base === "l" || base === "litro" || base === "litros")) {
    return amount / 1000;
  }
  if ((from === "l" || from === "litro" || from === "litros") && base === "ml") {
    return amount * 1000;
  }
  // Unidades contables
  if (isCountUnit(from) && isCountUnit(base)) return amount;
  return amount;
}

/** Formatea una cantidad en la unidad base para mostrarla en tablas. */
export function formatBaseQuantity(quantity: number, unit: string): string {
  return `${round3(quantity).toLocaleString("es-PE", { maximumFractionDigits: 3 })} ${unit}`;
}

/**
 * Frase amigable para el stock (sección 8).
 *
 * · 4250 ml   -> "4 Litros con 250 ml"
 * · 12500 g   -> "12 kg con 500 g"
 * · 8 unidad  -> "8 unidades"
 */
export function formatStock(quantity: number, unit: string): string {
  const u = (unit ?? "").toLowerCase();
  const value = round3(quantity);

  if (u === "unidad" || u === "unidades" || u === "u") {
    const whole = Math.round(value);
    return `${whole.toLocaleString("es-PE")} ${whole === 1 ? "unidad" : "unidades"}`;
  }

  if (u === "ml" || u === "l" || u === "litro" || u === "litros") {
    const ml = u === "ml" ? value : value * 1000;
    const litres = Math.floor(ml / 1000);
    const rest = Math.round(ml - litres * 1000);
    if (litres <= 0) return `${Math.round(ml)} ml`;
    if (rest === 0) return `${litres} ${litres === 1 ? "Litro" : "Litros"}`;
    return `${litres} ${litres === 1 ? "Litro" : "Litros"} con ${rest} ml`;
  }

  if (u === "g" || u === "kg" || u === "kilogramo" || u === "kilogramos") {
    // Se normaliza a gramos y de ahí a kilos + resto.
    const grams = u === "g" ? value : value * 1000;
    const kilos = Math.floor(grams / 1000);
    const rest = Math.round(grams - kilos * 1000);
    if (kilos <= 0) return `${Math.round(grams)} g`;
    if (rest === 0) return `${kilos} kg`;
    return `${kilos} kg con ${rest} g`;
  }

  return `${value.toLocaleString("es-PE")} ${unit}`;
}

/** Ej.: "🥛 Leche Entera: Quedan 4 Litros con 250 ml". */
export function formatStockView(
  name: string,
  quantity: number,
  unit: string,
  icon?: string,
): string {
  const prefix = icon ? `${icon} ` : "";
  return `${prefix}${name}: Quedan ${formatStock(quantity, unit)}`;
}

/** Botones de incremento táctil de un insumo (sección 6). */
export interface IncrementButton {
  label: string;
  /** Cantidad ya convertida a la unidad base del insumo. */
  amountInBase: number;
  unit: string;
}

const FALLBACK_INCREMENTS: Record<BehavioralType, string[][]> = {
  liquidos: [
    ["10", "ml"],
    ["50", "ml"],
    ["100", "ml"],
    ["250", "ml"],
  ],
  solidos: [
    ["5", "g"],
    ["25", "g"],
    ["100", "g"],
    ["500", "g"],
  ],
  unidades: [
    ["1", "u"],
    ["5", "u"],
    ["10", "u"],
  ],
  frutas_verduras: [
    ["10", "g"],
    ["50", "g"],
    ["200", "g"],
    ["1", "kg"],
  ],
};

/** Deduce el comportamiento a partir de la unidad cuando el backend no lo envía. */
export function deriveBehaviorFromUnit(baseUnit: string | null | undefined): BehavioralType {
  const unit = (baseUnit ?? "").toLowerCase();
  if (["ml", "l", "litro", "litros"].includes(unit)) return "liquidos";
  if (["g", "kg", "kilogramo", "kilogramos"].includes(unit)) return "solidos";
  return "unidades";
}

export function behaviorIncrements(
  behavioralType: BehavioralType | null | undefined,
  baseUnit: string,
  raw: { label: string; unit: string; amount: string }[] | undefined,
): IncrementButton[] {
  const behavior = behavioralType ?? deriveBehaviorFromUnit(baseUnit);
  const source =
    raw && raw.length > 0
      ? raw.map((i) => [i.amount, i.unit] as [string, string])
      : FALLBACK_INCREMENTS[behavior] ?? FALLBACK_INCREMENTS.unidades;
  return source.map(([amount, unit]) => ({
    label: `+ ${amount} ${unit}`,
    amountInBase: convertToBaseUnit(toNumber(amount), unit, baseUnit),
    unit,
  }));
}
