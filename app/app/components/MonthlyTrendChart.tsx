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

export default function MonthlyTrendChart() {
  const { raw, filtered, setTimeRange } = useFilter();

  // --- Comparison mode: Jan-Dec averaged across years in each period ---
  const comparisonData = useMemo(() => {
    if (!filtered.isComparing) return null;

    const periods = filtered.comparisonPeriods;
    const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    // For each period: group hours by month-of-year (01-12), then average across years
    const periodMonthly = periods.map((period) => {
      const byMM = new Map<string, number>();    // "01" → total hours
      const yearsByMM = new Map<string, Set<string>>(); // "01" → set of years seen
      for (const r of raw.artistMonth) {
        if (!period.months.has(r.m)) continue;
        const mm = r.m.slice(5);  // "01".."12"
        byMM.set(mm, (byMM.get(mm) || 0) + r.h);
        if (!yearsByMM.has(mm)) yearsByMM.set(mm, new Set());
        yearsByMM.get(mm)!.add(r.m.slice(0, 4));
      }
      // Average: total hours / number of years that had data for that month
      const avg = new Map<string, number>();
      for (const [mm, total] of byMM) {
        const nYears = yearsByMM.get(mm)?.size || 1;
        avg.set(mm, Math.round((total / nYears) * 10) / 10);
      }
      return avg;
    });

    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, "0");
      const point: Record<string, string | number> = {
        month: i + 1,
        label: MONTH_LABELS[i],
      };
      periods.forEach((p, pi) => {
        point[p.label] = periodMonthly[pi].get(mm) ?? 0;
      });
      return point;
    });
  }, [raw.artistMonth, filtered.isComparing, filtered.comparisonPeriods]);

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
    const periods = filtered.comparisonPeriods;
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
              {periods.map((p, i) => (
                <Line
                  key={p.label}
                  type="monotone"
                  dataKey={p.label}
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
              interval="preserveStartEnd"
              minTickGap={30}
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
