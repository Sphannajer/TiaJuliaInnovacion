import { Apple, Beef, Boxes, Croissant, CupSoda, Milk, Package, Wheat, type LucideIcon } from "lucide-react";

/**
 * Catálogo de categorías de insumo mostradas como cuadros seleccionables
 * (sección 17.3). Cada categoría propone una unidad base por defecto:
 * una fruta se compra por kg, un lácteo por ml, un pan por unidad, etc.
 */
export interface IngredientCategoryTile {
  value: string;
  label: string;
  defaultUnit: string;
  hint: string;
  icon: LucideIcon;
}

export const INGREDIENT_CATEGORIES: IngredientCategoryTile[] = [
  { value: "Fruta/Verdura", label: "Fruta / Verdura", defaultUnit: "kg", hint: "Mango, papaya, fresa…", icon: Apple },
  { value: "Lácteo", label: "Lácteos", defaultUnit: "ml", hint: "Leche, queso, yogurt", icon: Milk },
  { value: "Abarrote", label: "Abarrotes", defaultUnit: "kg", hint: "Harina, azúcar, arroz", icon: Package },
  { value: "Carne", label: "Carnes", defaultUnit: "kg", hint: "Pollo, chorizo, res", icon: Beef },
  { value: "Panadería", label: "Panadería", defaultUnit: "unidad", hint: "Pan, bizcochos", icon: Croissant },
  { value: "Bebida", label: "Bebidas", defaultUnit: "ml", hint: "Agua, gaseosas, jugos", icon: CupSoda },
  { value: "Insumo seco", label: "Insumos secos", defaultUnit: "g", hint: "Gelatina, café, esencias", icon: Wheat },
  { value: "Otro", label: "Otro", defaultUnit: "unidad", hint: "Lo que no encaje arriba", icon: Boxes },
];

/** Unidades base disponibles para un insumo (unidad de compra y uso). */
export const INGREDIENT_UNITS: { value: string; label: string }[] = [
  { value: "kg", label: "Kilogramos (kg)" },
  { value: "g", label: "Gramos (g)" },
  { value: "L", label: "Litros (L)" },
  { value: "ml", label: "Mililitros (ml)" },
  { value: "unidad", label: "Unidad" },
  { value: "docena", label: "Docena" },
];

/** Devuelve la categoría conocida por su nombre (o undefined). */
export function findCategory(value: string): IngredientCategoryTile | undefined {
  return INGREDIENT_CATEGORIES.find((c) => c.value === value);
}
