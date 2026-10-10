// Esquemas Zod para validación de formularios (sección 3.1)

import { z } from "zod";

export const orderInfoSchema = z
  .object({
    order_type: z.enum(["mesa", "delivery", "mostrador"]),
    table_number: z.string().max(10).nullable().optional(),
    customer_name: z.string().max(100).nullable().optional(),
  })
  .refine(
    (data) => data.order_type !== "mesa" || (data.table_number ?? "").trim().length > 0,
    { message: "Escribe el número o nombre de la mesa.", path: ["table_number"] },
  );

export const productFormSchema = z.object({
  name: z.string().min(1, "Escribe el nombre del producto.").max(150),
  category_id: z.coerce.number().int().positive("Elige una categoría."),
  base_price: z.coerce.number().min(0, "El precio no puede ser negativo."),
  is_active: z.boolean(),
  option_group_ids: z.array(z.number()).optional(),
});

export const stockEntrySchema = z.object({
  ingredient_id: z.coerce.number().int().positive("Elige un insumo."),
  quantity: z.coerce.number().positive("Escribe una cantidad mayor a cero."),
  total_cost: z.coerce.number().min(0).optional(),
});

export const stockAdjustmentSchema = z.object({
  new_stock: z.coerce.number().min(0, "El stock no puede ser negativo."),
  reason: z.string().max(255).optional(),
});

export type OrderInfoValues = z.infer<typeof orderInfoSchema>;
export type ProductFormValues = z.infer<typeof productFormSchema>;
export type StockEntryValues = z.infer<typeof stockEntrySchema>;
export type StockAdjustmentValues = z.infer<typeof stockAdjustmentSchema>;
