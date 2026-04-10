"use client";

import { useCallback, useRef, useEffect, useState } from "react";

type Props = {
  months: string[]; // all available months sorted
  from: number;     // index into months[]
  to: number;       // index into months[]
  onChange: (from: number, to: number) => void;
};

function formatMonth(m: string): string {
  const [y, mm] = m.split("-");
  const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${names[parseInt(mm) - 1]} ${y}`;
}

export default function MonthRangeSlider({ months, from, to, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"from" | "to" | null>(null);

  const max = months.length - 1;

  const pct = (idx: number) => (idx / max) * 100;

  const idxFromX = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * max);
    },
    [max]
  );

  const handlePointerDown = (handle: "from" | "to") => (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(handle);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const idx = idxFromX(e.clientX);
      if (dragging === "from") {
        onChange(Math.min(idx, to - 1), to);
      } else {
        onChange(from, Math.max(idx, from + 1));
      }
    },
    [dragging, from, to, onChange, idxFromX]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Year tick marks
  const yearTicks: { idx: number; label: string }[] = [];
  for (let i = 0; i < months.length; i++) {
    if (months[i].endsWith("-01")) {
      yearTicks.push({ idx: i, label: months[i].slice(0, 4) });
    }
  }

  return (
    <div className="select-none">
      <div className="flex justify-between text-xs text-zinc-300 mb-3">
        <span>{formatMonth(months[from])}</span>
        <span className="text-zinc-600">→</span>
        <span>{formatMonth(months[to])}</span>
      </div>
      <div
        ref={trackRef}
        className="relative h-8 cursor-pointer"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Track background */}
        <div className="absolute top-3 left-0 right-0 h-1.5 rounded bg-zinc-800" />

        {/* Active range */}
        <div
          className="absolute top-3 h-1.5 rounded bg-violet-500/60"
          style={{
            left: `${pct(from)}%`,
            width: `${pct(to) - pct(from)}%`,
          }}
        />

        {/* Year ticks */}
        {yearTicks.map((t) => (
          <div
            key={t.label}
            className="absolute top-6 -translate-x-1/2"
            style={{ left: `${pct(t.idx)}%` }}
          >
            <div className="w-px h-2 bg-zinc-700 mx-auto" />
            <span className="text-[9px] text-zinc-600 block text-center mt-0.5">
              {t.label}
            </span>
          </div>
        ))}

        {/* From handle */}
        <div
          className={`absolute top-1.5 w-4 h-4 -translate-x-1/2 rounded-full border-2 cursor-grab ${
            dragging === "from"
              ? "bg-violet-400 border-violet-300 scale-125"
              : "bg-zinc-900 border-violet-400 hover:border-violet-300"
          } transition-transform`}
          style={{ left: `${pct(from)}%` }}
          onPointerDown={handlePointerDown("from")}
        />

        {/* To handle */}
        <div
          className={`absolute top-1.5 w-4 h-4 -translate-x-1/2 rounded-full border-2 cursor-grab ${
            dragging === "to"
              ? "bg-violet-400 border-violet-300 scale-125"
              : "bg-zinc-900 border-violet-400 hover:border-violet-300"
          } transition-transform`}
          style={{ left: `${pct(to)}%` }}
          onPointerDown={handlePointerDown("to")}
        />
      </div>
    </div>
  );
}
