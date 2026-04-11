"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useFilter } from "./FilterContext";

const COLORS = ["#a78bfa", "#e879f9", "#60a5fa", "#2dd4bf", "#34d399", "#fbbf24", "#fb923c", "#f472b6", "#818cf8", "#f87171"];

const YEAR_COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#2dd4bf", "#34d399",
  "#fbbf24", "#fb923c", "#818cf8",
];

const COUNTRY_LABELS: Record<string, string> = {
  US: "EEUU", GB: "UK", ES: "España", CA: "Canadá",
  AU: "Australia", DE: "Alemania", FR: "Francia", IT: "Italia",
  SE: "Suecia", CO: "Colombia", MX: "México", AR: "Argentina",
  PR: "Puerto Rico", CU: "Cuba", NZ: "N. Zelanda", JP: "Japón",
  BR: "Brasil", IE: "Irlanda", NL: "P. Bajos", NO: "Noruega",
  London: "UK", Brooklyn: "EEUU", Berlin: "Alemania",
  Portland: "EEUU", England: "UK", Cardiff: "UK",
};

function norm(raw: string): string {
  return COUNTRY_LABELS[raw] || raw;
}

export default function CountryChart() {
  const { raw, filtered, filters, setSelectedCountry } = useFilter();
  const selected = filters.selectedCountry;

  // Helper: compute country hours from artist hours map
  const computeCountryData = (artistHoursMap: Map<string, number>) => {
    const countryHours = new Map<string, { hours: number; rawCountry: string }>();
    for (const entry of raw.artistMeta) {
      if (!entry.country) continue;
      const hours = artistHoursMap.get(entry.a) || 0;
      if (hours <= 0) continue;
      const name = norm(entry.country);
      const prev = countryHours.get(name) || { hours: 0, rawCountry: entry.country };
      prev.hours += hours;
      countryHours.set(name, prev);
    }
    return [...countryHours.entries()]
      .map(([name, v]) => ({ name, rawCountry: v.rawCountry, hours: Math.round(v.hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8);
  };

  // --- Comparison: one donut per period ---
  const comparisonData = useMemo(() => {
    if (!filtered.isComparing) return null;

    return filtered.comparisonPeriods.map((period) => {
      const map = new Map<string, number>();
      for (const r of raw.artistMonth) {
        if (!period.months.has(r.m)) continue;
        map.set(r.a, (map.get(r.a) || 0) + r.h);
      }
      return { label: period.label, data: computeCountryData(map) };
    });
  }, [raw.artistMonth, raw.artistMeta, filtered.isComparing, filtered.comparisonPeriods]);

  // --- Normal mode ---
  const data = useMemo(() => {
    if (filtered.isComparing) return [];
    const artistHoursMap = new Map(filtered.topArtists.map((a) => [a.artist, a.hours]));

    if (filters.selectedArtist) {
      const entry = raw.artistMeta.find((m) => m.a === filters.selectedArtist);
      if (!entry?.country) return [];
      return [{ name: norm(entry.country), rawCountry: entry.country, hours: artistHoursMap.get(filters.selectedArtist) || 0 }];
    }

    return computeCountryData(artistHoursMap);
  }, [raw.artistMeta, filtered.topArtists, filters.selectedArtist, filtered.isComparing]);

  // --- Render comparison: side by side donuts ---
  if (filtered.isComparing && comparisonData) {
    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
          País de origen — comparación
        </h2>
        <div className="flex gap-4 overflow-x-auto">
          {comparisonData.map((pData, pi) => {
            const total = pData.data.reduce((s, d) => s + d.hours, 0);
            return (
              <div key={pData.label} className="flex-1 min-w-[200px]">
                <div className="text-xs font-bold mb-2 text-center" style={{ color: YEAR_COLORS[pi] }}>
                  {pData.label}
                </div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pData.data} dataKey="hours" nameKey="name" cx="50%" cy="50%"
                        innerRadius={30} outerRadius={50} paddingAngle={2} strokeWidth={0}>
                        {pData.data.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11, color: "#a1a1aa" }}
                        formatter={(value) => [`${value}h`, ""]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] mt-1">
                  {pData.data.slice(0, 5).map((d, i) => (
                    <span key={d.name} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-zinc-400">{d.name}</span>
                      <span className="text-zinc-600">{total > 0 ? Math.round((d.hours / total) * 100) : 0}%</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Render normal ---
  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.hours, 0);

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">
        País de origen
      </h2>
      <p className="text-[11px] text-zinc-600 mb-3">click para filtrar</p>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="w-full sm:w-[45%] h-[150px] sm:h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="hours" nameKey="name" cx="50%" cy="50%"
              innerRadius={40} outerRadius={65} paddingAngle={2} strokeWidth={0} cursor="pointer"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={(_: any, idx: number) => { const d = data[idx]; if (d) setSelectedCountry(d.rawCountry); }}
            >
              {data.map((d, i) => (
                <Cell key={d.name} fill={COLORS[i % COLORS.length]}
                  opacity={selected && norm(selected) !== d.name ? 0.2 : 1} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12, color: "#a1a1aa" }}
              formatter={(value) => [`${value}h`, ""]}
            />
          </PieChart>
        </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-1.5 text-xs">
          {data.map((d, i) => (
            <button key={d.name} onClick={() => setSelectedCountry(d.rawCountry)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity text-left">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: COLORS[i % COLORS.length], opacity: selected && norm(selected) !== d.name ? 0.2 : 1 }} />
              <span className="text-zinc-300 truncate">{d.name}</span>
              <span className="text-zinc-600 tabular-nums">{Math.round((d.hours / total) * 100)}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
