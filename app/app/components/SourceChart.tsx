"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useFilter } from "./FilterContext";

const COLORS = ["#a78bfa", "#e879f9", "#60a5fa", "#34d399", "#fbbf24"];

/**
 * Apple exports multi-device strings like "IPHONE, MACINTOSH".
 * We assign each source string to its primary device.
 */
function normalizeSource(raw: string): string {
  const s = raw.toUpperCase();
  if (s.includes("IPHONE")) return "iPhone";
  if (s.includes("MACINTOSH") || s.includes("MAC")) return "Mac";
  if (s.includes("IPAD")) return "iPad";
  if (s.includes("APPLETV") || s.includes("APPLE TV")) return "Apple TV";
  if (s.includes("WATCH")) return "Watch";
  if (s.includes("ANDROID")) return "Android";
  if (s.includes("WEB")) return "Web";
  return "Otro";
}

export default function SourceChart() {
  const { filtered } = useFilter();

  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered.sourceMonth) {
      const name = normalizeSource(r.src);
      map.set(name, (map.get(name) || 0) + r.h);
    }
    return [...map.entries()]
      .map(([name, hours]) => ({
        name,
        hours: Math.round(hours * 10) / 10,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [filtered.sourceMonth]);

  const total = data.reduce((s, d) => s + d.hours, 0);

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
        Dispositivo
      </h2>
      <div className="h-[180px] flex items-center">
        <ResponsiveContainer width="45%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="hours"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={65}
              paddingAngle={3}
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#18181b",
                border: "1px solid #3f3f46",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [`${value}h`, ""]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2 text-xs">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="text-zinc-300">{d.name}</span>
              <span className="text-zinc-600 tabular-nums">{d.hours}h</span>
              <span className="text-zinc-700 tabular-nums text-[10px]">
                {Math.round((d.hours / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
