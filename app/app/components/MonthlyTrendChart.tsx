"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useFilter } from "./FilterContext";

const YEAR_COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#2dd4bf", "#34d399",
  "#fbbf24", "#fb923c", "#818cf8",
];

const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export default function MonthlyTrendChart() {
  const { raw, filtered, setTimeRange } = useFilter();

  // --- Comparison mode: one line per year, Jan-Dec x-axis ---
  const comparisonData = useMemo(() => {
    if (!filtered.isComparing) return null;

    const years = filtered.comparisonYears;
    // Build: [{month: 1, label: "Ene", 2022: 15.3, 2023: 20.1}, ...]
    const byYearMonth = new Map<string, number>();
    for (const r of raw.artistMonth) {
      const year = parseInt(r.m.slice(0, 4));
      if (!years.includes(year)) continue;
      const key = `${year}-${r.m.slice(5)}`;
      byYearMonth.set(key, (byYearMonth.get(key) || 0) + r.h);
    }

    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, "0");
      const point: Record<string, string | number> = {
        month: i + 1,
        label: MONTH_LABELS[i],
      };
      for (const y of years) {
        point[String(y)] = Math.round((byYearMonth.get(`${y}-${mm}`) || 0) * 10) / 10;
      }
      return point;
    });
  }, [raw.artistMonth, filtered.isComparing, filtered.comparisonYears]);

  // --- Normal mode: full timeline ---
  const timelineData = useMemo(() => {
    if (filtered.isComparing) return null;

    const byMonth = new Map<string, number>();
    for (const r of raw.artistMonth) {
      byMonth.set(r.m, (byMonth.get(r.m) || 0) + r.h);
    }
    const points = raw.allMonths.map((m) => ({
      month: m,
      label: m.slice(2),
      hours: Math.round((byMonth.get(m) || 0) * 10) / 10,
      active: filtered.months.has(m),
      ma6: 0,
    }));

    // 6-month moving average
    for (let i = 0; i < points.length; i++) {
      const window = points.slice(Math.max(0, i - 5), i + 1);
      points[i].ma6 = Math.round((window.reduce((s, p) => s + p.hours, 0) / window.length) * 10) / 10;
    }

    return points;
  }, [raw, filtered.months, filtered.isComparing]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleTimelineClick = (state: any) => {
    // recharts onClick gives activeTooltipIndex or activePayload
    const payload = state?.activePayload?.[0]?.payload;
    if (payload?.month && typeof payload.month === "string") {
      setTimeRange({ type: "month", month: payload.month });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDotClick = (_: any, payload: any) => {
    if (payload?.payload?.month && typeof payload.payload.month === "string") {
      setTimeRange({ type: "month", month: payload.payload.month });
    }
  };

  // --- Render comparison ---
  if (filtered.isComparing && comparisonData) {
    const years = filtered.comparisonYears;
    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
          Horas por mes — comparación
        </h2>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 11, fontFamily: "var(--font-mono)" }}
                axisLine={{ stroke: "#27272a" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#52525b", fontSize: 10, fontFamily: "var(--font-mono)" }}
                width={35}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
                formatter={(value) => [`${value}h`, ""]}
              />
              <Legend
                wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
              />
              {years.map((y, i) => (
                <Line
                  key={y}
                  type="monotone"
                  dataKey={String(y)}
                  stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3, fill: YEAR_COLORS[i % YEAR_COLORS.length] }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // --- Render timeline ---
  if (!timelineData) return null;

  const hasFilter = [...filtered.months].length < raw.allMonths.length;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
        Horas por mes
      </h2>
      <p className="text-[11px] text-zinc-600 mb-3">click en un mes para filtrar · sólido = media móvil 6m · punteado = mes a mes</p>
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={timelineData} onClick={handleTimelineClick}>
            <defs>
              <linearGradient id="gradH" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#52525b", fontSize: 10, fontFamily: "var(--font-mono)" }}
              tickFormatter={(v: string) => v.endsWith("-01") ? `'${v.slice(0, 2)}` : ""}
              interval={0}
              axisLine={{ stroke: "#27272a" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#52525b", fontSize: 10, fontFamily: "var(--font-mono)" }}
              width={35}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#18181b",
                border: "1px solid #3f3f46",
                borderRadius: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "#a1a1aa",
              }}
              formatter={(value) => [`${value}h`, ""]}
              labelFormatter={(label) => `20${label}`}
            />
            {/* Monthly values — dotted, subtle */}
            <Area
              type="monotone"
              dataKey="hours"
              stroke="#52525b"
              strokeWidth={1}
              strokeDasharray="3 3"
              fill="none"
              dot={false}
              activeDot={{
                r: 5,
                fill: "#a78bfa",
                stroke: "#18181b",
                strokeWidth: 2,
                cursor: "pointer",
                onClick: handleDotClick,
              }}
              opacity={hasFilter ? 0.15 : 0.6}
            />
            {/* 6-month moving average — solid with fill */}
            <Area
              type="monotone"
              dataKey="ma6"
              stroke="#a78bfa"
              strokeWidth={2}
              fill="url(#gradH)"
              dot={false}
              opacity={hasFilter ? 0.25 : 1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
