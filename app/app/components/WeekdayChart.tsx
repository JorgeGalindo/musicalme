"use client";

import { useMemo } from "react";
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

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT: Record<string, string> = {
  Monday: "L", Tuesday: "M", Wednesday: "X",
  Thursday: "J", Friday: "V", Saturday: "S", Sunday: "D",
};

const COLORS = ["#60a5fa", "#60a5fa", "#60a5fa", "#60a5fa", "#a78bfa", "#e879f9", "#f472b6"];

const YEAR_COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#2dd4bf", "#34d399",
  "#fbbf24", "#fb923c", "#818cf8",
];

export default function WeekdayChart() {
  const { filtered } = useFilter();

  const comparisonData = useMemo(() => {
    if (!filtered.isComparing) return null;

    const years = filtered.comparisonYears;
    const map = new Map<string, Map<number, number>>();
    for (const r of filtered.weekdayMonth) {
      const year = parseInt(r.m.slice(0, 4));
      if (!years.includes(year)) continue;
      if (!map.has(r.w)) map.set(r.w, new Map());
      const ym = map.get(r.w)!;
      ym.set(year, (ym.get(year) || 0) + r.h);
    }

    return DAY_ORDER.map((d) => {
      const row: Record<string, string | number> = { day: DAY_SHORT[d] };
      const ym = map.get(d);
      for (const y of years) {
        row[String(y)] = Math.round((ym?.get(y) || 0) * 10) / 10;
      }
      return row;
    });
  }, [filtered]);

  const data = useMemo(() => {
    if (filtered.isComparing) return null;
    const map = new Map<string, number>();
    for (const r of filtered.weekdayMonth) {
      map.set(r.w, (map.get(r.w) || 0) + r.h);
    }
    return DAY_ORDER.map((d) => ({
      day: DAY_SHORT[d],
      hours: Math.round((map.get(d) || 0) * 10) / 10,
    }));
  }, [filtered]);

  const tooltipStyle = {
    background: "#18181b",
    border: "1px solid #3f3f46",
    borderRadius: 8,
    fontSize: 12,
  };

  // --- Comparison: lines ---
  if (filtered.isComparing && comparisonData) {
    const years = filtered.comparisonYears;
    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
          Día de la semana
        </h2>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="day"
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#52525b", fontSize: 10 }}
                width={35}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [`${value}h`, ""]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {years.map((y, i) => (
                <Line
                  key={y}
                  type="monotone"
                  dataKey={String(y)}
                  stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4, fill: YEAR_COLORS[i % YEAR_COLORS.length] }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // --- Normal: bars ---
  if (!data) return null;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
        Día de la semana
      </h2>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#52525b", fontSize: 10 }} width={35} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [`${value}h`, ""]}
            />
            <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
