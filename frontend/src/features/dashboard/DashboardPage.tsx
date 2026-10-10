import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Banknote, Smartphone, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "../../lib/api";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Modal } from "../../components/ui/Modal";
import { SalesBarChart } from "../../components/charts/SalesBarChart";
import { HorizontalRanking } from "../../components/charts/HorizontalRanking";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingMessage } from "../../components/feedback/LoadingMessage";
import { formatMoney } from "../../lib/currency";
import type { DashboardOverview, DashboardSummary, ReportSummary, SalesSeriesPoint, TopProduct } from "../../types";

type Period = "today" | "week" | "month";

/** Pantalla 1 — Dashboard / Panel de control (sección 10). */
export function DashboardPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [seriesPeriod, setSeriesPeriod] = useState<Period>("week");
  const [detailOpen, setDetailOpen] = useState(false);
  const navigate = useNavigate();

  const overview = useQuery({
    queryKey: ["dashboard", "overview", period],
    queryFn: () => api.get<DashboardOverview>(`/dashboard/overview?period=${period}`),
    refetchInterval: 60_000,
  });

  const series = useQuery({
    queryKey: ["dashboard", "series", seriesPeriod],
    queryFn: () => api.get<SalesSeriesPoint[]>(`/dashboard/sales-series?period=${seriesPeriod}`),
  });

  const topProducts = useQuery({
    queryKey: ["dashboard", "top-products", period === "today" ? "week" : period],
    queryFn: () =>
      api.get<TopProduct[]>(
        `/dashboard/top-products?period=${period === "today" ? "week" : period}&limit=5`,
      ),
  });

  const navigateTo = (path: string) => {
    void navigate(path);
  };

  if (overview.isLoading) {
    return <LoadingMessage message="Cargando ventas…" />;
  }

  if (overview.isError) {
    return (
      <EmptyState
        title="No pudimos cargar el panel."
        description="Revisa tu conexión. Si el problema continúa, intenta nuevamente."
        actionLabel="Intentar nuevamente"
        onAction={() => void overview.refetch()}
      />
    );
  }

  const data = overview.data!;
  const summary = data.summary;

  const periodLabel =
    period === "today" ? "Ventas de hoy" : period === "week" ? "Ventas de esta semana" : "Ventas de este mes";

  const chartTitle =
    seriesPeriod === "week" ? "esta semana" : seriesPeriod === "month" ? "este mes" : "hoy";

  return (
    <div>
      <div className="flex-wrap-gap">
        <div>
          <h1>Panel de control</h1>
          <p className="text-secondary">
            {new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <SegmentedControl
          ariaLabel="Periodo"
          options={[
            { value: "today", label: "Hoy" },
            { value: "week", label: "Esta semana" },
            { value: "month", label: "Este mes" },
          ]}
          value={period}
          onChange={(value) => setPeriod(value as Period)}
        />
      </div>

      {/* Fila superior: 3 bloques accionables (10.1) */}
      <div className="dashboard-grid mt-6">
        {/* A. Ventas */}
        <section className="card border-t-4 border-t-brand-red" aria-label="Ventas del periodo">
          <h2 className="card-title">{periodLabel}</h2>
          <p className="kpi-value" aria-live="polite">
            {formatMoney(summary.sales_total)}
          </p>

          {/* Cuadrito de medios de pago con colores: efectivo verde, yape morado */}
          <div className="stack-sm mt-4">
            <div className="payment-box payment-box--cash">
              <span className="payment-box__label">
                <span className="payment-box__icon payment-box__icon--cash" aria-hidden>
                  <Banknote size={20} />
                </span>
                Efectivo
              </span>
              <span className="payment-box__value">{formatMoney(summary.payments.cash)}</span>
            </div>
            <div className="payment-box payment-box--yape">
              <span className="payment-box__label">
                <span className="payment-box__icon payment-box__icon--yape" aria-hidden>
                  <Smartphone size={20} />
                </span>
                Yape
              </span>
              <span className="payment-box__value">{formatMoney(summary.payments.yape)}</span>
            </div>
          </div>

          <button className="btn btn-secondary btn-block mt-4" onClick={() => setDetailOpen(true)}>
            Ver detalle del día
          </button>
        </section>

        {/* B. Stock por revisar */}
        <section className="card border-t-4 border-t-brand-orange" aria-label="Stock que necesita atención">
          <h2 className="card-title">Stock por revisar</h2>
          {data.stock_attention.length === 0 ? (
            <p className="text-secondary">Todo el inventario está sobre el mínimo. Bien.</p>
          ) : (
            <ul className="stock-list">
              {data.stock_attention.map((item) => (
                <li key={item.ingredient_id} className="stock-item">
                  <span className="stock-name">{item.name}</span>
                  <span>
                    Quedan {item.current_stock.toLocaleString("es-PE")} {item.base_unit}{" "}
                    <span className={`badge ${item.state === "CRITICO" ? "badge-danger" : "badge-warn"}`}>
                      {item.state}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn-secondary btn-block mt-4" to="/products?tab=insumos">
            Ver todos los insumos
          </Link>
        </section>

        {/* C. Compra recomendada */}
        <section className="card border-t-4 border-t-brand-green" aria-label="Compra recomendada">
          <h2 className="card-title">Compra recomendada</h2>
          <p className="text-aux text-secondary">Para los próximos 7 días</p>
          {data.recommendation_status !== "ok" || !data.recommendation_preview || data.recommendation_preview.length === 0 ? (
            <p className="text-secondary mt-4">
              Todavía no hay suficientes ventas para calcular una recomendación confiable. Necesitamos al menos 4
              semanas de datos.
            </p>
          ) : (
            <ul className="stock-list mt-4">
              {data.recommendation_preview.slice(0, 3).map((rec) => (
                <li key={rec.id} className="stock-item">
                  <span className="stock-name">{rec.ingredient_name}</span>
                  <span>Comprar {rec.recommended_quantity.toLocaleString("es-PE")}</span>
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn-secondary btn-block mt-4" to="/products?tab=recomendaciones">
            Ver recomendación completa
          </Link>
        </section>
      </div>

      {/* Gráfico principal (10.2) */}
      <section className="card border-t-4 border-t-brand-orange mt-6" aria-label="Ventas por día">
        <div className="flex-wrap-gap">
          <h2 className="card-title mb-0">Ventas de {chartTitle}</h2>
          <SegmentedControl
            ariaLabel="Periodo del gráfico"
            options={[
              { value: "today", label: "Hoy" },
              { value: "week", label: "Semana" },
              { value: "month", label: "Mes" },
            ]}
            value={seriesPeriod}
            onChange={(value) => setSeriesPeriod(value as Period)}
          />
        </div>
        <div className="mt-4">
          {series.isLoading ? (
            <LoadingMessage message="Cargando ventas…" />
          ) : (
            <SalesBarChart data={series.data ?? []} />
          )}
        </div>
      </section>

      {/* Comparación de meses (ganancias) */}
      <MonthComparison />

      {/* Fila inferior (10.3) */}
      <div className="dashboard-bottom mt-6">
        <section className="card" aria-label="Productos más vendidos">
          <h2 className="card-title">Productos más vendidos</h2>
          {topProducts.isLoading ? (
            <LoadingMessage message="Cargando productos…" />
          ) : topProducts.data && topProducts.data.length > 0 ? (
            <HorizontalRanking items={topProducts.data} ariaLabel="Ranking de productos más vendidos" />
          ) : (
            <EmptyState
              title="Aún no hay ventas registradas en este periodo."
              description="Cuando registres ventas, aquí verás cuáles productos se venden más."
              actionLabel="Registrar primera venta"
              onAction={() => navigateTo("/sales/new")}
            />
          )}
        </section>

        <section className="card" aria-label="Alertas recientes">
          <h2 className="card-title">Alertas recientes</h2>
          {data.alerts.length === 0 ? (
            <p className="text-secondary">No hay alertas por ahora. Todo en orden.</p>
          ) : (
            <ul className="alerts-list">
              {data.alerts.map((alert) => (
                <li key={alert.id} className="alert-item">
                  <span>
                    <strong aria-hidden>
                      {alert.icon}
                    </strong>{" "}
                    {alert.message}
                  </span>
                  {alert.link && (
                    <Link className="btn btn-secondary" to={alert.link}>
                      {alert.action}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {detailOpen && <DayDetailModal period={period} onClose={() => setDetailOpen(false)} />}
    </div>
  );
}

/* ===================== Detalle del día ===================== */

const DETAIL_TITLES: Record<Period, string> = {
  today: "Detalle de hoy",
  week: "Detalle de esta semana",
  month: "Detalle de este mes",
};

/** Modal con el resumen del periodo y el ranking de productos más solicitados. */
function DayDetailModal({ period, onClose }: { period: Period; onClose: () => void }) {
  const summary = useQuery({
    queryKey: ["dashboard", "detail-summary", period],
    queryFn: () => api.get<DashboardSummary>(`/dashboard/summary?period=${period}`),
  });

  const ranking = useQuery({
    queryKey: ["dashboard", "detail-top", period],
    queryFn: () => api.get<TopProduct[]>(`/dashboard/top-products?period=${period}&limit=5`),
  });

  const data = summary.data;
  const paid = data ? data.payments.cash + data.payments.yape : 0;
  const cashPct = paid > 0 && data ? Math.round((data.payments.cash / paid) * 100) : 0;
  const yapePct = data && paid > 0 ? 100 - cashPct : 0;

  return (
    <Modal title={DETAIL_TITLES[period]} subtitle="Resumen de ventas y productos más pedidos." onClose={onClose} wide>
      {summary.isLoading ? (
        <LoadingMessage message="Cargando detalle…" />
      ) : data ? (
        <div className="stack">
          <div className="detail-grid">
            <div className="detail-tile">
              <p className="detail-tile__label">Venta total</p>
              <p className="detail-tile__value text-brand-red">{formatMoney(data.sales_total)}</p>
            </div>
            <div className="detail-tile">
              <p className="detail-tile__label">Órdenes pagadas</p>
              <p className="detail-tile__value">{data.orders_paid.toLocaleString("es-PE")}</p>
            </div>
          </div>

          <div className="payment-box payment-box--cash">
            <span className="payment-box__label">
              <span className="payment-box__icon payment-box__icon--cash" aria-hidden>
                <Banknote size={20} />
              </span>
              Efectivo
            </span>
            <span className="payment-box__value">
              {formatMoney(data.payments.cash)} <span className="text-aux">({cashPct}%)</span>
            </span>
          </div>
          <div className="payment-box payment-box--yape">
            <span className="payment-box__label">
              <span className="payment-box__icon payment-box__icon--yape" aria-hidden>
                <Smartphone size={20} />
              </span>
              Yape
            </span>
            <span className="payment-box__value">
              {formatMoney(data.payments.yape)} <span className="text-aux">({yapePct}%)</span>
            </span>
          </div>

          <div>
            <p className="modal-section-title">Productos más solicitados</p>
            {ranking.isLoading ? (
              <LoadingMessage message="Cargando ranking…" />
            ) : ranking.data && ranking.data.length > 0 ? (
              <HorizontalRanking items={ranking.data} ariaLabel="Productos más solicitados" />
            ) : (
              <p className="text-secondary">Todavía no hay ventas de productos en este periodo.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-secondary">No pudimos cargar el detalle. Intenta nuevamente.</p>
      )}
    </Modal>
  );
}

/* ===================== Comparación de meses (ganancias) ===================== */

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Últimos `count` meses (el actual llega hasta hoy). */
function lastMonths(count: number): { key: string; label: string; from: string; to: string }[] {
  const now = new Date();
  const list: { key: string; label: string; from: string; to: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const isCurrent = i === 0;
    const end = isCurrent
      ? now
      : new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    list.push({
      key: `${start.getFullYear()}-${start.getMonth()}`,
      label: `${MONTH_NAMES[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`,
      from: toIso(start),
      to: toIso(end),
    });
  }
  return list;
}

/** Mismo tramo del mes pasado (para una comparación justa mes-a-mes). */
function previousComparableWindow(): { from: string; to: string } {
  const now = new Date();
  const prevMonth = now.getMonth() - 1;
  const year = now.getFullYear() + (prevMonth < 0 ? -1 : 0);
  const monthIndex = (prevMonth + 12) % 12;
  const day = Math.min(now.getDate(), daysInMonth(year, monthIndex));
  return {
    from: toIso(new Date(year, monthIndex, 1)),
    to: toIso(new Date(year, monthIndex, day)),
  };
}

/** Ganancias por mes: total de cada mes y variación contra el mes anterior. */
function MonthComparison() {
  const months = useMemo(() => lastMonths(6), []);

  const prevWindow = useMemo(() => previousComparableWindow(), []);

  const comparison = useQuery({
    queryKey: ["dashboard", "months", months.map((m) => m.from).join(",")],
    queryFn: () =>
      Promise.all(months.map((m) => api.get<ReportSummary>(`/reports/summary?from=${m.from}&to=${m.to}`))),
    refetchInterval: 300_000,
  });

  const prevComparable = useQuery({
    queryKey: ["dashboard", "prev-comparable", prevWindow.from, prevWindow.to],
    queryFn: () => api.get<ReportSummary>(`/reports/summary?from=${prevWindow.from}&to=${prevWindow.to}`),
    refetchInterval: 300_000,
  });

  const summaries = comparison.data ?? [];
  const points: SalesSeriesPoint[] = summaries.map((s, i) => ({
    date: months[i].from,
    label: months[i].label,
    total: s.sales_total,
    orders: s.orders_paid,
    cash: s.payments.cash,
    yape: s.payments.yape,
  }));

  const current = summaries[summaries.length - 1];
  // Comparación justa: mismo tramo del mes anterior (no mes completo vs parcial).
  const previous = prevComparable.data;
  const delta =
    current && previous && previous.sales_total > 0
      ? ((current.sales_total - previous.sales_total) / previous.sales_total) * 100
      : null;
  const up = delta !== null && delta >= 0;

  return (
    <section className="card border-t-4 border-t-brand-green mt-6" aria-label="Ganancias por mes">
      <div className="flex-wrap-gap justify-between">
        <div>
          <h2 className="card-title mb-0">Ganancias por mes</h2>
          <p className="text-secondary text-aux">
            Este mes en curso comparado con el mismo tramo del mes anterior.
          </p>
        </div>
        {delta !== null && (
          <span className={`badge ${up ? "badge-ok" : "badge-danger"}`}>
            {up ? <TrendingUp size={16} aria-hidden /> : <TrendingDown size={16} aria-hidden />}
            {up ? "+" : ""}
            {delta.toFixed(1)}% vs mes anterior
          </span>
        )}
      </div>

      {current && previous && (
        <div className="dashboard-grid mt-4">
          <div className="kpi-card kpi-card--white">
            <p className="kpi-label">Este mes (en curso)</p>
            <p className="kpi-value">{formatMoney(current.sales_total)}</p>
          </div>
          <div className="kpi-card kpi-card--white">
            <p className="kpi-label">Mismo tramo del mes pasado</p>
            <p className="kpi-value">{formatMoney(previous.sales_total)}</p>
          </div>
          <div className={`kpi-card ${up ? "kpi-card--green" : ""}`}>
            <p className="kpi-label">Variación</p>
            <p className="kpi-value">{delta === null ? "—" : `${up ? "+" : ""}${delta.toFixed(1)}%`}</p>
          </div>
        </div>
      )}

      <div className="mt-4">
        {comparison.isLoading ? (
          <LoadingMessage message="Comparando meses…" />
        ) : points.length > 0 ? (
          <SalesBarChart
            data={points}
            detailLabel="Detalle del mes"
            ariaLabel="Ganancias por mes"
          />
        ) : (
          <p className="text-secondary">Aún no hay ventas suficientes para comparar meses.</p>
        )}
      </div>
    </section>
  );
}
