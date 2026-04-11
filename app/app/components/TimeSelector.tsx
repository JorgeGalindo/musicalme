"use client";

import { useState, useMemo } from "react";
import { useFilter } from "./FilterContext";
import MonthRangeSlider from "./MonthRangeSlider";

export default function TimeSelector() {
  const { raw, filters, setTimeRange, setCompareRange } = useFilter();
  const [showCompare, setShowCompare] = useState(false);

  const isAll = filters.timeRange.type === "all";
  const allMonths = raw.allMonths;

  // Current range indices
  const primaryFrom = filters.timeRange.type === "range" ? filters.timeRange.from : 0;
  const primaryTo = filters.timeRange.type === "range" ? filters.timeRange.to : allMonths.length - 1;

  // Default compare range: first half of data
  const defaultCompareFrom = 0;
  const defaultCompareTo = Math.floor(allMonths.length / 2);

  const compareFrom = filters.compareRange?.from ?? defaultCompareFrom;
  const compareTo = filters.compareRange?.to ?? defaultCompareTo;

  const handleReset = () => {
    setTimeRange({ type: "all" });
    setCompareRange(null);
    setShowCompare(false);
  };

  const handlePrimaryChange = (from: number, to: number) => {
    setTimeRange({ type: "range", from, to });
  };

  const handleCompareChange = (from: number, to: number) => {
    setCompareRange({ from, to });
  };

  const toggleCompare = () => {
    if (showCompare) {
      setCompareRange(null);
      setShowCompare(false);
    } else {
      // If primary is "all", set a default primary range first
      if (isAll) {
        const mid = Math.floor(allMonths.length / 2);
        setTimeRange({ type: "range", from: mid, to: allMonths.length - 1 });
        setCompareRange({ from: 0, to: mid - 1 });
      } else {
        setCompareRange({ from: defaultCompareFrom, to: defaultCompareTo });
      }
      setShowCompare(true);
    }
  };

  if (allMonths.length === 0) return null;

  return (
    <div className="w-full space-y-3">
      {/* Primary row */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={handleReset}
          className={`px-2 py-1 text-[11px] rounded-md transition-colors flex-shrink-0 ${
            isAll && !showCompare
              ? "bg-zinc-100 text-zinc-900"
              : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
          }`}
        >
          Todo
        </button>
        <div className="flex-1 min-w-0">
          <MonthRangeSlider
            months={allMonths}
            from={primaryFrom}
            to={primaryTo}
            onChange={handlePrimaryChange}
            compact
          />
        </div>
      </div>

      {/* Compare toggle + second slider */}
      <div className="flex items-start gap-2 sm:gap-3">
        <button
          onClick={toggleCompare}
          className={`px-2 py-1 text-[11px] rounded-md transition-colors flex-shrink-0 ${
            showCompare
              ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
              : "text-zinc-600 hover:text-zinc-400 border border-zinc-800"
          }`}
        >
          vs
        </button>
        {showCompare && (
          <div className="flex-1 min-w-0">
            <MonthRangeSlider
              months={allMonths}
              from={compareFrom}
              to={compareTo}
              onChange={handleCompareChange}
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
}
