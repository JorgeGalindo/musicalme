"use client";

import { useMemo } from "react";
import { useFilter } from "./FilterContext";
import StatCard from "./StatCard";

export default function StatsRow() {
  const { raw, filtered } = useFilter();

  // Comparison: per-year stats
  const yearStats = useMemo(() => {
    if (!filtered.isComparing) return null;

    return filtered.comparisonPeriods.map((period) => {
      const am = raw.artistMonth.filter((r) => period.months.has(r.m));
      const hours = Math.round(am.reduce((s, r) => s + r.h, 0) * 10) / 10;
      const plays = am.reduce((s, r) => s + r.p, 0);
      const artists = new Set(am.map((r) => r.a)).size;
      return { label: period.label, hours, plays, artists };
    });
  }, [raw.artistMonth, filtered.isComparing, filtered.comparisonPeriods]);

  if (yearStats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {yearStats.map((ps) => (
          <StatCard
            key={ps.label}
            label={ps.label}
            value={`${ps.hours.toLocaleString("es-ES")}h`}
            sub={`${ps.plays.toLocaleString("es-ES")} plays · ${ps.artists} artistas`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="Horas"
        value={filtered.totalHours.toLocaleString("es-ES")}
        sub={`${Math.round(filtered.totalHours / 24)} días sin parar`}
      />
      <StatCard
        label="Reproducciones"
        value={filtered.totalPlays.toLocaleString("es-ES")}
      />
      <StatCard
        label="Artistas"
        value={filtered.uniqueArtists.toLocaleString("es-ES")}
      />
      <StatCard
        label="Canciones"
        value={filtered.uniqueSongs.toLocaleString("es-ES")}
      />
    </div>
  );
}
