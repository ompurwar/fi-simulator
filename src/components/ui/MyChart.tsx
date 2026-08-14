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
      // matching MyChart.vue: dashed line annotation with dark-300 border + label
      annotation: annotation.length
        ? {
            annotations: annotation.map((a: any, index: number) => ({
              type: "line",
              scaleID: "x",
              borderWidth: 1,
              borderColor: typeof document !== "undefined"
                ? getComputedStyle(document.body).getPropertyValue("--color-dark-300")
                : "#8d9fb6",
              borderDash: [10, 5],
              value: a.value,
              endValue: a.value,
              display: (ctx: any) => ctx.chart.isDatasetVisible(0),
              label: { display: true, content: a.content, position: "start" },
            })),
          }
        : undefined,
    },
    scales:
      chart_type === "bar" || chart_type === "line"
        ? {
            x: {
              stacked,
              ticks: { callback: () => "" }, // original: x labels hidden
              grid: { display: false },
            },
            y: {
              stacked,
              ticks: { callback: (value: any) => (Math.abs(value) > 0.05 ? formatter?.(value) ?? value : "") },
              grid: { display: false },
            },
          }
        : undefined,
  };

  if (chart_type === "line") return <Line data={data} options={options} />;
  if (chart_type === "doughnut") return <Doughnut data={data} options={options} />;
  return <Bar data={data} options={options} />;
}
