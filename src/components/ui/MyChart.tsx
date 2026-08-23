"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Title,
  Filler,
} from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import annotationPlugin from "chartjs-plugin-annotation";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Title,
  Filler,
  annotationPlugin
);

/** Port of charts/MyChart.vue — the app-wide chart wrapper. */
export function MyChart({
  labels = [],
  dataset = [],
  annotation = [],
  stacked = false,
  formatter,
  height,
  width,
  title,
  chart_type = "bar",
  show_legend = true,
  onClick,
}: {
  labels?: string[];
  dataset?: any[];
  annotation?: any[];
  stacked?: boolean;
  formatter?: (value: any) => string;
  height?: number;
  width?: number;
  title?: string;
  chart_type?: "doughnut" | "line" | "bar";
  show_legend?: boolean;
  /** Fired with the clicked data point's index (bar/point) when the chart is clicked. */
  onClick?: (index: number, datasetIndex: number, event: any) => void;
}) {
  const data = {
    labels,
    datasets: dataset.map((d) => ({
      ...d,
      label: d.label || "",
      backgroundColor: d.backgroundColor || d.borderColor || "rgba(16,185,129,0.7)",
      borderColor: d.borderColor || d.backgroundColor || "#10b981",
    })),
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    height,
    width,
    onClick: (event: any, elements: any[], chart: any) => {
      if (elements?.length) onClick?.(elements[0].index, elements[0].datasetIndex, event);
    },
    plugins: {
      // original MyChart.vue hardcodes legend.display=false
      legend: { display: false, position: "right" },
      title: title ? { display: true, text: title } : undefined,
      tooltip: {
        callbacks: formatter
          ? {
              label: (ctx: any) => {
                const label = ctx.dataset?.label || "";
                const v = ctx.parsed?.y ?? ctx.parsed;
                return `${label ? label + ": " : ""}${Math.abs(v) > 0.05 ? formatter(v) : 0}`;
              },
            }
          : undefined,
      },
      // matching MyChart.vue: dashed line annotation with dark-300 border + label;
      // per-annotation overrides (borderColor/borderDash/borderWidth/labelColor)
      // allow distinct markers like one-time purchases.
      annotation: annotation.length
        ? {
            annotations: annotation.map((a: any, index: number) => ({
              type: a.type ?? "line",
              scaleID: a.scaleID ?? "x",
              borderWidth: a.borderWidth ?? 1,
              borderColor:
                a.borderColor ??
                (typeof document !== "undefined"
                  ? getComputedStyle(document.body).getPropertyValue("--color-dark-300")
                  : "#8d9fb6"),
              borderDash: a.borderDash ?? [10, 5],
              value: a.value,
              endValue: a.value,
              display: (ctx: any) => ctx.chart.isDatasetVisible(0),
              label: {
                display: true,
                content: a.content,
                position: a.labelPosition ?? "start",
                ...(a.labelColor ? { color: a.labelColor } : {}),
                ...(a.font ? { font: a.font } : {}),
              },
            })),
          }
        : undefined,
    },
    scales:
      chart_type === "bar" || chart_type === "line"
        ? {
            x: {
              stacked,
              ticks: {
                callback: () => "",
                color: "#94a3b8",
              },
              grid: { display: false },
            },
            y: {
              stacked,
              ticks: {
                callback: (value: any) => (Math.abs(value) > 0.05 ? formatter?.(value) ?? value : ""),
                color: "#94a3b8",
              },
              grid: { display: false },
            },
          }
        : undefined,
  };

  if (chart_type === "line") return <Line data={data} options={options} />;
  if (chart_type === "doughnut") return <Doughnut data={data} options={options} />;
  return <Bar data={data} options={options} />;
}
