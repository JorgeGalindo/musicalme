"use client";

import { useFilter } from "./FilterContext";

export default function ActiveFilters() {
  const { filters, setSelectedArtist, setSelectedGenre, setSelectedCountry, setTimeRange } = useFilter();

  const chips: { label: string; onClear: () => void }[] = [];

  if (filters.timeRange.type === "month") {
    chips.push({
      label: filters.timeRange.month,
      onClear: () => setTimeRange({ type: "all" }),
    });
  }

  if (filters.selectedArtist) {
    chips.push({
      label: filters.selectedArtist,
      onClear: () => setSelectedArtist(null),
    });
  }

  if (filters.selectedGenre) {
    chips.push({
      label: filters.selectedGenre,
      onClear: () => setSelectedGenre(null),
    });
  }

  if (filters.selectedCountry) {
    chips.push({
      label: filters.selectedCountry,
      onClear: () => setSelectedCountry(null),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-[11px] text-zinc-600 uppercase tracking-wider">
        Filtros
      </span>
      {chips.map((c) => (
        <button
          key={c.label}
          onClick={c.onClear}
          className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-violet-500/25 transition-colors"
        >
          {c.label}
          <span className="text-violet-400">x</span>
        </button>
      ))}
    </div>
  );
}
