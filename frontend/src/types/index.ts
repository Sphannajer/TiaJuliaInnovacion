// Tipos del dominio Tía Julia — espejo de los contratos del backend

export interface User {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Category {
  id: number;
  name: string;
  allows_multiple_ingredients: boolean;
}

export interface Option {
  id: number;
  group_id: number | null;
  name: string;
  extra_cost: string;
  linked_ingredient_id: number | null;
  is_active: boolean;
}

export interface OptionGroup {
  id: number;
  name: string;
  options: Option[];
}

export interface RecipeComponent {
  id?: number | null;
  product_id?: number | null;
  ingredient_id: number;
  /** Opción que dispara el consumo (fruta, base, tipo…). null = siempre. */
  option_id: number | null;
  /** Tamaño al que aplica la fila (personal/pareja/familiar). null = todos. */
  size_option_id?: number | null;
  quantity_per_unit: string;
  size_multiplier: Record<string, number> | null;
  is_active?: boolean;
  ingredient_name?: string | null;
  ingredient_unit?: string | null;
  option_name?: string | null;
}

export interface Product {
  id: number;
  category_id: number | null;
  name: string;
  base_price: string;
  is_active: boolean;
  category_name: string | null;
  option_group_ids: number[];
  has_options: boolean;
  has_recipe: boolean;
  recipe_components: RecipeComponent[];
}

export interface OrderDetail {
  id: number;
  product_id: number | null;
  product_name: string | null;
  quantity: number;
  unit_price: string;
  subtotal: string;
  assembly_config: AssemblyConfig | null;
  config_label: string;
  notes: string | null;
}

export interface AssemblyConfig {
  groups: Record<
    string,
    {
      mode: "single" | "multiple";
      options: { id: number; name: string; extra_cost: number }[];
    }
  >;
}

export interface Order {
  id: number;
  user_id: number | null;
  user_name: string | null;
  order_type: "mesa" | "delivery" | "mostrador";
  status: "en_preparacion" | "pagado" | "cancelado";
  customer_name: string | null;
  table_number: string | null;
  total_amount: string;
  payment_method_id: number | null;
  payment_method_name: string | null;
  sync_status: string;
  created_at: string | null;
  updated_at: string | null;
  details: OrderDetail[];
}

export interface InventoryAlertPayload {
  ingredient_id: number;
  ingredient_name: string;
  requested: number;
  available: number;
}

export interface OrderResponse {
  order: Order;
  inventory_alerts: InventoryAlertPayload[];
  idempotent_replay?: boolean;
}

export type BehavioralType = "liquidos" | "solidos" | "unidades" | "frutas_verduras";

export interface IngredientIncrement {
  label: string;
  unit: string;
  amount: string;
}

export interface Ingredient {
  id: number;
  name: string;
  category: string;
  base_unit: string;
  /** Empaque con el que se compra ("Caja/Litro", "Saco 5kg"). */
  purchase_unit?: string | null;
  /** Unidad mínima de consumo (ml, g, unidad). */
  consumption_unit?: string | null;
  /** Cuántas unidades de consumo rinde una compra. */
  conversion_factor?: string | null;
  /** Comportamiento que define los botones táctiles. */
  behavioral_type?: BehavioralType | null;
  /** Botones de incremento rápido definidos por el backend. */
  increments?: IngredientIncrement[];
  /** Unidad natural contable: "fresa", "vaso", "cucharada"… */
  unit_name: string | null;
  /** Cuánto de la unidad base hay en una unidad natural (0.015 kg por fresa). */
  unit_weight: string | null;
  current_stock: string;
  min_stock_alert: string;
  /** Último costo unitario de compra (S/ por unidad consumo); base del precio sugerido. */
  last_unit_cost?: string | null;
  updated_at: string | null;
  state: "BIEN" | "BAJO" | "CRITICO";
}

export interface Movement {
  id: number;
  ingredient_id: number | null;
  ingredient_name: string | null;
  movement_type: "entrada" | "salida" | "ajuste";
  quantity: string;
  total_cost: string | null;
  unit_cost: string | null;
  reference_id: number | null;
  notes: string | null;
  created_at: string | null;
}

export interface DashboardSummary {
  period: string;
  sales_total: number;
  orders_paid: number;
  average_ticket: number;
  payments: { cash: number; yape: number };
}

export interface SalesSeriesPoint {
  date: string;
  label: string;
  total: number;
  orders: number;
  cash: number;
  yape: number;
}

export interface TopProduct {
  product_id: number;
  product_name: string;
  quantity: number;
  revenue: number;
}

export interface DashboardAlert {
  id: string;
  type: string;
  icon: string;
  message: string;
  action: string | null;
  link: string | null;
}

export interface StockAttentionItem {
  ingredient_id: number;
  name: string;
  base_unit: string;
  current_stock: number;
  min_stock_alert: number;
  state: string;
}

export interface Recommendation {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  base_unit?: string;
  recommended_quantity: number;
  reason: string;
  status: string;
}

export interface DashboardOverview {
  summary: DashboardSummary;
  stock_attention: StockAttentionItem[];
  recommendation_preview: Recommendation[] | null;
  recommendation_status: string;
  alerts: DashboardAlert[];
}

export interface Forecast {
  id: number;
  forecast_date: string;
  product_id: number;
  product_name: string;
  predicted_quantity: number;
  confidence_score: number;
  model_version: string;
}

export interface Anomaly {
  id: number;
  detected_date: string;
  anomaly_type: string;
  description: string;
  expected_value: number;
  actual_value: number;
  is_reviewed: boolean;
}

export interface ReportSummary {
  from_date: string;
  to_date: string;
  sales_total: number;
  orders_paid: number;
  average_ticket: number;
  best_day: string | null;
  payments: { cash: number; yape: number };
  series: { date: string; total: number; orders: number }[];
}

export interface ReportPayments {
  cash: number;
  yape: number;
  cash_pct: number;
  yape_pct: number;
}

export interface ReportProducts {
  top: TopProduct[];
  slow: TopProduct[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
