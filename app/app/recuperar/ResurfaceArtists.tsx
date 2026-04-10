"use client";

import { useState } from "react";
import ReviewBadge from "../components/ReviewBadge";

type Artist = {
  artist: string;
  totalHours: number;
  peakPeriod: string;
  lastPlayed: string;
  topSongs: { song: string; plays: number }[];
};

function timeSince(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const then = new Date(y, m - 1);
  const now = new Date();
  const months = (now.getFullYear() - then.getFullYear()) * 12 + now.getMonth() - then.getMonth();
  if (months < 1) return "este mes";
  if (months === 1) return "hace 1 mes";
  if (months < 12) return `hace ${months} meses`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `hace ${years} año${years > 1 ? "s" : ""}`;
  return `hace ${years}a ${rem}m`;
}

export default function ResurfaceArtists({ artists }: { artists: Artist[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {artists.map((a) => {
        const isOpen = expanded === a.artist;
        return (
          <button
            key={a.artist}
            onClick={() => setExpanded(isOpen ? null : a.artist)}
            className={`text-left rounded-xl border p-4 transition-all ${
              isOpen
                ? "bg-zinc-900 border-violet-500/40"
                : "bg-zinc-900/50 border-zinc-800/60 hover:border-zinc-700"
            }`}
          >
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm font-medium text-zinc-200 truncate">
                {a.artist}<ReviewBadge artist={a.artist} />
              </span>
              <span className="text-[10px] text-zinc-600 ml-2 flex-shrink-0">
                {a.totalHours}h
              </span>
            </div>
            <div className="flex gap-3 text-[11px] text-zinc-500">
              <span>pico: {a.peakPeriod}</span>
              <span>·</span>
              <span>{timeSince(a.lastPlayed)}</span>
            </div>

            {isOpen && a.topSongs.length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
                  lo que más escuchabas
                </span>
                <div className="mt-2 space-y-1">
                  {a.topSongs.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-600 w-4 text-right tabular-nums">
                        {i + 1}
                      </span>
                      <span className="text-zinc-300 truncate flex-1">
                        {s.song}
                      </span>
                      <span className="text-zinc-600 tabular-nums">
                        {s.plays}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
