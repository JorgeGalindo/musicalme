"use client";

import { useFilter } from "./FilterContext";

export default function TimeSelector() {
  const { raw, filters, setTimeRange, toggleYear } = useFilter();

  const isAll = filters.timeRange.type === "all";
  const activeYears =
    filters.timeRange.type === "years" ? filters.timeRange.years : [];

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <button
        onClick={() => setTimeRange({ type: "all" })}
        className={`px-2 py-1 text-[11px] rounded-md transition-colors ${
          isAll
            ? "bg-zinc-100 text-zinc-900"
            : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
        }`}
      >
        Todo
      </button>
      {raw.allYears.map((y) => {
        const active = activeYears.includes(y);
        return (
          <button
            key={y}
            onClick={() => toggleYear(y)}
            className={`px-2 py-1 text-[11px] rounded-md transition-colors ${
              active
                ? "bg-zinc-100 text-zinc-900"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
            }`}
          >
            {y}
          </button>
        );
      })}
      {activeYears.length >= 2 && (
        <span className="text-[10px] text-violet-400 ml-1">
          comparando {activeYears.length} años
        </span>
      )}
    </div>
  );
}
