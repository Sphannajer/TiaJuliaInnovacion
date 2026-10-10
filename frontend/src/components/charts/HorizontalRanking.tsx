import { useEffect, useRef, CSSProperties } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Tooltip,
  type ScriptableContext,
} from "chart.js";
import type { TopProduct } from "../../types";

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, Tooltip);

interface HorizontalRankingProps {
  items: TopProduct[];
  ariaLabel: string;
}

/* Paleta rotativa de marca: cada posición del ranking tiene su color (6.1) */
const RANK_PALETTE: [string, string][] = [
  ["#79BE68", "#4F9C3A"], // verde
  ["#F0B24A", "#E99015"], // naranja
  ["#E0736F", "#C92429"], // rojo
  ["#E7B963", "#B96F0E"], // ámbar
  ["#9BC98D", "#3E7C2D"], // verde oscuro
];

/** Degradado horizontal para las barras del ranking. */
function horizontalGradient(chart: ChartJS, from: string, to: string): CanvasGradient | string {
  const { ctx, chartArea } = chart;
  if (!chartArea) return from;
  const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  return gradient;
}

/** Ranking de productos (10.3): barras horizontales coloridas con cantidad al final. */
export function HorizontalRanking({ items, ariaLabel }: HorizontalRankingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // StrictMode (React 18) monta→desmonta→remonta el mismo canvas: destruye
    // cualquier instancia previa antes de crear una nueva (evita "Canvas is
    // already in use") y cubre también HMR.
    ChartJS.getChart(canvas)?.destroy();
    const chart = new ChartJS(canvas, {
      type: "bar",
      data: {
        labels: items.map((i, index) => `${index + 1}. ${i.product_name}`),
        datasets: [
          {
            data: items.map((i) => i.quantity),
            backgroundColor: (context: ScriptableContext<"bar">) => {
              const { chart: c, dataIndex } = context;
              const pair = RANK_PALETTE[dataIndex % RANK_PALETTE.length];
              return horizontalGradient(c, pair[0], pair[1]);
            },
            hoverBackgroundColor: "#C92429",
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 40,
          } as any,
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: "var(--text-secondary)", font: { size: 16, family: "Nunito Sans" } },
            grid: { color: "var(--chart-grid)" },
            border: { display: false },
          },
          y: {
            ticks: { color: "var(--text-main)", font: { size: 17, weight: 700 as any, family: "Nunito Sans" } },
            grid: { display: false },
            border: { display: false },
          },
        },
        animation: { duration: 400, easing: "easeOutQuart" },
      },
    });
    return () => chart.destroy();
  }, [items]);

  /* Altura acotada: el gráfico nunca desborda la tarjeta que lo contiene. */
  const chartHeight = Math.min(Math.max(150, items.length * 44), 300);

  return (
    <div className="flex flex-col gap-2">
      {/* chart-canvas aísla el canvas en un contenedor con overflow:hidden y
          max-height, evitando el bucle de redimensión infinito de Chart.js */}
      <div
        className="chart-container"
        style={{ "--chart-height": `${chartHeight}px` } as CSSProperties}
      >
        <div className="chart-canvas">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={ariaLabel}
            width={800}
            height={chartHeight}
          />
        </div>
      </div>
      {/* Cantidades exactas junto al ranking (no solo dentro del gráfico).
          Fuera del contenedor de altura fija para que no se desborde. */}
      <ul className="ranking-list text-aux">
        {items.map((item, index) => (
          <li key={item.product_id} className="row-between">
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ background: RANK_PALETTE[index % RANK_PALETTE.length][1] }}
              />
              {index + 1}. {item.product_name}
            </span>
            <strong>{item.quantity}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
