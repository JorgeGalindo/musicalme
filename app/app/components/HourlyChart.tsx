"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  CartesianGrid,
} from "recharts";
import { useFilter } from "./FilterContext";

type HourlyMonth = { hr: number; m: string; p: number; min: number };

const YEAR_COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#2dd4bf", "#34d399",
  "#fbbf24", "#fb923c", "#818cf8",
];

// Reorder hours: 6am → 2am (6,7,8,...,23,0,1,2)
const HOUR_ORDER = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2];

function formatHour(h: number): string {
  if (h === 0) return "0h";
  if (h < 10) return `${h}h`;
  return `${h}h`;
}

export default function HourlyChart() {
  const [hourlyData, setHourlyData] = useState<HourlyMonth[] | null>(null);
  const { filtered } = useFilter();

  useEffect(() => {
    fetch("/data/hourly-month.json")
      .then((r) => r.json())
      .then((data: HourlyMonth[]) => {
        // Apple Music hours can be multi-value strings like "14, 18, 19"
        // Expand each into separate entries, splitting minutes evenly
        const expanded: HourlyMonth[] = [];
        for (const d of data) {
          const hrStr = String(d.hr);
          if (hrStr.includes(",")) {
            const hours = hrStr.split(",").map((h) => parseInt(h.trim())).filter((h) => !isNaN(h));
            const share = hours.length || 1;
            for (const h of hours) {
              expanded.push({ ...d, hr: h, min: Math.round((d.min / share) * 10) / 10, p: Math.round(d.p / share) });
            }
          } else {
            expanded.push({ ...d, hr: Number(d.hr) });
          }
        }
        setHourlyData(expanded);
      });
  }, []);

  // --- Comparison: lines per year ---
  const comparisonData = useMemo(() => {
    if (!filtered.isComparing || !hourlyData) return null;

    const periods = filtered.comparisonPeriods;

    // Per period: average plays per hour (divide by number of months in that period)
    const periodHourly = periods.map((period) => {
      const hourPlays = new Map<number, number>();
      const months = new Set<string>();

      for (const r of hourlyData) {
        if (!period.months.has(r.m)) continue;
        months.add(r.m);
        hourPlays.set(r.hr, (hourPlays.get(r.hr) || 0) + r.min);
      }

      const nMonths = Math.max(months.size, 1);
      return { label: period.label, hourPlays, nMonths };
    });

    return HOUR_ORDER.map((h) => {
      const row: Record<string, string | number> = { hour: formatHour(h) };
      for (const pd of periodHourly) {
        // Average minutes per month for this hour
        row[pd.label] = Math.round(((pd.hourPlays.get(h) || 0) / pd.nMonths) * 10) / 10;
      }
      return row;
    });
  }, [hourlyData, filtered.isComparing, filtered.comparisonPeriods]);

  // --- Normal mode: average across all filtered months ---
  const data = useMemo(() => {
    if (filtered.isComparing || !hourlyData) return [];

    const hourMin = new Map<number, number>();
    const months = new Set<string>();

    for (const r of hourlyData) {
      if (!filtered.months.has(r.m)) continue;
      months.add(r.m);
      hourMin.set(r.hr, (hourMin.get(r.hr) || 0) + r.min);
    }

    const nMonths = Math.max(months.size, 1);

    return HOUR_ORDER.map((h) => ({
      hour: formatHour(h),
      minutes: Math.round(((hourMin.get(h) || 0) / nMonths) * 10) / 10,
    }));
  }, [hourlyData, filtered.months, filtered.isComparing]);

  if (!hourlyData) return null;

  const tooltipStyle = {
    background: "#18181b",
    border: "1px solid #3f3f46",
    borderRadius: 8,
    fontSize: 12,
    color: "#a1a1aa",
  };

  // --- Render comparison ---
  if (filtered.isComparing && comparisonData) {
    const periods = filtered.comparisonPeriods;
    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">
          Hora del día — comparación
        </h2>
        <p className="text-[11px] text-zinc-600 mb-4">minutos medios por mes a cada hora</p>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="hour" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#52525b", fontSize: 10 }} width={35} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} min/mes`, ""]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {periods.map((period, i) => (
                <Line key={period.label} type="monotone" dataKey={period.label} stroke={YEAR_COLORS[i]} strokeWidth={2}
                  dot={{ r: 3, fill: YEAR_COLORS[i] }} activeDot={{ r: 5 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // --- Render normal ---
  if (data.length === 0) return null;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">
        Hora del día
      </h2>
      <p className="text-[11px] text-zinc-600 mb-4">minutos medios por mes · 6h–2h</p>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="hour" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#52525b", fontSize: 10 }} width={35} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} min/mes`, ""]} />
            <Bar dataKey="minutes" radius={[3, 3, 0, 0]}>
              {data.map((_, i) => {
                // Gradient from dawn (cool blue) → morning (light blue) → noon (warm yellow) → evening (warm pink) → night (deep purple)
                const t = i / (HOUR_ORDER.length - 1); // 0 = 6am, 1 = 2am
                const colors = [
                  "#60a5fa", // 6am  — cool blue
                  "#38bdf8", // 8am  — light blue
                  "#22d3ee", // 10am — cyan
                  "#fbbf24", // 12pm — warm yellow
                  "#f59e0b", // 2pm  — amber
                  "#fb923c", // 4pm  — orange
                  "#f472b6", // 6pm  — pink
                  "#e879f9", // 8pm  — magenta
                  "#a78bfa", // 10pm — purple
                  "#818cf8", // 12am — indigo
                  "#6366f1", // 2am  — deep indigo
                ];
                const idx = Math.round(t * (colors.length - 1));
                return <Cell key={i} fill={colors[idx]} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
