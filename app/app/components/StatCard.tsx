"use client";

export default function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5 flex flex-col gap-1">
      <span className="text-[11px] text-zinc-500 uppercase tracking-widest">
        {label}
      </span>
      <span className="text-3xl font-light tracking-tight tabular-nums">
        {value}
      </span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
    </div>
  );
}
