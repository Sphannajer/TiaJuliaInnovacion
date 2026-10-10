import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Tooltip,
  type ScriptableContext,
} from "chart.js";
import { Modal } from "../ui/Modal";
import { formatMoney } from "../../lib/currency";
import { formatDate } from "../../lib/dates";
import type { SalesSeriesPoint } from "../../types";

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, Tooltip);

interface SalesBarChartProps {
  data: SalesSeriesPoint[];
  onSelect?: (point: SalesSeriesPoint) => void;
  /** Etiqueta del punto en el modal de detalle (por defecto: la fecha). */
  detailLabel?: string;
  ariaLabel?: string;
}

/* Paleta de marca para dar color y jerarquía a las barras (6.1) */
const BRAND_PALETTE: [string, string][] = [
  ["#F0B24A", "#E99015"], // naranja claro → naranja
  ["#79BE68", "#4F9C3A"], // verde claro → verde
  ["#E0736F", "#C92429"], // rojo claro → rojo de marca
  ["#C99A2E", "#A66A00"], // ámbar
];
const TODAY_GRADIENT: [string, string] = ["#E99015", "#C92429"];

/** Crea un degradado vertical dentro del área del gráfico. */
function verticalGradient(chart: ChartJS, top: string, bottom: string): CanvasGradient | string {
  const { ctx, chartArea } = chart;
  if (!chartArea) return top;
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  return gradient;
}

/**
 * Gráfico de ventas (10.2): barras coloridas con degradado de marca,
 * día actual resaltado en rojo. Al tocar una columna se abre un modal con
 * el detalle (no ocupa espacio fijo). Los importes encima de las barras solo
 * se muestran cuando hay pocas columnas, para que nunca se desborden.
 */
export function SalesBarChart({
  data,
  onSelect,
  detailLabel = "Detalle del día",
  ariaLabel = "Gráfico de ventas por período",
}: SalesBarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);
  const [selected, setSelected] = useState<SalesSeriesPoint | null>(null);

  /* Con muchas columnas los importes se encimaban: solo se muestran si caben
     (día o semana). Para rangos largos (mes) el detalle va en el modal. */
  const showValues = data.length <= 8;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // StrictMode (React 18) monta→desmonta→remonta el mismo canvas: destruye
    // cualquier instancia previa antes de crear una nueva.
    ChartJS.getChart(canvas)?.destroy();
    const todaySuffix = "(Hoy)";
    const isToday = (label: string) => label.includes(todaySuffix);

    const chart = new ChartJS(canvas, {
      type: "bar",
      data: {
        labels: data.map((d) => d.label),
        datasets: [
          {
            data: data.map((d) => d.total),
            backgroundColor: (context: ScriptableContext<"bar">) => {
              const { chart: c, dataIndex } = context;
              const point = data[dataIndex];
              if (!point) return "var(--brand-orange)";
              const pair = isToday(point.label)
                ? TODAY_GRADIENT
                : BRAND_PALETTE[dataIndex % BRAND_PALETTE.length];
              return verticalGradient(c, pair[0], pair[1]);
            },
            hoverBackgroundColor: (context: ScriptableContext<"bar">) => {
              const { chart: c, dataIndex } = context;
              const point = data[dataIndex];
              const pair = point && isToday(point.label) ? TODAY_GRADIENT : ["#FFC46B", "#B96F0E"];
              return verticalGradient(c, pair[0], pair[1]);
            },
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 72,
          } as any,
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        onHover: (event, elements) => {
          const target = event.native?.target as HTMLElement | undefined;
          if (target) target.style.cursor = elements.length > 0 ? "pointer" : "default";
        },
        onClick: (_event, elements) => {
          const index = elements[0]?.index;
          if (index === undefined) return;
          setSelected(data[index]);
          onSelect?.(data[index]);
        },
        scales: {
          x: {
            ticks: { color: "var(--text-secondary)", font: { size: 16, family: "Nunito Sans" } },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: "var(--text-secondary)",
              font: { size: 16, family: "Nunito Sans" },
              callback: (value) => `S/ ${value}`,
            },
            grid: { color: "var(--chart-grid)" },
            border: { display: false },
          },
        },
        animation: { duration: 400, easing: "easeOutQuart" },
        hover: { mode: "index", intersect: true },
      },
    });
    chartRef.current = chart;
    return () => chart.destroy();
  }, [data, onSelect]);

  return (
    <div>
      <div className="chart-container" style={{ "--chart-height": "320px" } as CSSProperties}>
        <div className="chart-canvas">
          <canvas ref={canvasRef} role="img" aria-label={ariaLabel} width={800} height={320} />
        </div>
      </div>

      <p className="text-secondary text-aux mt-2">
        {showValues ? "Toca una columna para ver el detalle del día." : "Toca una columna para ver el detalle."}
      </p>

      {showValues && (
        <div className="chart-value-above-bar">
          {data.map((d) => (
            <span key={d.date} className="text-aux">
              {d.total > 0 ? formatMoney(d.total) : "—"}
            </span>
          ))}
        </div>
      )}

      {selected && (
        <Modal title={detailLabel} subtitle={formatDate(selected.date)} onClose={() => setSelected(null)}>
          <div className="stack">
            <div className="kpi-card kpi-card--beige">
              <p className="kpi-label">Ventas del período</p>
              <p className="kpi-value">{formatMoney(selected.total)}</p>
            </div>
            <div className="data-row">
              <span>Órdenes pagadas</span>
              <span>{selected.orders.toLocaleString("es-PE")}</span>
            </div>
            {selected.cash + selected.yape > 0 && (
              <>
                <div className="data-row">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full bg-cash" />
                    Efectivo
                  </span>
                  <span className="text-cash">{formatMoney(selected.cash)}</span>
                </div>
                <div className="data-row">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full bg-yape" />
                    Yape
                  </span>
                  <span className="text-yape">{formatMoney(selected.yape)}</span>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
