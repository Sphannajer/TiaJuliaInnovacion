import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, FileDown, Smartphone } from "lucide-react";
import { api, downloadReportPdf, ApiError } from "../../lib/api";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Modal } from "../../components/ui/Modal";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingMessage } from "../../components/feedback/LoadingMessage";
import { SalesBarChart } from "../../components/charts/SalesBarChart";
import { HorizontalRanking } from "../../components/charts/HorizontalRanking";
import { formatMoney } from "../../lib/currency";
import { formatDate } from "../../lib/dates";
import type { Anomaly, Forecast, ReportPayments, ReportProducts, ReportSummary, SalesSeriesPoint } from "../../types";

type Period = "today" | "week" | "month" | "custom";
type SubTab = "resumen" | "ventas" | "pagos" | "productos" | "stock" | "predicciones";

const SECTION_LABELS: Record<string, string> = {
  summary: "Resumen de ventas",
  payments: "Yape vs Efectivo",
  products: "Productos más vendidos",
  inventory: "Stock bajo",
  forecasts: "Predicciones",
  anomalies: "Anomalías",
};

/** Pantalla 5 — Reportes (sección 19). */
export function ReportsPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [from, setFrom] = useState(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [applied, setApplied] = useState<{ from: string; to: string }>({
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });
  const [tab, setTab] = useState<SubTab>("resumen");
  const [pdfOpen, setPdfOpen] = useState(false);

  const range = period === "custom" ? applied : periodRange(period);

  return (
    <div>
      <div className="flex-wrap-gap">
        <h1>Reportes</h1>
        <button className="btn btn-primary btn-large" onClick={() => setPdfOpen(true)}>
          <FileDown size={22} aria-hidden /> Exportar PDF
        </button>
      </div>

      <div className="card mt-4 period-row">
        <div>
          <p className="kpi-label">Periodo</p>
          <SegmentedControl
            ariaLabel="Periodo del reporte"
            options={[
              { value: "today", label: "Hoy" },
              { value: "week", label: "Esta semana" },
              { value: "month", label: "Este mes" },
              { value: "custom", label: "Personalizado" },
            ]}
            value={period}
            onChange={(value) => setPeriod(value as Period)}
          />
        </div>
        {period === "custom" && (
          <div className="period-row">
            <div className="field field--compact">
              <label htmlFor="from-date">Desde</label>
              <input id="from-date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field field--compact">
              <label htmlFor="to-date">Hasta</label>
              <input id="to-date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <button className="btn btn-secondary" onClick={() => setApplied({ from, to })}>
              Aplicar
            </button>
          </div>
        )}
      </div>

      <div className="report-tabs mt-4" role="tablist">
        {([
          ["resumen", "Resumen"],
          ["ventas", "Ventas"],
          ["pagos", "Pagos"],
          ["productos", "Productos"],
          ["stock", "Stock y compras"],
          ["predicciones", "Predicciones"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="report-tab"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "resumen" && <SummaryTab from={range.from} to={range.to} />}
        {tab === "ventas" && <SalesTab from={range.from} to={range.to} />}
        {tab === "pagos" && <PaymentsTab from={range.from} to={range.to} />}
        {tab === "productos" && <ProductsTab from={range.from} to={range.to} />}
        {tab === "stock" && <StockTab from={range.from} to={range.to} />}
        {tab === "predicciones" && <ForecastsTab />}
      </div>

      {pdfOpen && <PdfExportModal from={range.from} to={range.to} onClose={() => setPdfOpen(false)} />}
    </div>
  );
}

function periodRange(period: Period): { from: string; to: string } {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  if (period === "today") return { from: iso, to: iso };
  if (period === "week") return { from: new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10), to: iso };
  return { from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), to: iso };
}

/* ===================== Resumen ===================== */

function SummaryTab({ from, to }: { from: string; to: string }) {
  const summary = useQuery({
    queryKey: ["reports", "summary", from, to],
    queryFn: () => api.get<ReportSummary>(`/reports/summary?from=${from}&to=${to}`),
  });

  if (summary.isLoading) return <LoadingMessage message="Cargando reporte…" />;
  if (summary.isError)
    return <EmptyState title="No pudimos cargar el reporte." actionLabel="Intentar nuevamente" onAction={() => void summary.refetch()} />;

  const data = summary.data!;
  const chartData: SalesSeriesPoint[] = data.series.map((row) => ({
    date: row.date,
    label: formatDate(row.date),
    total: row.total,
    orders: row.orders,
    cash: 0,
    yape: 0,
  }));

  return (
    <div className="stack">
      {/* KPIs grandes (19.3) */}
      <div className="dashboard-grid">
        <div className="card">
          <p className="kpi-label">Ventas totales</p>
          <p className="kpi-value">{formatMoney(data.sales_total)}</p>
        </div>
        <div className="card">
          <p className="kpi-label">Órdenes pagadas</p>
          <p className="kpi-value">{data.orders_paid.toLocaleString("es-PE")}</p>
        </div>
        <div className="card">
          <p className="kpi-label">Ticket promedio</p>
          <p className="kpi-value">{formatMoney(data.average_ticket)}</p>
        </div>
      </div>

      <p className="text-secondary mt-4">
        Día más fuerte: <strong>{data.best_day ?? "—"}</strong>
      </p>

      {/* Gráfico de ventas por día (19.3) */}
      <div className="card mt-4">
        <h3>Ventas por día</h3>
        <SalesBarChart data={chartData} />
        <table className="table mt-4">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Ventas</th>
              <th>Órdenes</th>
            </tr>
          </thead>
          <tbody>
            {data.series.map((row) => (
              <tr key={row.date}>
                <td>{formatDate(row.date)}</td>
                <td>{formatMoney(row.total)}</td>
                <td>{row.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Yape vs Efectivo (19.3) */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
        <div className="payment-box payment-box--cash">
          <span className="payment-box__label">
            <span className="payment-box__icon payment-box__icon--cash" aria-hidden>
              <Banknote size={20} />
            </span>
            Efectivo
          </span>
          <span className="payment-box__value">{formatMoney(data.payments.cash)}</span>
        </div>
        <div className="payment-box payment-box--yape">
          <span className="payment-box__label">
            <span className="payment-box__icon payment-box__icon--yape" aria-hidden>
              <Smartphone size={20} />
            </span>
            Yape
          </span>
          <span className="payment-box__value">{formatMoney(data.payments.yape)}</span>
        </div>
      </div>
    </div>
  );
}

/* ===================== Ventas ===================== */function SalesTab({ from, to }: { from: string; to: string }) {
  const sales = useQuery({
    queryKey: ["reports", "sales", from, to],
    queryFn: () =>
      api.get<{ series: { date: string; total: number; orders: number }[]; by_order_type: { order_type: string; orders: number; total: number }[] } >(
        `/reports/sales?from=${from}&to=${to}`,
      ),
  });

  if (sales.isLoading) return <LoadingMessage message="Cargando ventas…" />;
  const data = sales.data;
  const typeLabels: Record<string, string> = { mesa: "Mesa", delivery: "Delivery", mostrador: "Llevar" };
  const chartData: SalesSeriesPoint[] = (data?.series ?? []).map((row) => ({
    date: row.date,
    label: formatDate(row.date),
    total: row.total,
    orders: row.orders,
    cash: 0,
    yape: 0,
  }));

  return (
    <div className="stack">
      {/* Gráfico de barras por día (19.4) */}
      <div className="card">
        <h3>Ventas por día</h3>
        <SalesBarChart data={chartData} />
        <table className="table mt-4">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Ventas</th>
              <th>Órdenes</th>
            </tr>
          </thead>
          <tbody>
            {(data?.series ?? []).map((row) => (
              <tr key={row.date}>
                <td>{formatDate(row.date)}</td>
                <td>{formatMoney(row.total)}</td>
                <td>{row.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card mt-4">
        <h3>Por tipo de orden</h3>
        <table className="table mt-4">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Órdenes</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(data?.by_order_type ?? []).map((row) => (
              <tr key={row.order_type}>
                <td>{typeLabels[row.order_type] ?? row.order_type}</td>
                <td>{row.orders}</td>
                <td>{formatMoney(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===================== Pagos ===================== */

function PaymentsTab({ from, to }: { from: string; to: string }) {
  const payments = useQuery({
    queryKey: ["reports", "payments", from, to],
    queryFn: () => api.get<ReportPayments>(`/reports/payments?from=${from}&to=${to}`),
  });

  if (payments.isLoading) return <LoadingMessage message="Cargando pagos…" />;
  const data = payments.data!;

  return (
    <div className="dashboard-grid">
      <div className="payment-box payment-box--cash flex-col items-start gap-1 py-4">
        <span className="payment-box__label">
          <span className="payment-box__icon payment-box__icon--cash" aria-hidden>
            <Banknote size={20} />
          </span>
          Efectivo
        </span>
        <p className="kpi-value">{formatMoney(data.cash)}</p>
        <p className="text-important">{data.cash_pct}% del total</p>
      </div>
      <div className="payment-box payment-box--yape flex-col items-start gap-1 py-4">
        <span className="payment-box__label">
          <span className="payment-box__icon payment-box__icon--yape" aria-hidden>
            <Smartphone size={20} />
          </span>
          Yape
        </span>
        <p className="kpi-value">{formatMoney(data.yape)}</p>
        <p className="text-important">{data.yape_pct}% del total</p>
      </div>
    </div>
  );
}

/* ===================== Productos ===================== */

function ProductsTab({ from, to }: { from: string; to: string }) {
  const products = useQuery({
    queryKey: ["reports", "products", from, to],
    queryFn: () => api.get<ReportProducts>(`/reports/products?from=${from}&to=${to}`),
  });

  if (products.isLoading) return <LoadingMessage message="Cargando productos…" />;
  const data = products.data!;

  return (
    <div className="stack">
      {/* Más vendidos: gráfico horizontal (10.3, 19.6) */}
      <div className="card">
        <h3>Más vendidos</h3>
        {data.top.length > 0 ? (
          <HorizontalRanking items={data.top} ariaLabel="Productos más vendidos" />
        ) : (
          <p className="text-secondary mt-2">No hay ventas en este periodo.</p>
        )}
        <table className="table mt-4">
          <thead>
            <tr>
              <th>#</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Importe</th>
            </tr>
          </thead>
          <tbody>
            {data.top.map((item, index) => (
              <tr key={item.product_id}>
                <td>{index + 1}</td>
                <td className="td-bold">{item.product_name}</td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Menor movimiento: tabla simple (19.6) */}
      <div className="card mt-4">
        <h3>Menor movimiento</h3>
        {data.slow.length === 0 ? (
          <p className="text-secondary mt-2">No hay datos de productos con poca rotación.</p>
        ) : (
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {data.slow.map((item) => (
                <tr key={item.product_id}>
                  <td className="td-bold">{item.product_name}</td>
                  <td>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ===================== Stock y compras ===================== */

function StockTab({ from, to }: { from: string; to: string }) {
  const inventory = useQuery({
    queryKey: ["reports", "inventory", from, to],
    queryFn: () =>
      api.get<{
        low_stock: { ingredient_id: number; name: string; current_stock: number; min_stock_alert: number }[];
        purchases: {
          id: number;
          ingredient_name: string;
          quantity: number;
          unit: string;
          total_cost: number | null;
          unit_cost: number | null;
          created_at: string;
        }[];
        recommendations: { pendiente: number; realizada: number };
      }>(`/reports/inventory?from=${from}&to=${to}`),
  });

  if (inventory.isLoading) return <LoadingMessage message="Cargando inventario…" />;
  const data = inventory.data!;

  return (
    <div className="stack">
      <div className="card">
        <h3>Insumos bajo mínimo</h3>
        {data.low_stock.length === 0 ? (
          <p className="text-secondary mt-2">Ninguno. Todo sobre el mínimo.</p>
        ) : (
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Stock actual</th>
                <th>Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {data.low_stock.map((item) => (
                <tr key={item.ingredient_id}>
                  <td className="td-bold">{item.name}</td>
                  <td>{item.current_stock.toLocaleString("es-PE")}</td>
                  <td>{item.min_stock_alert.toLocaleString("es-PE")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h3>Compras del periodo</h3>
        {data.purchases.length === 0 ? (
          <p className="text-secondary mt-2">No hay entradas registradas en este periodo.</p>
        ) : (
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Insumo</th>
                <th>Cantidad</th>
                <th>Costo total</th>
                <th>Costo unitario</th>
              </tr>
            </thead>
            <tbody>
              {data.purchases.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.created_at)}</td>
                  <td>{p.ingredient_name}</td>
                  <td>
                    {p.quantity.toLocaleString("es-PE")} {p.unit}
                  </td>
                  <td>{p.total_cost != null ? formatMoney(p.total_cost) : "—"}</td>
                  <td>{p.unit_cost != null ? `S/ ${p.unit_cost}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h3>Recomendaciones</h3>
        <p className="mt-2">
          Pendientes: <strong>{data.recommendations.pendiente}</strong> · Realizadas:{" "}
          <strong>{data.recommendations.realizada}</strong>
        </p>
      </div>
    </div>
  );
}

/* ===================== Predicciones y anomalías ===================== */

function ForecastsTab() {
  const queryClient = useQueryClient();
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const anomalyFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const forecasts = useQuery({
    queryKey: ["forecasts", from, to],
    queryFn: () => api.get<{ items: Forecast[] }>(`/forecasts?from=${from}&to=${to}`),
  });

  const anomalies = useQuery({
    queryKey: ["anomalies", anomalyFrom, to],
    queryFn: () => api.get<{ items: Anomaly[] }>(`/anomalies?from=${anomalyFrom}&to=${to}`),
  });

  const review = useMutation({
    mutationFn: (id: number) => api.patch(`/anomalies/${id}/reviewed`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["anomalies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const generate = useMutation({
    mutationFn: () => api.post("/forecasts/generate"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["forecasts"] });
    },
  });

  const forecastItems = forecasts.data?.items ?? [];
  const anomalyItems = anomalies.data?.items ?? [];

  /* Promedio de todas las predicciones para comparar tendencia (19.8) */
  const avgPredicted = forecastItems.length > 0
    ? forecastItems.reduce((sum, f) => sum + f.predicted_quantity, 0) / forecastItems.length
    : 0;

  return (
    <div className="stack">
      <div className="card">
        <div className="flex-wrap-gap">
          <h3>Predicción de ventas (próximos 7 días)</h3>
          <button className="btn btn-secondary" disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? "Actualizando recomendaciones…" : "Actualizar recomendaciones"}
          </button>
        </div>
        {forecastItems.length === 0 ? (
          <p className="text-secondary mt-4">
            Todavía no hay suficientes ventas para calcular una predicción confiable. Necesitamos al menos 4 semanas de
            datos.
          </p>
        ) : (
          /* Lenguaje de negocio, nunca jerga técnica de ML (19.8) */
          <ul className="anomaly-list mt-4">
            {forecastItems.map((f) => {
              const min = Math.round(f.predicted_quantity * 0.9);
              const max = Math.round(f.predicted_quantity * 1.1);
              const trend = f.predicted_quantity >= avgPredicted
                ? "mayor que el promedio reciente"
                : "menor que el promedio reciente";
              return (
                <li key={f.id} className="anomaly-item">
                  <div className="flex-wrap-gap">
                    <strong className="text-important">{formatDate(f.forecast_date)}</strong>
                    <span className="badge badge-neutral">{f.product_name}</span>
                  </div>
                  <p className="mt-2 text-important">
                    Se esperan <strong>{min}–{max}</strong> ventas
                    <span className="text-secondary text-aux"> (tendencia {trend.toLowerCase()})</span>.
                  </p>
                  <ConfidenceMeter score={f.confidence_score} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card mt-4">
        <h3>Anomalías</h3>
        {anomalyItems.length === 0 ? (
          <p className="text-secondary mt-4">No se detectaron ventas inusuales. Todo dentro de lo normal.</p>
        ) : (
          <ul className="anomaly-list mt-4">
            {anomalyItems.map((anomaly) => {
              const isDrop = anomaly.anomaly_type === "caida_venta";
              return (
                <li
                  key={anomaly.id}
                  className={`anomaly-item ${isDrop ? "anomaly-item--drop" : "anomaly-item--spike"}`}
                >
                  <div className="flex-wrap-gap">
                    <strong className="text-important">
                      {formatDate(anomaly.detected_date)} ·{" "}
                      {isDrop ? "Caída de ventas" : "Pico de ventas"}
                    </strong>
                    {anomaly.is_reviewed ? (
                      <span className="badge badge-ok">Revisada</span>
                    ) : (
                      <button className="btn btn-secondary" onClick={() => review.mutate(anomaly.id)}>
                        Marcar como revisada
                      </button>
                    )}
                  </div>
                  <p className="mt-2">{anomaly.description}</p>
                  <p className="text-aux text-secondary">
                    Esperado: {formatMoney(anomaly.expected_value)} · Real: {formatMoney(anomaly.actual_value)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}


/* ===================== Modal Exportar PDF (sección 20) ===================== */

function PdfExportModal({ from, to, onClose }: { from: string; to: string; onClose: () => void }) {
  const [period, setPeriod] = useState<Period>("custom");
  const [range, setRange] = useState({ from, to });
  const [sections, setSections] = useState<string[]>([
    "summary",
    "payments",
    "products",
    "inventory",
    "forecasts",
    "anomalies",
  ]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSection = (key: string) => {
    setSections((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await downloadReportPdf(range.from, range.to, sections);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No pudimos generar el reporte.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal title="Exportar reporte en PDF" subtitle="Elige el periodo y qué incluir." onClose={onClose}>
      <div className="stack">
        <div>
          <p className="kpi-label">Periodo</p>
          <SegmentedControl
            ariaLabel="Periodo del PDF"
            options={[
              { value: "today", label: "Hoy" },
              { value: "week", label: "Esta semana" },
              { value: "month", label: "Este mes" },
              { value: "custom", label: "Personalizado" },
            ]}
            value={period}
            onChange={(value) => {
              const p = value as Period;
              setPeriod(p);
              if (p !== "custom") setRange(periodRange(p));
            }}
          />
        </div>
        {period === "custom" && (
          <div className="period-row">
            <div className="field field--compact">
              <label htmlFor="pdf-from">Desde</label>
              <input
                id="pdf-from"
                type="date"
                value={range.from}
                onChange={(e) => setRange({ ...range, from: e.target.value })}
              />
            </div>
            <div className="field field--compact">
              <label htmlFor="pdf-to">Hasta</label>
              <input id="pdf-to" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </div>
          </div>
        )}

        <fieldset className="fieldset">
          <legend>Incluir</legend>
          <div className="stack-sm">
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <label key={key} className="field-option">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={sections.includes(key)}
                  onChange={() => toggleSection(key)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary btn-large" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary btn-large"
            disabled={generating || sections.length === 0}
            onClick={() => void generate()}
          >
            {generating ? "Generando reporte…" : "Generar PDF"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ===================== Barra de confianza de la predicción (19.8) ===================== */

function ConfidenceMeter({ score }: { score: number }) {
  const rounded = Math.round(score);
  const low = rounded < 50;
  const width = Math.min(100, Math.max(0, rounded));
  return (
    <div className="mt-3">
      <div className="confidence">
        <span className="text-aux font-bold text-ink-soft">Confianza</span>
        <div className="confidence__track">
          <div
            className={`confidence__fill${low ? " confidence__fill--low" : ""}`}
            style={{ width: `${width}%` }}
          />
        </div>
        <span className="text-aux font-extrabold text-ink">{rounded}/100</span>
      </div>
      {low && (
        <p className="text-aux text-secondary mt-1" role="note">
          Predicción de baja confianza. Úsala solo como referencia.
        </p>
      )}
    </div>
  );
}
