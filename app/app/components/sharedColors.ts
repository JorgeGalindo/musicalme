// Consistent colors for shared items across comparison columns.
// Each shared item gets a unique color. Non-shared items stay neutral.

const SHARED_COLORS = [
  { bg: "bg-rose-500/10", border: "border-rose-500/20", text: "text-rose-300" },
  { bg: "bg-sky-500/10", border: "border-sky-500/20", text: "text-sky-300" },
  { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-300" },
  { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-300" },
  { bg: "bg-violet-500/10", border: "border-violet-500/20", text: "text-violet-300" },
  { bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/20", text: "text-fuchsia-300" },
  { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-300" },
  { bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-300" },
];

export function buildSharedColorMap(shared: Set<string>): Map<string, typeof SHARED_COLORS[0]> {
  const map = new Map<string, typeof SHARED_COLORS[0]>();
  let idx = 0;
  for (const key of shared) {
    map.set(key, SHARED_COLORS[idx % SHARED_COLORS.length]);
    idx++;
  }
  return map;
}

export const NEUTRAL = { bg: "", border: "", text: "text-zinc-300" };
