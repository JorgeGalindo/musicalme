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

const COLORS = [
  "#3f3f46", "#52525b", "#71717a", "#a1a1aa", "#818cf8",
  "#a78bfa", "#c084fc", "#e879f9", "#f472b6",
];

const YEAR_COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#2dd4bf", "#34d399",
  "#fbbf24", "#fb923c", "#818cf8",
];

export default function DecadeChart() {
  const { raw, filtered, filters } = useFilter();

  // --- Comparison: lines per year ---
  const comparisonData = useMemo(() => {
    if (!filtered.isComparing) return null;

    const years = filtered.comparisonYears;

    // Per year: compute decade hours
    const yearDecades = years.map((year) => {
      const prefix = String(year);
      const artistHours = new Map<string, number>();
      for (const r of raw.artistMonth) {
        if (!r.m.startsWith(prefix)) continue;
        artistHours.set(r.a, (artistHours.get(r.a) || 0) + r.h);
      }

      const decadeHours = new Map<string, number>();
      for (const entry of raw.artistMeta) {
        if (!entry.begin) continue;
        const hours = artistHours.get(entry.a) || 0;
        if (hours <= 0) continue;
        const decade = `${Math.floor(entry.begin / 10) * 10}s`;
        decadeHours.set(decade, (decadeHours.get(decade) || 0) + hours);
      }
      return decadeHours;
    });

    // Union of all decades
    const allDecades = new Set<string>();
    for (const yd of yearDecades) {
      for (const d of yd.keys()) allDecades.add(d);
    }
    const decades = [...allDecades].sort();

    return decades.map((decade) => {
      const row: Record<string, string | number> = { decade };
      years.forEach((y, i) => {
        row[String(y)] = Math.round((yearDecades[i].get(decade) || 0) * 10) / 10;
      });
      return row;
    });
  }, [raw.artistMonth, raw.artistMeta, filtered.isComparing, filtered.comparisonYears]);

  // --- Normal mode ---
  const data = useMemo(() => {
    if (filtered.isComparing) return [];

    const artistHoursMap = new Map(filtered.topArtists.map((a) => [a.artist, a.hours]));
    const decadeHours = new Map<string, { hours: number; count: number }>();

    for (const entry of raw.artistMeta) {
      if (!entry.begin) continue;
      if (filters.selectedArtist && entry.a !== filters.selectedArtist) continue;
      const hours = artistHoursMap.get(entry.a) || 0;
      if (hours <= 0) continue;
      const decade = `${Math.floor(entry.begin / 10) * 10}s`;
      const prev = decadeHours.get(decade) || { hours: 0, count: 0 };
      prev.hours += hours;
      prev.count += 1;
      decadeHours.set(decade, prev);
    }

    return [...decadeHours.entries()]
      .map(([decade, v]) => ({ decade, hours: Math.round(v.hours * 10) / 10, count: v.count }))
      .sort((a, b) => a.decade.localeCompare(b.decade));
  }, [raw.artistMeta, filtered.topArtists, filters.selectedArtist, filtered.isComparing]);

  // --- Render comparison: lines ---
  if (filtered.isComparing && comparisonData && comparisonData.length > 0) {
    const years = filtered.comparisonYears;
    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
          Década de origen — comparación
        </h2>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="decade" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#52525b", fontSize: 10 }} width={40} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12, color: "#a1a1aa" }}
                formatter={(value) => [`${value}h`, ""]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {years.map((y, i) => (
                <Line key={y} type="monotone" dataKey={String(y)} stroke={YEAR_COLORS[i]} strokeWidth={2}
                  dot={{ r: 4, fill: YEAR_COLORS[i] }} activeDot={{ r: 6 }} />
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
        Década de origen del artista
      </h2>
      <p className="text-[11px] text-zinc-600 mb-4">horas escuchadas según cuándo empezó el artista</p>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="decade" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#52525b", fontSize: 10 }} width={40} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12, color: "#a1a1aa" }}
              formatter={(value, _name, props) => {
                const p = (props as { payload: { count: number } }).payload;
                return [`${value}h · ${p.count} artistas`, ""];
              }}
            />
            <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[Math.min(i, COLORS.length - 1)]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
